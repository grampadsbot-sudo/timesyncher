#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { braveAddress, bravePlaceSearchRows, bravePoint, braveTitle, trimBraveResultEvidence } from '../src/vacation/brave-place-query.mjs';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';
import { urlIsNominatim } from './intake-lodging-test-hosts.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/intake-lodging-brave/', import.meta.url));
const HYATT_LAT = 20.9124823;
const HYATT_LNG = -156.6916397;
const KIHEI_LAT = 20.7174725;
const KIHEI_LNG = -156.4450036;

function loadFixture(name) {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, 'utf8'));
}

function nominatimFetch(handler) {
  return async (url, options) => {
    const href = String(url);
    if (urlIsNominatim(href)) return handler(href, options);
    throw new Error(`unexpected fetch ${href}`);
  };
}

function mockDb(tripId) {
  const tripThings = [];
  const turns = new Map();
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (sql.includes('from trip_things') && sql.includes('order by')) {
      return tripThings.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        description: row.description || '',
        metadata: row.metadata || {},
        location: row.location || {},
      }));
    }
    if (sql.includes('update trip_things') && sql.includes('set category')) {
      const rowId = values.find((value) => tripThings.some((row) => row.id === value))
        || values.find((value) => String(value).startsWith('stale-'));
      const row = tripThings.find((item) => item.id === rowId);
      if (row) {
        const locationRaw = values.find((value) => typeof value === 'string' && value.includes('"lat"'));
        if (locationRaw) row.location = JSON.parse(locationRaw);
        const metaRaw = values.find((value) => value && typeof value === 'object' && !Array.isArray(value) && (value.addressSource || value.sourceRef));
        if (metaRaw) row.metadata = metaRaw;
        const source = values.find((value) => value === 'brave' || value === 'osm');
        if (source) row.source = source;
      }
      return [];
    }
    if (sql.includes('delete from trip_things')) {
      const title = values.find((value) => typeof value === 'string' && /Hyatt|Kihei/i.test(value));
      const scopedTrip = values.find((value) => value === tripId);
      if (scopedTrip && title) {
        const next = tripThings.filter((row) => !(row.trip_id === tripId && row.title.toLowerCase() === title.toLowerCase() && row.metadata?.source === 'customer_stated'));
        tripThings.length = 0;
        tripThings.push(...next);
      }
      return [];
    }
    if (sql.includes('insert into trip_things')) {
      const viaInsertTripThing = sql.includes('source_request_id');
      const category = viaInsertTripThing ? values[2] : values[1];
      const title = viaInsertTripThing ? values[4] : values[2];
      const locationRaw = viaInsertTripThing ? values[10] : '{}';
      const location = typeof locationRaw === 'string' ? JSON.parse(locationRaw) : (locationRaw || {});
      const metaRaw = viaInsertTripThing ? values[13] : {};
      const metadata = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw || {});
      const source = viaInsertTripThing ? values[14] : null;
      const row = { id: `thing-${tripThings.length + 1}`, trip_id: tripId, category, title, location, metadata, source };
      tripThings.push(row);
      return [{ id: row.id }];
    }
    if (sql.includes('from transcript_turns')) return [{ payload: turns.get(values[0]) || {} }];
    if (sql.includes('update transcript_turns')) {
      turns.set(values[1], values[0]);
      return [];
    }
    if (sql.includes('from trips') && sql.includes('start_date')) return [{ start_date: '2026-04-01', end_date: '2026-04-08' }];
    if (sql.includes('update trips')) return [];
    return [];
  };
  return { db, tripThings, turns };
}

const displayFixture = loadFixture('hyatt-display-address-only.json');
const displayRow = bravePlaceSearchRows(displayFixture, 'local')[0];
assert.ok(braveAddress(displayRow).includes('200 Nohea Kai'));

const { db: shapeDb, tripThings: shapeThings } = mockDb('trip-shape');
const shapeOutcome = await persistIntakeLodgingThings(shapeDb, 'trip-shape', 'req-shape', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  env: { OPENROUTER_API_KEY: 't', BRAVE_SEARCH_API_KEY: 'b' },
  fetchImpl: nominatimFetch(() => ({ ok: true, json: async () => [] })),
  searchImpl: async () => ({
    places: [{
      source: 'brave',
      title: braveTitle(displayRow.title),
      category: 'hotel',
      lat: bravePoint(displayRow).lat,
      lng: bravePoint(displayRow).lng,
      address: braveAddress(displayRow),
      externalId: 'brave-display-only',
      sourceRecord: displayRow,
      providerCategories: ['Hotel'],
    }],
    providers: [{
      provider: 'brave',
      status: 'ok',
      resultCount: 1,
      query: 'Hyatt Regency Maui, Kaanapali',
      endpoint: 'local',
      rawResults: [trimBraveResultEvidence(displayRow)],
    }],
    center: { lat: 20.9250419, lng: -156.6899009 },
  }),
});
assert.equal(shapeOutcome.saved.length, 1);
assert.match(shapeThings[0].location.address, /200 Nohea Kai/i);
assert.equal(shapeOutcome.lookups[0].status, 'ok');

const { db: reverseDb, tripThings: reverseThings } = mockDb('trip-reverse');
const reverseOutcome = await persistIntakeLodgingThings(reverseDb, 'trip-reverse', 'req-reverse', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  env: { OPENROUTER_API_KEY: 't', BRAVE_SEARCH_API_KEY: 'b' },
  fetchImpl: nominatimFetch((href) => ({
    ok: true,
    json: async () => (href.includes('reverse')
      ? { display_name: 'Hyatt Regency Maui Resort and Spa, 200 Nohea Kai Drive, Lahaina, HI', lat: HYATT_LAT, lon: HYATT_LNG }
      : []),
  })),
  searchImpl: async () => ({
    places: [{
      source: 'brave',
      title: 'Hyatt Regency Maui Resort & Spa',
      category: 'hotel',
      lat: HYATT_LAT,
      lng: HYATT_LNG,
      address: '',
      externalId: 'brave-coords-only',
      sourceRecord: {
        title: 'Hyatt Regency Maui Resort & Spa',
        coordinates: [HYATT_LAT, HYATT_LNG],
        icon_category: 'lodging',
        categories: ['lodging'],
      },
      providerCategories: ['lodging', 'Hotel'],
    }],
    providers: [{ provider: 'brave', status: 'ok', resultCount: 1, rawResults: [] }],
    center: { lat: 20.9250419, lng: -156.6899009 },
  }),
});
assert.equal(reverseOutcome.saved.length, 1);
assert.equal(reverseThings[0].metadata.addressSource, 'nominatim_reverse');
assert.match(reverseThings[0].location.address, /200 Nohea Kai/i);

const { db: nomSearchDb, tripThings: nomSearchThings } = mockDb('trip-nom-search');
const nomSearchOutcome = await persistIntakeLodgingThings(nomSearchDb, 'trip-nom-search', 'req-nom-search', [{ title: 'Kihei Kai Nani', category: 'hotel' }], {
  areaHint: 'Kihei',
  env: { OPENROUTER_API_KEY: 't', BRAVE_SEARCH_API_KEY: 'b' },
  fetchImpl: nominatimFetch((href) => ({
    ok: true,
    json: async () => (href.includes('/search')
      ? [{
        display_name: 'Kihei Kai Nani Resort, 2495 South Kihei Road, Kihei, HI',
        lat: KIHEI_LAT,
        lon: KIHEI_LNG,
        class: 'tourism',
        type: 'hotel',
        extratags: { tourism: 'hotel' },
        namedetails: { name: 'Kihei Kai Nani Resort' },
        osm_type: 'way',
        osm_id: 9001,
      }]
      : {}),
  })),
  searchImpl: async () => ({
    places: [],
    providers: [{ provider: 'brave', status: 'empty', resultCount: 0, rawResults: [] }],
    center: { lat: 20.763395, lng: -156.4463997 },
  }),
});
assert.equal(nomSearchOutcome.saved.length, 1);
assert.equal(nomSearchThings[0].metadata.coordsSource, 'nominatim_search');
assert.equal(nomSearchOutcome.lookups[0].status, 'ok');

const { db: commercialDb, tripThings: commercialThings } = mockDb('trip-commercial');
const commercialOutcome = await persistIntakeLodgingThings(commercialDb, 'trip-commercial', 'req-commercial', [{ title: 'Kihei Kai Nani', category: 'hotel' }], {
  areaHint: 'Kihei',
  env: { OPENROUTER_API_KEY: 't', BRAVE_SEARCH_API_KEY: 'b' },
  fetchImpl: nominatimFetch(() => ({
    ok: true,
    json: async () => [{
      display_name: 'Kihei Kai Nani Resort, 2495 South Kihei Road, Kihei, HI',
      lat: KIHEI_LAT,
      lon: KIHEI_LNG,
      class: 'commercial',
      type: 'commercial',
      namedetails: { name: 'Kihei Kai Nani Resort' },
      osm_type: 'way',
      osm_id: 9002,
    }],
  })),
  searchImpl: async () => ({
    places: [],
    providers: [{ provider: 'brave', status: 'empty', resultCount: 0, rawResults: [{ title: 'Unrelated shop', id: 'x1', coordinates: [21, -157] }] }],
    center: { lat: 20.763395, lng: -156.4463997 },
  }),
});
assert.equal(commercialOutcome.misses.length, 1);
assert.equal(commercialThings.filter((row) => row.metadata?.source === 'customer_stated').length, 1);
assert.ok(Array.isArray(commercialOutcome.lookups[0].providers[0].rawResults));

const { db: upgradeDb, tripThings: upgradeThings } = mockDb('trip-upgrade');
upgradeThings.push({
  id: 'stale-1',
  trip_id: 'trip-upgrade',
  category: 'hotel',
  title: 'Hyatt Regency Maui',
  location: {},
  metadata: { source: 'customer_stated', customerStatedLodging: true },
});
const upgradeOutcome = await persistIntakeLodgingThings(upgradeDb, 'trip-upgrade', 'req-upgrade', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  env: { OPENROUTER_API_KEY: 't', BRAVE_SEARCH_API_KEY: 'b' },
  fetchImpl: nominatimFetch(() => ({ ok: true, json: async () => [] })),
  existingThings: [{
    id: 'stale-1',
    title: 'Hyatt Regency Maui',
    category: 'hotel',
    location: {},
    metadata: { source: 'customer_stated', customerStatedLodging: true },
  }],
  searchImpl: async () => ({
    places: [{
      source: 'brave',
      title: 'Hyatt Regency Maui Resort & Spa',
      category: 'hotel',
      lat: HYATT_LAT,
      lng: HYATT_LNG,
      address: '200 Nohea Kai Drive, Lahaina, HI 96761',
      externalId: 'brave-upgrade',
      providerCategories: ['lodging', 'Hotel'],
      sourceRecord: {
        id: 'brave-upgrade',
        title: 'Hyatt Regency Maui Resort & Spa',
        icon_category: 'lodging',
        categories: ['lodging'],
        coordinates: [HYATT_LAT, HYATT_LNG],
        postal_address: { displayAddress: '200 Nohea Kai Drive, Lahaina, HI 96761' },
      },
    }],
    providers: [{ provider: 'brave', status: 'ok', resultCount: 1, rawResults: [] }],
    center: { lat: 20.9250419, lng: -156.6899009 },
  }),
});
assert.equal(upgradeOutcome.saved.length, 1);
assert.equal(upgradeThings.length, 1);
assert.match(upgradeThings[0].title, /Hyatt Regency Maui/i);
assert.equal(upgradeThings[0].source, 'brave');
assert.ok(String(upgradeThings[0].location.address || '').includes('200 Nohea Kai'));
assert.equal(upgradeOutcome.lookups[0].status, 'ok');

console.log('test_intake_lodging_resolve_providers: ok');
