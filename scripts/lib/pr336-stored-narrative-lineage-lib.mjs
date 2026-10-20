import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  NYC_GATE_B_ROW_CCAB_KEYS,
  buildGateBSearchPlaceForRow,
} from '../fixtures/pr336-vk-search-trip-sources.mjs';

const PR336_PRICE_SUFFIX_ROW_IDS = [602, 605, 606, 607, 610, 611];

const GATE_B_ROW_META = {
  602: { name: "Zabar's", cat: 'store' },
  605: { name: 'Strand Book Store', cat: 'store' },
  606: { name: 'Afternoon matinee show', cat: 'activity' },
  607: { name: 'Friend meetup at Bryant Park', cat: 'activity' },
  610: { name: 'Carbone', cat: 'restaurant' },
  611: { name: 'Jazz at Lincoln Center', cat: 'activity' },
};

const OVERLAY_PATH = fileURLToPath(new URL('../fixtures/pr336-gate-b-ccab-overlay.json', import.meta.url));
const BASE_CCAB_PATH = fileURLToPath(new URL('../fixtures/nyc_ccab_place_enrichment.json', import.meta.url));
const SNAPSHOT_PATH = fileURLToPath(new URL('../fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));

const PRICE_SUFFIX_RE = /\bPrice:\s*\$[\d,]+(?:\.\d+)?\s+per person\b/i;
const OVERLAY_INTRO_COMMIT = 'b9f4e3e78ecaf73ddcabaff2400cffd77e712277';

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function overlayDescriptionForCcabKey(ccabKey) {
  const overlay = loadJson(OVERLAY_PATH);
  const base = loadJson(BASE_CCAB_PATH);
  if (overlay[ccabKey]?.description) return text(overlay[ccabKey].description);
  if (base[ccabKey]?.description) return text(base[ccabKey].description);
  return '';
}

function narrativeLineageForRow(rowId) {
  const meta = GATE_B_ROW_META[rowId];
  const ccabKey = NYC_GATE_B_ROW_CCAB_KEYS[rowId];
  if (!meta || !ccabKey) {
    throw new Error(`unsupported gate-b narrative lineage row ${rowId}`);
  }
  const place = buildGateBSearchPlaceForRow({ id: rowId, name: meta.name, cat: meta.cat });
  const description = text(place.description);
  const overlayDesc = overlayDescriptionForCcabKey(ccabKey);
  const snapshot = loadJson(SNAPSHOT_PATH);
  const snapshotDesc = text(snapshot[String(rowId)]?.description);
  return {
    rowId,
    gateBName: meta.name,
    category: meta.cat,
    ccabKey,
    providerBranch: 'stored_fixture_literal',
    enrichmentPipeline: [
      'scripts/fixtures/nyc_ccab_place_enrichment.json',
      'scripts/fixtures/pr336-gate-b-ccab-overlay.json',
      'scripts/fixtures/pr336-gate-b-vk-reviews.json',
      'scripts/fixtures/pr336-vk-search-trip-sources.mjs#ENRICHMENT merge',
      'rawSearchPlaceFromCcab',
      'enrichSearchPlace (src/vacation/trip-thing-enrichment.mjs#sourcedLongDescription)',
      'scripts/fixtures/pr336-vk-search-places.snapshot.json',
    ],
    overlayIntroCommit: OVERLAY_INTRO_COMMIT,
    overlayDescription: overlayDesc,
    builtDescription: description,
    snapshotDescription: snapshotDesc,
    structuredPrice: place.price ?? place.sourceRecord?.price ?? null,
    hasPriceSuffixTemplate: PRICE_SUFFIX_RE.test(description),
    descriptionsAligned: description === overlayDesc && description === snapshotDesc,
  };
}

export function lineageRows() {
  return PR336_PRICE_SUFFIX_ROW_IDS.map((rowId) => narrativeLineageForRow(rowId));
}

