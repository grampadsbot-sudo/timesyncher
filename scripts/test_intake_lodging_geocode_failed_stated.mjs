#!/usr/bin/env node
import assert from 'node:assert/strict';
import { PlaceSearchError } from '../src/vacation/place-search.mjs';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';

const tripThings = [];
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
  if (sql.includes('insert into trip_things')) {
    const title = values.find((v) => typeof v === 'string' && /Hyatt/i.test(v));
    const row = {
      id: `thing-${tripThings.length + 1}`,
      trip_id: 'trip-geocode',
      category: 'hotel',
      title,
      location: {},
      metadata: { customerStatedLodging: true, source: 'customer_stated' },
    };
    tripThings.push(row);
    return [{ id: row.id }];
  }
  if (sql.includes('update trips')) return [];
  if (sql.includes('from trip_things') && sql.includes('count')) return [{ n: tripThings.length }];
  if (sql.includes('select count')) return [{ n: tripThings.length }];
  return [];
};

const outcome = await persistIntakeLodgingThings(db, 'trip-geocode', 'req-1', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async () => {
    throw new PlaceSearchError('Place search geocode failed: invalid input syntax for type json', 'geocode_failed');
  },
});

assert.equal(outcome.saved.length, 1, 'geocode_failed should fall back to customer_stated lodging');
assert.equal(tripThings.length, 1);
assert.equal(tripThings[0].metadata.source, 'customer_stated');

console.log('test_intake_lodging_geocode_failed_stated: ok');
