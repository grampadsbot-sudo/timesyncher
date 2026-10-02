#!/usr/bin/env node
import assert from 'node:assert/strict';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';
import { readPriorPlaces } from '../src/vacation/place-search.mjs';
import { urlIsNominatim } from './intake-lodging-test-hosts.mjs';

const KIHEI = 'Kihei Kai Nani';
const OTHER_TRIP_HOTEL = 'Hyatt Regency Maui Resort & Spa';

function mockTripDb(tripId) {
  const tripThings = [];
  const db = async (strings, ...values) => {
    const sql = strings.join(' ');
    if (/select\s+id,\s*title,\s*location/i.test(sql) && /from trip_things/i.test(sql)) {
      return [];
    }
    if (sql.includes('delete from trip_things')) return [];
    if (sql.includes('insert into trip_things')) {
      const categoryIndex = values.findIndex((value) => value === 'hotel');
      const title = categoryIndex >= 0 ? values[categoryIndex + 2] : values[4];
      const meta = values.find((value) => value && typeof value === 'object' && value.customerStatedLodging) || {};
      tripThings.push({ trip_id: tripId, category: 'hotel', title, metadata: meta });
      return [{ id: `thing-${tripThings.length}` }];
    }
    if (sql.includes('update trips') && sql.includes('metadata')) return [];
    if (sql.includes('from trip_things') && sql.includes('trip_id')) {
      const scoped = values.find((value) => value === tripId);
      if (!scoped) return [];
      return tripThings.filter((row) => row.trip_id === tripId);
    }
    return [];
  };
  return { db, tripThings };
}

const { db, tripThings } = mockTripDb('trip-kihei');
const emptyNominatimFetch = async (url) => {
  const href = String(url);
  if (!urlIsNominatim(href)) throw new Error(`unexpected fetch ${href}`);
  return { ok: true, json: async () => [] };
};

const missOutcome = await persistIntakeLodgingThings(db, 'trip-kihei', 'req-kihei', [{ title: KIHEI, category: 'hotel' }], {
  areaHint: 'Kihei',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  fetchImpl: emptyNominatimFetch,
  searchImpl: async () => ({
    places: [],
    providers: [{ provider: 'brave', status: 'empty', reason: 'no_results', resultCount: 0 }],
  }),
});
assert.equal(missOutcome.saved.length, 1);
assert.equal(missOutcome.misses.length, 1);
assert.equal(tripThings.filter((row) => row.category === 'hotel').length, 1);
assert.equal(tripThings.filter((row) => /Hyatt/i.test(row.title)).length, 0);

const foreignActivityRows = [{
  id: 'foreign-1',
  title: 'Whalers Village',
  category: 'activity',
  location: { lat: 20.92, lng: -156.69, address: 'Kaanapali' },
  source: 'prior_db',
}];
const priorLeak = await readPriorPlaces(
  { lat: 20.92, lng: -156.69 },
  {
    env: { DATABASE_URL: 'postgres://test' },
    tripId: 'trip-other',
    query: async () => foreignActivityRows,
  },
);
assert.equal(priorLeak.length, 1);
assert.match(priorLeak[0].title, /Whalers/i);

const hotelPriorRows = [{
  id: 'foreign-hotel',
  title: OTHER_TRIP_HOTEL,
  category: 'hotel',
  location: { lat: 20.92, lng: -156.69, address: 'Kaanapali' },
  source: 'prior_db',
}];
const hotelPrior = await readPriorPlaces(
  { lat: 20.92, lng: -156.69 },
  {
    env: { DATABASE_URL: 'postgres://test' },
    tripId: 'trip-other',
    query: async () => hotelPriorRows,
  },
);
assert.equal(hotelPrior.length, 0);

console.log('test_intake_stated_lodging_customer: ok');
