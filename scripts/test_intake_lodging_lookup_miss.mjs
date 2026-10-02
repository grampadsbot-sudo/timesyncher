#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  IntakeLodgingResolveError,
  persistIntakeLodgingLookupOnCustomerTurn,
  persistIntakeLodgingThings,
} from '../src/vacation/intake-lodging-thing.mjs';
import { intakeLodgingLookupQuery } from '../src/vacation/intake-lodging-lookup.mjs';
import { PlaceSearchError } from '../src/vacation/place-search.mjs';

assert.equal(
  intakeLodgingLookupQuery('Hyatt Regency Maui', 'Kaanapali'),
  'Hyatt Regency Maui, Kaanapali',
);

function mockTripDb() {
  const tripThings = [];
  const turns = new Map();
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (sql.includes('insert into trip_things')) {
      const title = values.find((value) => typeof value === 'string' && /Hyatt/i.test(value)) || values[4] || values[2];
      const row = { id: `thing-${tripThings.length + 1}`, category: 'hotel', title, location: {} };
      tripThings.push(row);
      return [{ id: row.id }];
    }
    if (sql.includes('from transcript_turns') && sql.includes('payload')) {
      const turnId = values[0];
      return [{ payload: turns.get(turnId) || {} }];
    }
    if (sql.includes('update transcript_turns') && sql.includes('payload')) {
      const turnId = values[1];
      const payload = values[0];
      turns.set(turnId, payload);
      return [];
    }
    return [];
  };
  return { db, tripThings, turns };
}

let capturedQuery = '';
const { db: lookupDb, tripThings: lookupThings } = mockTripDb();
const lookupOutcome = await persistIntakeLodgingThings(lookupDb, 'trip-1', 'req-1', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  destinationHint: 'Maui',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async ({ queries }) => {
    capturedQuery = String(queries?.[0]?.q || '');
    return {
      places: [{
        source: 'brave',
        title: 'Hyatt Regency Maui',
        category: 'hotel',
        lat: 20.92,
        lng: -156.69,
        address: '200 Nohea Kai Dr',
        externalId: 'h1',
      }],
      providers: [{ provider: 'brave', status: 'ok', resultCount: 1, query: capturedQuery }],
    };
  },
});
assert.match(capturedQuery, /Kaanapali/);
assert.equal(lookupOutcome.saved.length, 1);
assert.equal(lookupThings.length, 1);

const { db: missDb, tripThings: missThings, turns: missTurns } = mockTripDb();
missTurns.set('turn-customer-1', { liveTranscript: { turnIndex: 1 } });
const missOutcome = await persistIntakeLodgingThings(missDb, 'trip-2', 'req-2', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async ({ queries }) => ({
    places: [],
    providers: [{ provider: 'brave', status: 'empty', reason: 'no_results', resultCount: 0, query: queries?.[0]?.q }],
  }),
});
assert.equal(missOutcome.saved.length, 0);
assert.equal(missThings.length, 0);
assert.equal(missOutcome.misses.length, 1);
assert.equal(missOutcome.misses[0].status, 'miss');
assert.match(missOutcome.misses[0].query, /Kaanapali/);

await persistIntakeLodgingLookupOnCustomerTurn(missDb, 'turn-customer-1', missOutcome.misses);
const stored = missTurns.get('turn-customer-1');
assert.ok(Array.isArray(stored.intakeLodgingLookup));
assert.equal(stored.intakeLodgingLookup[0].reason, 'no_coordinates');

let providerThrew = false;
try {
  await persistIntakeLodgingThings(missDb, 'trip-3', 'req-3', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
    env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
    searchImpl: async () => {
      const error = new PlaceSearchError('brave down', 'all_providers_failed');
      error.providers = [{ provider: 'brave', status: 'error', reason: 'HTTP 503', resultCount: 0 }];
      throw error;
    },
  });
} catch (error) {
  providerThrew = error instanceof IntakeLodgingResolveError;
}
assert.equal(providerThrew, true);

let missingKeyThrew = false;
try {
  await persistIntakeLodgingThings(missDb, 'trip-4', 'req-4', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
    env: { OPENROUTER_API_KEY: 'test' },
    searchImpl: async () => {
      throw new PlaceSearchError('Place search refused to run. Missing BRAVE_SEARCH_API_KEY.', 'missing_key');
    },
  });
} catch (error) {
  missingKeyThrew = error instanceof IntakeLodgingResolveError;
}
assert.equal(missingKeyThrew, true);

console.log('test_intake_lodging_lookup_miss: ok');
