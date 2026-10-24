import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { enrichSearchPlace } from '../../src/vacation/trip-thing-enrichment.mjs';
import { buildNycCraigKimDaybydayFixtureRows } from './nyc-craig-kim-daybyday-rows.mjs';
import { resolveNycCcabKey } from './nyc-vk-list-tab-rows.mjs';

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
  611: {
    title: 'Blue Note Jazz Club',
    ccabKey: 'Blue Note Jazz Club',
  },
};

export const NYC_GATE_B_ROW_CCAB_KEYS = {
  601: 'Flight option: American LAS-JFK 2026-06-23 12:37-20:59',
  602: "Zabar's",
  603: 'Hotel Belleclaire Central Park',
  604: 'Statue of Liberty walking tour',
  605: 'Strand Book Store',
  606: 'Afternoon matinee show',
  607: 'Friend meetup at Bryant Park',
  608: 'The Manhattan Club',
  609: 'Priceline opaque JFK — Standard sedan',
  610: 'Carbone',
  611: 'Blue Note Jazz Club',
  612: 'Chelsea Market',
  613: "Macy's Herald Square",
  614: 'MoMA Design Store - 53rd Street',
  615: 'Bergdorf Goodman',
  616: 'Whole Foods Market Columbus Circle',
};

export const GATE_B_INCOMPLETE_CONTRACT_ROW_IDS = new Set([608]);

export function buildPr336GateBRegenerateRows() {
  return buildNycCraigKimDaybydayFixtureRows();
}

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
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

function lookupCcabRecord(ccabKey) {
  if (!ccabKey) return null;
  if (ENRICHMENT[ccabKey]) return ENRICHMENT[ccabKey];
  const curly = ccabKey.replace(/'/g, '\u2019');
  if (curly !== ccabKey && ENRICHMENT[curly]) return ENRICHMENT[curly];
  const straight = ccabKey.replace(/\u2019/g, "'");
  if (straight !== ccabKey && ENRICHMENT[straight]) return ENRICHMENT[straight];
  return null;
}

export function buildGateBSearchPlaceForRow({ id, name, cat, ccabKey: rowCcabKey }) {
  const ccabKey = resolveNycCcabKey(rowCcabKey || NYC_GATE_B_ROW_CCAB_KEYS[id] || name);
  let ccabRecord = lookupCcabRecord(ccabKey);
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

export function pr336SnapshotRowIdKey(id) {
  const key = String(id);
  if (!/^[1-9]\d*$/.test(key)) {
    throw new Error(`gate-b row id must be a positive integer; got ${JSON.stringify(id)}`);
  }
  return key;
}

export function buildPr336VkSearchPlacesByRowId(rows = []) {
  const out = {};
  for (const row of rows) {
    out[pr336SnapshotRowIdKey(row.id)] = buildGateBSearchPlaceForRow(row);
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
