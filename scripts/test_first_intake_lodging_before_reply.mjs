#!/usr/bin/env node
import assert from 'node:assert/strict';
import { persistQueuedIntakeLodgingFromWanted } from '../src/vacation/intake-lodging-queue-persist.mjs';

const tripId = 'trip-first-intake-lodging';
const wantedThings = [{ name: 'Kihei Kai Nani', kind: 'hotel', who: '', when: '' }];
const tripThings = [];
const turns = new Map([['turn-1', { liveTranscript: { turnIndex: 1 }, payload: {} }]]);

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
    const title = values.find((v) => typeof v === 'string' && /Kihei/i.test(v));
    const row = {
      id: `thing-${tripThings.length + 1}`,
      trip_id: tripId,
      category: 'hotel',
      title,
      location: { lat: 20.7175, lng: -156.4447, locality: 'Kihei' },
      metadata: { customerStatedLodging: true, source: 'customer_stated' },
    };
    tripThings.push(row);
    return [{ id: row.id }];
  }
  if (sql.includes('from transcript_turns') && sql.includes('payload')) {
    return [{ payload: turns.get(values[0])?.payload || { liveTranscript: { turnIndex: 1 } } }];
  }
  if (sql.includes('update transcript_turns')) return [];
  return [];
};

await persistQueuedIntakeLodgingFromWanted(db, tripId, wantedThings, {
  extractedDestination: 'Kihei',
  customerTurnId: 'turn-1',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async () => ({
    places: [{
      source: 'brave',
      title: 'Kihei Kai Nani Condo',
      category: 'hotel',
      lat: 20.7175,
      lng: -156.4447,
      address: '2495 S Kihei Rd, Kihei, HI',
      externalId: 'brave-kihei',
      sourceRecord: { icon_category: 'lodging', categories: ['lodging'] },
    }],
    center: { lat: 20.7175, lng: -156.4447 },
    providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
  }),
});

const hotelCount = tripThings.filter((row) => row.category === 'hotel').length;
assert.equal(hotelCount, 1);
assert.match(tripThings[0].title, /Kihei Kai Nani/i);

console.log('test_first_intake_lodging_before_reply: ok');
