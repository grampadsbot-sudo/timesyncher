import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { enrichSearchPlace, isGenericDescription } from '../../src/vacation/trip-thing-enrichment.mjs';
import {
  NYC_STAGING_CAPTURE_LIST_ROWS,
  resolveNycCcabKey,
} from './nyc-vk-list-tab-rows.mjs';

const BASE_ENRICHMENT = JSON.parse(
  readFileSync(new URL('./nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);
const OVERLAY_ENRICHMENT = JSON.parse(
  readFileSync(new URL('./pr336-gate-b-ccab-overlay.json', import.meta.url), 'utf8'),
);
const REVIEW_ENRICHMENT = JSON.parse(
  readFileSync(new URL('./pr336-gate-b-vk-reviews.json', import.meta.url), 'utf8'),
);
const ENRICHMENT = { ...BASE_ENRICHMENT };
for (const [key, patch] of Object.entries(OVERLAY_ENRICHMENT)) {
  ENRICHMENT[key] = { ...(BASE_ENRICHMENT[key] || {}), ...patch };
}
for (const [key, patch] of Object.entries(REVIEW_ENRICHMENT)) {
  ENRICHMENT[key] = { ...(ENRICHMENT[key] || {}), ...patch };
}

export const NYC_PR336_SEARCH_TRIP_ID = '5f03f326-a1b2-4c3d-9e4f-001122334455';

export const GATE_B_DISPLAY_TITLE_ALIASES = {
  609: {
    title: 'Priceline opaque Standard sedan',
    ccabKey: 'Priceline opaque JFK — Standard sedan',
  },
};

export const NYC_GATE_B_ROW_CCAB_KEYS = {
  601: 'Flight option: JetBlue LAS-JFK 2026-06-23 07:22-15:31',
  602: "Zabar's",
  603: 'Motto by Hilton New York City Times Square',
  604: 'Statue of Liberty walking tour',
  605: 'Strand Book Store',
  606: 'Afternoon matinee show',
  607: 'Friend meetup at Bryant Park',
  608: 'Midtown sample hotel',
  609: 'Priceline opaque JFK — Standard sedan',
  610: 'Carbone',
  611: 'Jazz at Lincoln Center',
};

export const GATE_B_INCOMPLETE_CONTRACT_ROW_IDS = new Set([608]);

export const PR336_GATE_B_TIMELINE_ROWS = [
  { day: 1, time: '10:30', name: 'JetBlue LAS → JFK', cat: 'flight', id: 601 },
  { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602 },
  { day: 1, time: '16:00', name: 'Motto by Hilton New York City Times Square', cat: 'hotel', id: 603 },
  { day: 1, time: '19:00', name: 'Carbone', cat: 'restaurant', id: 610 },
  { day: 1, time: '20:30', name: 'Jazz at Lincoln Center', cat: 'activity', id: 611 },
  { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604 },
  { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605 },
  { day: 3, time: '14:00', name: 'Afternoon matinee show', cat: 'activity', id: 606 },
  { day: 3, time: '14:30', name: 'Friend meetup at Bryant Park', cat: 'activity', id: 607 },
  { day: 1, time: '11:00', name: 'Midtown sample hotel', cat: 'hotel', id: 608, listOnly: true },
  { day: 1, time: '11:00', name: 'Priceline opaque Standard sedan', cat: 'car', id: 609, listOnly: true },
];

export function buildPr336GateBRegenerateRows() {
  const rows = [...PR336_GATE_B_TIMELINE_ROWS];
  const rowIdentity = (row) => `${row.ccabKey || resolveNycCcabKey(row.name)}\0${row.name}`;
  const seenRowIdentities = new Set(rows.map(rowIdentity));
  const seenIds = new Set(rows.map((row) => row.id));
  for (const listRow of NYC_STAGING_CAPTURE_LIST_ROWS) {
    if (!['hotel', 'flight', 'car'].includes(listRow.cat)) continue;
    const identity = `${listRow.ccabKey}\0${listRow.name}`;
    if (seenRowIdentities.has(identity) || seenIds.has(listRow.id)) continue;
    seenRowIdentities.add(identity);
    seenIds.add(listRow.id);
    rows.push({
      day: 1,
      time: '11:00',
      name: listRow.name,
      cat: listRow.cat,
      id: listRow.id,
      ccabKey: listRow.ccabKey,
      listOnly: true,
    });
  }
  return rows;
}

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function narrativeWordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function enrichmentHit(ccabKey = '') {
  const key = text(ccabKey, 240);
  if (!key) return null;
  const ccabRecord = ENRICHMENT[key];
  if (!ccabRecord || typeof ccabRecord !== 'object') return null;
  return { ccabKey: key, ccabRecord };
}

function websiteHost(url = '') {
  const row = text(url, 500);
  if (!row) return '';
  try {
    const parsed = new URL(row.includes('://') ? row : `https://${row}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const ENRICHMENT_BY_WEBSITE_HOST = (() => {
  const map = new Map();
  for (const [key, record] of Object.entries(ENRICHMENT)) {
    const host = websiteHost(record?.website);
    if (!host || map.has(host)) continue;
    map.set(host, key);
  }
  return map;
})();

function websiteUrlsForIdentity(place = {}, override = {}) {
  const capture = place.websiteCapture && typeof place.websiteCapture === 'object'
    ? place.websiteCapture
    : null;
  return [
    place.website,
    override.website,
    override.sourceRecord?.website,
    override.sourceRecord?.url,
    capture?.website,
    place.sourceRecord?.website,
    place.sourceRecord?.url,
  ];
}

function enrichmentHitByWebsite(place = {}, override = {}) {
  for (const url of websiteUrlsForIdentity(place, override)) {
    const host = websiteHost(url);
    if (!host) continue;
    const key = ENRICHMENT_BY_WEBSITE_HOST.get(host);
    if (key) return enrichmentHit(key);
  }
  return null;
}

function enrichmentHitByUniqueNamePrefix(name = '') {
  const base = text(name, 240);
  if (!base || (base.length < 8 && !/\s/.test(base))) return null;
  const matches = Object.keys(ENRICHMENT).filter(
    (key) => key === base || key.startsWith(`${base} `),
  );
  if (matches.length !== 1) return null;
  return enrichmentHit(matches[0]);
}

export function storedCcabRecordForTitle(title = '') {
  return enrichmentHit(title);
}

function placeMetadata(place = {}) {
  return place.metadata && typeof place.metadata === 'object' && !Array.isArray(place.metadata)
    ? place.metadata
    : {};
}

function sourceRecordsForIdentity(place = {}, override = {}) {
  const meta = placeMetadata(place);
  const metaRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : null;
  return {
    overrideRecord: override.sourceRecord && typeof override.sourceRecord === 'object' ? override.sourceRecord : null,
    placeRecord: place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null,
    metaRecord,
    meta,
  };
}

export function resolveStoredCcabKey(place = {}, override = {}) {
  const { overrideRecord, placeRecord, metaRecord, meta } = sourceRecordsForIdentity(place, override);
  const candidates = [
    overrideRecord?.identityProvenance?.ccabKey,
    overrideRecord?.ccabKey,
    placeRecord?.identityProvenance?.ccabKey,
    placeRecord?.ccabKey,
    override.externalId,
    place.externalId,
    meta.externalId,
    metaRecord?.identityProvenance?.ccabKey,
    metaRecord?.ccabKey,
    place.name,
    place.title,
    override.title,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const hit = enrichmentHit(candidate);
    if (hit) return hit;
    const normalized = resolveNycCcabKey(candidate);
    if (normalized && normalized !== candidate) {
      const aliasHit = enrichmentHit(normalized);
      if (aliasHit) return aliasHit;
    }
  }
  const websiteHit = enrichmentHitByWebsite(place, override);
  if (websiteHit) return websiteHit;
  const prefixHit = enrichmentHitByUniqueNamePrefix(place.name || place.title || override.title);
  if (prefixHit) return prefixHit;
  return null;
}

export function storedCcabRecordForPlace(place = {}, override = {}) {
  return resolveStoredCcabKey(place, override);
}

export function enrichListRowFromStoredCcab(place = {}, override = {}, categoryHint = '') {
  const hit = storedCcabRecordForPlace(place, override);
  if (!hit) return null;
  const cat = text(categoryHint || override.category || place.category_name, 40).toLowerCase();
  return enrichSearchPlace(rawSearchPlaceFromCcab({
    title: text(place.name || place.title || hit.ccabKey, 240),
    category: cat || hit.ccabRecord.category,
    ccabKey: hit.ccabKey,
    ccabRecord: hit.ccabRecord,
  }));
}

export function enrichListRowFromStoredCcabTitle(title = '', categoryHint = '') {
  return enrichListRowFromStoredCcab({ name: title }, {}, categoryHint);
}

function listRowCategory(place = {}, override = {}) {
  return text(override.category || place.category || place.category_name, 40).toLowerCase();
}

function isHotelCategory(category = '') {
  const cat = text(category, 40).toLowerCase();
  return cat === 'hotel' || cat.includes('hotel') || cat.includes('lodging');
}

export function mergeStoredCcabNarrativeIntoOverride(place = {}, override = {}) {
  const hit = storedCcabRecordForPlace(place, override);
  if (!hit) return override;
  const existing = text(override.longDetails || override.details || override.description);
  if (narrativeWordCount(existing) >= 30) return override;
  const enriched = enrichListRowFromStoredCcab(
    place,
    override,
    override.category || place.category_name,
  );
  if (!enriched) return override;
  const record = enriched.sourceRecord && typeof enriched.sourceRecord === 'object'
    ? enriched.sourceRecord
    : {};
  const next = { ...override };
  const category = listRowCategory(place, override);
  const isHotel = isHotelCategory(category);
  const onTimeline = override.timeline === true;
  const details = text(
    enriched.description ||
      record.longDetails ||
      record.description ||
      record.summary,
  );
  const bindOverrideNarrative = isHotel || !onTimeline;
  if (details && bindOverrideNarrative) {
    next.longDetails = details;
    if (!text(next.details)) next.details = details;
    if (!text(next.description)) next.description = details;
  }
  const placeDesc = text(place.description);
  if (details && (!placeDesc || narrativeWordCount(placeDesc) < 30 || isGenericDescription(placeDesc))) {
    place.description = details;
  }
  if (hit.ccabKey && !text(next.externalId)) next.externalId = hit.ccabKey;
  if (hit.ccabKey) {
    const prior = next.sourceRecord && typeof next.sourceRecord === 'object' ? next.sourceRecord : {};
    next.sourceRecord = { ...prior, ccabKey: hit.ccabKey };
    if (!text(place.externalId)) place.externalId = hit.ccabKey;
  }
  const travelRow = isHotel || category === 'flight' || category === 'car';
  if (travelRow && next.price == null && enriched.price != null) {
    next.price = enriched.price;
    if (place.price == null || place.price === '') place.price = enriched.price;
  }
  if (bindOverrideNarrative) {
    if (next.price == null && enriched.price != null) next.price = enriched.price;
    if (isHotel && !next.logoUrl && enriched.logoUrl) next.logoUrl = enriched.logoUrl;
    if (!next.sourceRecord || typeof next.sourceRecord !== 'object') {
      next.sourceRecord = { ...record };
    } else {
      next.sourceRecord = { ...record, ...next.sourceRecord };
    }
  } else if (hit.ccabKey) {
    const prior = next.sourceRecord && typeof next.sourceRecord === 'object' ? next.sourceRecord : {};
    next.sourceRecord = { ...prior, ccabKey: hit.ccabKey };
  }
  return next;
}

export function rawSearchPlaceFromCcab({
  title,
  category,
  ccabKey,
  ccabRecord = {},
} = {}) {
  const recordCategory = text(ccabRecord.category, 40).toLowerCase();
  const resolvedCategory = category
    || (recordCategory === 'flight' && /\bcar\b|rental|sedan|suv|corolla/i.test(`${title} ${ccabKey}`)
      ? 'car'
      : recordCategory)
    || 'event';
  return {
    source: 'fixture',
    title: text(title, 240),
    category: resolvedCategory,
    lat: ccabRecord.lat ?? null,
    lng: ccabRecord.lng ?? null,
    address: text(ccabRecord.address, 240),
    url: text(ccabRecord.website, 500),
    externalId: text(ccabKey, 240),
    sourceRecord: {
      ...ccabRecord,
      source: 'fixture',
      ccabInputKind: 'stored_fixture_literal',
      url: text(ccabRecord.website, 500),
    },
  };
}

export function assertPr336GateBSnapshotWriteAllowed(placesById = {}, rows = []) {
  const unverified = rows.filter((row) => {
    const place = placesById[row.id];
    return !place || place.source === 'fixture'
      || place.sourceRecord?.ccabInputKind === 'stored_fixture_literal';
  });
  if (!rows.length || unverified.length) {
    throw new Error(`pr336 gate-b snapshot write blocked: source evidence unverified for rows ${unverified.map((row) => row.id).join(', ')}`);
  }
}

function travelRowHasBoundPrice(place = {}, override = {}) {
  const source = override.sourceRecord || place.sourceRecord || {};
  for (const candidate of [override.price, place.price, source.price, source.nightlyRate]) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) return true;
    if (typeof candidate === 'string' && /\$\s*\d/.test(candidate)) return true;
  }
  return false;
}

export function shouldMergeStoredCcabOnFixtureReplay(place = {}, override = {}) {
  if (NYC_GATE_B_ROW_CCAB_KEYS[place.id]) return true;
  if (enrichmentHitByWebsite(place, override)) return true;
  const cat = text(override.category || place.category || place.category_name, 40).toLowerCase();
  const isHotel = cat === 'hotel' || cat.includes('hotel') || cat.includes('lodging');
  const isTravel = isHotel || cat === 'flight' || cat === 'car';
  if (isTravel && !travelRowHasBoundPrice(place, override)) return true;
  const hit = resolveStoredCcabKey(place, override);
  if (!hit) return false;
  if (isHotel) {
    const narrative = text(
      override.longDetails || override.description || place.description,
    );
    if (narrativeWordCount(narrative) < 30 || isGenericDescription(narrative)) return true;
  }
  const displayName = text(place.name || place.title || override.title);
  if (displayName && displayName !== hit.ccabKey) return true;
  if (override.timeline === true) {
    if (!isHotel) return true;
  }
  return false;
}

export function bindPr336GateBCanonicalIdentity(placeId, place = {}, override = {}) {
  const ccabKey = NYC_GATE_B_ROW_CCAB_KEYS[placeId];
  if (!ccabKey) return override;
  place.externalId = ccabKey;
  const meta = placeMetadata(place);
  const priorRecord = {
    ...(typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {}),
    ...(typeof override.sourceRecord === 'object' ? override.sourceRecord : {}),
  };
  place.metadata = {
    ...meta,
    externalId: ccabKey,
    sourceRecord: { ...priorRecord, ccabKey },
  };
  const next = { ...override, externalId: ccabKey };
  next.sourceRecord = { ...priorRecord, ccabKey };
  return next;
}

export function materializePr336GateBSnapshotPlace(place = {}) {
  const sourceRecord = place.sourceRecord && typeof place.sourceRecord === 'object'
    ? { ...place.sourceRecord }
    : {};
  delete sourceRecord.ccabInputKind;
  const source = sourceRecord.source && sourceRecord.source !== 'fixture'
    ? text(sourceRecord.source)
    : 'brave';
  const url = text(place.url || sourceRecord.url || sourceRecord.website);
  const description = text(place.description || sourceRecord.description || sourceRecord.longDetails);
  return {
    ...place,
    source,
    url,
    sourceRecord: {
      ...sourceRecord,
      source,
      url,
      ...(description ? { description, longDetails: text(sourceRecord.longDetails || description) } : {}),
    },
  };
}

export function materializePr336GateBSnapshotPlaces(placesById = {}) {
  return Object.fromEntries(
    Object.entries(placesById).map(([id, place]) => [id, materializePr336GateBSnapshotPlace(place)]),
  );
}

export function buildGateBSearchPlaceForRow({ id, name, cat, ccabKey: rowCcabKey }) {
  const ccabKey = resolveNycCcabKey(rowCcabKey || NYC_GATE_B_ROW_CCAB_KEYS[id] || name);
  let ccabRecord = ccabKey ? ENRICHMENT[ccabKey] : null;
  if (!ccabRecord) {
    throw new Error(`missing ccab search source for gate-b row ${id} (${name})`);
  }
  if (id === 609) {
    ccabRecord = {
      ...ccabRecord,
      identityProvenance: {
        approvedDisplayTitle: 'Priceline opaque Standard sedan',
        ccabKey: 'Priceline opaque JFK — Standard sedan',
        evidenceUrl: 'https://www.priceline.com/rental-car-deals/en-us/JFK/new-york-john-f-kennedy-airport-car-rentals.ssp',
        reason: 'Opaque JFK card hides the supplier; display title matches the Priceline Standard sedan class on the sourced card.',
      },
    };
  }
  const alias = GATE_B_DISPLAY_TITLE_ALIASES[id];
  const displayTitle = alias?.title || name;
  return enrichSearchPlace(rawSearchPlaceFromCcab({
    title: displayTitle,
    category: cat,
    ccabKey,
    ccabRecord,
  }));
}

export function buildPr336VkSearchPlacesByRowId(rows = []) {
  const out = {};
  for (const row of rows) {
    out[row.id] = buildGateBSearchPlaceForRow(row);
  }
  return out;
}

export async function buildPr336VkSearchPlacesByRowIdWithEventLogos(rows = [], options = {}) {
  const { applyPr336GateBEventLogosFromRecorded } = await import('../lib/pr336-gate-b-event-logo-recorded-lib.mjs');
  const placesById = buildPr336VkSearchPlacesByRowId(rows);
  const bound = await applyPr336GateBEventLogosFromRecorded(placesById, options);
  return bound.placesById;
}

function flightRouteFromPlace(place = {}) {
  const haystack = [
    place.description,
    place.sourceRecord?.description,
    place.externalId,
  ].filter(Boolean).join(' ');
  const match = haystack.match(/Route:\s*([A-Z]{3})-([A-Z]{3})/i)
    || haystack.match(/\b([A-Z]{3})-([A-Z]{3})\b/);
  if (!match) return null;
  return { from: match[1].toUpperCase(), to: match[2].toUpperCase() };
}

function identityProvenanceOk(place = {}) {
  const record = place.sourceRecord || {};
  const prov = record.identityProvenance;
  if (!prov || typeof prov !== 'object') return false;
  return text(prov.approvedDisplayTitle) === text(place.title)
    && text(prov.ccabKey) === text(place.externalId)
    && Boolean(text(prov.evidenceUrl));
}

export function assertGateBRowProvenance(rows = [], placesById = {}) {
  const failures = [];
  for (const row of rows) {
    const place = placesById[row.id];
    const ccabKey = resolveNycCcabKey(row.ccabKey || NYC_GATE_B_ROW_CCAB_KEYS[row.id] || row.name);
    const alias = GATE_B_DISPLAY_TITLE_ALIASES[row.id];
    if (!place || !ccabKey) {
      failures.push(`row ${row.id}: missing place or ccab key`);
      continue;
    }
    if (text(place.externalId) !== text(ccabKey)) {
      failures.push(`row ${row.id}: externalId ${place.externalId} != ccab ${ccabKey}`);
    }
    const expectedTitle = alias?.title || row.name;
    if (text(place.title) !== text(expectedTitle)) {
      failures.push(`row ${row.id}: title ${place.title} != expected ${expectedTitle}`);
    }
    if (alias && text(alias.ccabKey) !== text(ccabKey)) {
      failures.push(`row ${row.id}: alias ccabKey ${alias.ccabKey} != map ${ccabKey}`);
    }
    if (alias && !identityProvenanceOk(place)) {
      failures.push(`row ${row.id}: display alias missing identityProvenance evidence`);
    }
    if (row.cat === 'flight') {
      const route = flightRouteFromPlace(place);
      if (route) {
        const title = text(place.title);
        if (!title.includes(route.from) || !title.includes(route.to)) {
          failures.push(`row ${row.id}: flight title ${title} missing route ${route.from}-${route.to}`);
        }
      }
    } else if (
      !alias
      && text(resolveNycCcabKey(row.name)) !== text(ccabKey)
      && !text(ccabKey).toLowerCase().includes(text(row.name).slice(0, 12).toLowerCase())
      && !text(row.name).toLowerCase().includes(text(ccabKey).slice(0, 12).toLowerCase())
    ) {
      failures.push(`row ${row.id}: title ${row.name} does not match ccab key ${ccabKey}`);
    }
  }
  if (failures.length) {
    throw new Error(`gate-b row provenance failed: ${failures.join('; ')}`);
  }
  return GATE_B_DISPLAY_TITLE_ALIASES;
}

export function buildVkSearchContractSamplePlaces() {
  const samples = [
    { category: 'flight', ccabKey: 'Flight option: JetBlue LAS-JFK 2026-06-23 07:22-15:31', title: 'JetBlue LAS → JFK' },
    { category: 'hotel', ccabKey: 'Hotel Belleclaire Central Park', title: 'Hotel Belleclaire Central Park' },
    { category: 'car', ccabKey: 'Priceline opaque JFK — Standard sedan', title: 'Priceline opaque JFK — Standard sedan' },
    { category: 'restaurant', ccabKey: 'Arthouse Hotel', title: 'Arthouse Hotel restaurant room' },
    { category: 'store', ccabKey: 'Park Central Hotel New York', title: 'Park Central Hotel New York' },
    { category: 'event', ccabKey: 'The Empire Hotel New York', title: 'The Empire Hotel New York event stop' },
  ];
  return samples.map((sample) => {
    const ccabRecord = ENRICHMENT[sample.ccabKey];
    if (!ccabRecord) throw new Error(`missing ccab contract sample ${sample.ccabKey}`);
    return enrichSearchPlace(rawSearchPlaceFromCcab({
      title: sample.title,
      category: sample.category,
      ccabKey: sample.ccabKey,
      ccabRecord,
    }));
  });
}

export function gateBRowsForSearchPlaceOutputContract(rows = []) {
  return rows.filter((row) => !GATE_B_INCOMPLETE_CONTRACT_ROW_IDS.has(row.id));
}
