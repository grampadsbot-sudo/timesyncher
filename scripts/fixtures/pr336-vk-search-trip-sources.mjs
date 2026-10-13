import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { enrichSearchPlace } from '../../src/vacation/trip-thing-enrichment.mjs';

const ENRICHMENT = JSON.parse(
  readFileSync(new URL('./nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);

/** Gate B timeline rows → documented NYC ccab search record keys. */
/** PR336 VK search test trip (fixture family for Gate B NYC day-by-day rows). */
export const NYC_PR336_SEARCH_TRIP_ID = '5f03f326-a1b2-4c3d-9e4f-001122334455';

export const NYC_GATE_B_ROW_CCAB_KEYS = {
  601: 'Flight option: JetBlue LAS-JFK 2026-06-23 07:22-15:31',
  602: "Zabar's",
  603: 'Motto by Hilton New York City Times Square',
  604: 'Chelsea Market',
  605: 'Strand Book Store',
  606: 'Whole Foods Market Columbus Circle',
  607: 'Whole Foods Market Upper West Side',
  608: 'The Manhattan Club',
  609: 'Priceline opaque JFK — Standard sedan',
  610: 'Juice Generation Columbus Circle',
  611: 'MoMA Design Store - 53rd Street',
};

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
    source: 'brave',
    title: text(title, 240),
    category: resolvedCategory,
    lat: ccabRecord.lat ?? null,
    lng: ccabRecord.lng ?? null,
    address: text(ccabRecord.address, 240),
    url: text(ccabRecord.website, 500),
    externalId: text(ccabKey, 240),
    sourceRecord: {
      ...ccabRecord,
      source: 'brave',
      url: text(ccabRecord.website, 500),
    },
  };
}

export function buildGateBSearchPlaceForRow({ id, name, cat }) {
  const ccabKey = NYC_GATE_B_ROW_CCAB_KEYS[id];
  const ccabRecord = ccabKey ? ENRICHMENT[ccabKey] : null;
  if (!ccabRecord) {
    throw new Error(`missing ccab search source for gate-b row ${id} (${name})`);
  }
  return enrichSearchPlace(rawSearchPlaceFromCcab({
    title: name,
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

/** Six typed examples with priced ccab sources for the search output contract. */
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
