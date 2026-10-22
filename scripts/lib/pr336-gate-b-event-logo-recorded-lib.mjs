import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { enrichSearchPlacesWithEventLogos, eventLogoSearchQuery } from '../../src/vacation/search-event-logo.mjs';
import { searchProductCategoryFromPlace } from '../../src/vacation/xai-grok-place-ratings-helpers.mjs';
import {
  PR336_GATE_B_EVENT_LOGO_ROW_IDS,
  PR336_GATE_B_EVENT_LOGO_TARGETS,
} from '../fixtures/pr336-gate-b-event-logo-targets.mjs';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url));
const EVENT_LOGO_RECORDED_DIR = join(FIXTURES_DIR, 'tavily-event-logo-pr336-gate-b-recorded');

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function ensureRecordedDir() {
  mkdirSync(EVENT_LOGO_RECORDED_DIR, { recursive: true });
}

export function slugifyEventLogoRecordedName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'event';
}

export function listRecordedEventLogoResponses() {
  ensureRecordedDir();
  return readdirSync(EVENT_LOGO_RECORDED_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

export function readRecordedEventLogoResponse(fileName) {
  const raw = readFileSync(join(EVENT_LOGO_RECORDED_DIR, fileName), 'utf8');
  return JSON.parse(raw);
}

export function writeRecordedEventLogoResponse({ fileName, body }) {
  ensureRecordedDir();
  const path = join(EVENT_LOGO_RECORDED_DIR, fileName);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return path;
}

function normalizeQueryKey(query = '') {
  return text(query, 320).toLowerCase();
}

export function latestEventLogoRecordingByCcabKey(recordings = listRecordedEventLogoResponses()) {
  const byKey = new Map();
  for (const fileName of recordings) {
    const recorded = readRecordedEventLogoResponse(fileName);
    const ccabKey = recorded.ccabKey;
    if (!ccabKey) continue;
    const prev = byKey.get(ccabKey);
    if (!prev || String(recorded.fetchedAt || '') >= String(prev.recorded.fetchedAt || '')) {
      byKey.set(ccabKey, { fileName, recorded });
    }
  }
  return byKey;
}

export function buildRecordedEventLogoSearchImpl(recordingsByCcabKey = latestEventLogoRecordingByCcabKey()) {
  const byQuery = new Map();
  for (const { recorded } of recordingsByCcabKey.values()) {
    const query = text(recorded.query, 320);
    if (query) byQuery.set(normalizeQueryKey(query), recorded.tavilyResponse || { results: [] });
  }
  return async (query) => {
    const hit = byQuery.get(normalizeQueryKey(query));
    if (hit) return hit;
    return { results: [] };
  };
}

function stripEventLogoFields(place = {}) {
  const next = { ...place };
  delete next.logoUrl;
  delete next.url;
  const sourceRecord = next.sourceRecord && typeof next.sourceRecord === 'object'
    ? { ...next.sourceRecord }
    : {};
  delete sourceRecord.logoUrl;
  delete sourceRecord.website;
  delete sourceRecord.url;
  delete sourceRecord.logoSearchEvidence;
  delete sourceRecord.logoSearchBlocked;
  const missing = new Set(Array.isArray(sourceRecord.missingFields) ? sourceRecord.missingFields : []);
  missing.delete('logoUrl');
  if (missing.size) sourceRecord.missingFields = [...missing];
  else delete sourceRecord.missingFields;
  next.sourceRecord = sourceRecord;
  return next;
}

export async function applyPr336GateBEventLogosFromRecorded(placesById = {}, {
  destination = 'New York',
  searchImpl = buildRecordedEventLogoSearchImpl(),
} = {}) {
  const logoTargetByRowId = new Map(
    PR336_GATE_B_EVENT_LOGO_TARGETS.map((target) => [target.rowId, target]),
  );
  const rowIds = [...PR336_GATE_B_EVENT_LOGO_ROW_IDS].filter((id) => placesById[id]);
  const stripped = rowIds.map((id) => {
    const place = stripEventLogoFields(placesById[id]);
    const target = logoTargetByRowId.get(id);
    if (!target?.title) return place;
    return { ...place, title: text(target.title, 240) };
  });
  const { places: enriched } = await enrichSearchPlacesWithEventLogos(stripped, {
    destination,
    searchImpl,
  });
  const out = { ...placesById };
  enriched.forEach((place, index) => {
    const id = rowIds[index];
    const displayTitle = text(placesById[id]?.title, 240);
    out[id] = displayTitle ? { ...place, title: displayTitle } : place;
  });
  return {
    placesById: out,
    sources: PR336_GATE_B_EVENT_LOGO_TARGETS.map((target) => {
      const place = out[target.rowId];
      const query = eventLogoSearchQuery(target.title, destination);
      const evidence = place?.sourceRecord?.logoSearchEvidence;
      return {
        rowId: target.rowId,
        ccabKey: target.ccabKey,
        query,
        logoUrl: text(place?.logoUrl || place?.sourceRecord?.logoUrl),
        logoSearchBlocked: place?.sourceRecord?.logoSearchBlocked || null,
        logoSearchEvidence: evidence || null,
        category: searchProductCategoryFromPlace(place),
      };
    }),
  };
}
