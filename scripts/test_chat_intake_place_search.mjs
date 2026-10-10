#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  persistChatIntakePlaceThing,
  rowEligibleForChatPlaceBackfill,
} from '../src/vacation/chat-intake-place-persist.mjs';
import { runChatIntakePlaceBackfill } from './backfill_chat_intake_places.mjs';

function mockDb() {
  const tripThings = [];
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (/from trip_things tt/i.test(sql)) {
      return tripThings.map((row) => ({ ...row, destination: 'Seattle' }));
    }
    if (/from trip_things/i.test(sql) && /select id, title, location, source, metadata/i.test(sql)) {
      return tripThings.map((row) => ({ ...row }));
    }
    if (/insert into trip_things/i.test(sql)) {
      const row = {
        id: `thing-${tripThings.length + 1}`,
        title: values[4],
        category: values[2],
        location: JSON.parse(values[10]),
        metadata: JSON.parse(values[13]),
        source: values[14],
        description: values[5] || '',
        starts_at: values[6] || null,
        trip_id: values[0],
      };
      tripThings.push(row);
      return [{ id: row.id }];
    }
    if (/update trip_things/i.test(sql)) return [];
    return [];
  };
  return { db, tripThings };
}

await assert.rejects(() => runChatIntakePlaceBackfill({
  db: async () => [],
  env: { DATABASE_URL: 'postgres://prod-main.example/db' },
}), /production/);

const { db, tripThings } = mockDb();
tripThings.push({
  id: 'row-1',
  trip_id: 'trip-a',
  category: 'restaurant',
  title: 'Needs Search',
  location: {},
  metadata: { source: 'chat_extraction', needsDetails: true },
  source: null,
  description: '',
  starts_at: null,
});

const counts = await runChatIntakePlaceBackfill({
  db,
  env: { DATABASE_URL: 'postgres://staging.example/db', OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'key' },
  searchImpl: async () => ({
    places: [{
      source: 'osm',
      title: 'Needs Search',
      category: 'restaurant',
      lat: 47.6,
      lng: -122.3,
      address: 'Seattle',
      externalId: 'osm-1',
    }],
    providers: [],
  }),
});
assert.equal(counts.searched, 1);
assert.equal(counts.found, 1);
assert.equal(rowEligibleForChatPlaceBackfill({ category: 'restaurant', location: {}, metadata: { source: 'chat_extraction' } }), true);

console.log(JSON.stringify({ ok: true, checked: 'chat-intake-place-search-backfill' }));
