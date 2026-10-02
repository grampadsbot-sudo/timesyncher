#!/usr/bin/env node
import assert from 'node:assert/strict';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';
import { readPriorPlaces } from '../src/vacation/place-search.mjs';

const KIHEI = 'Kihei Kai Nani';
const OTHER_TRIP_HOTEL = 'Hyatt Regency Maui Resort & Spa';

function mockTripDb(tripId) {
  const tripThings = [];
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
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
const missOutcome = await persistIntakeLodgingThings(db, 'trip-kihei', 'req-kihei', [{ title: KIHEI, category: 'hotel' }], {
  areaHint: 'Kihei',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async () => ({
    places: [],
    providers: [{ provider: 'brave', status: 'empty', reason: 'no_results', resultCount: 0 }],
  }),
});
assert.equal(missOutcome.saved.length, 1);
assert.match(missOutcome.saved[0].title, /Kihei Kai Nani/i);
assert.equal(missOutcome.saved[0].category, 'hotel');
assert.equal(tripThings.filter((row) => /Hyatt/i.test(row.title)).length, 0);

const foreignRows = [{
  id: 'foreign-1',
  title: OTHER_TRIP_HOTEL,
  category: 'hotel',
  location: { lat: 20.92, lng: -156.69, address: 'Kaanapali' },
  source: 'prior_db',
}];
const priorForCasey = await readPriorPlaces(
  { lat: 20.73, lng: -156.45 },
  {
    env: { DATABASE_URL: 'postgres://test' },
    tripId: 'trip-kihei',
    query: async () => foreignRows.filter(() => false),
  },
);
assert.equal(priorForCasey.length, 0);

const priorForOtherTrip = await readPriorPlaces(
  { lat: 20.92, lng: -156.69 },
  {
    env: { DATABASE_URL: 'postgres://test' },
    tripId: 'trip-other',
    query: async () => foreignRows,
  },
);
assert.equal(priorForOtherTrip.length, 1);
assert.match(priorForOtherTrip[0].title, /Hyatt/i);

console.log('test_intake_stated_lodging_customer: ok');
