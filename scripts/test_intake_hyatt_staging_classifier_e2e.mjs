#!/usr/bin/env node
import assert from 'node:assert/strict';
import { writeIntakeItineraryFromChat } from '../routes/vacation-itinerary.mjs';
import {
  STAGING_HYATT_INTAKE_EXTRACTION,
  STAGING_HYATT_INTAKE_SENTENCE,
} from './fixtures/trip-intake-hyatt-staging.mjs';

function thingView(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    location: row.location || {},
    source: row.source || meta.source || '',
  };
}

function mockDb() {
  const tripThings = [];
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (sql.includes('from trip_things') && sql.includes('count')) return [{ n: tripThings.length }];
    if (sql.includes('from trip_things') && sql.includes('order by created_at')) {
      return tripThings.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        description: row.description || '',
        metadata: row.metadata || {},
        location: row.location || {},
        source: row.source || null,
      }));
    }
    if (sql.includes('insert into trip_things')) {
      const viaInsertTripThing = sql.includes('source_request_id');
      const category = viaInsertTripThing ? values[2] : values[1];
      const title = viaInsertTripThing ? values[4] : values[2];
      const locationRaw = viaInsertTripThing ? values[10] : values.find((value) => typeof value === 'string' && value.includes('"lat"'));
      const location = typeof locationRaw === 'string' ? JSON.parse(locationRaw) : (locationRaw || {});
      const metaRaw = viaInsertTripThing ? values[13] : values.find((value) => typeof value === 'string' && value.includes('sourceRef'));
      const metadata = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw || {});
      const source = viaInsertTripThing ? values[14] : null;
      const row = {
        id: `thing-${tripThings.length + 1}`,
        category,
        title,
        description: '',
        location,
        metadata,
        source,
      };
      tripThings.push(row);
      return [{ id: row.id }];
    }
    if (sql.includes('from trips') && sql.includes('destination')) {
      return [{ destination: 'Maui', metadata: {} }];
    }
    if (sql.includes('update trips')) return [];
    return [];
  };
  return { db, tripThings };
}

const { db, tripThings } = mockDb();
await writeIntakeItineraryFromChat(db, 'trip-hyatt-staging', STAGING_HYATT_INTAKE_SENTENCE, STAGING_HYATT_INTAKE_EXTRACTION.things, {
  extractedDestination: STAGING_HYATT_INTAKE_EXTRACTION.destination,
  extractedTitle: 'Maui stay',
  searchImpl: async () => ({ ok: true }),
  searchPlacesImpl: async () => ({
    places: [{
      source: 'brave',
      title: 'Hyatt Regency Maui',
      category: 'hotel',
      lat: 20.92,
      lng: -156.69,
      address: '200 Nohea Kai Dr, Lahaina, HI 96761',
      url: 'https://example.com/hyatt',
      externalId: 'brave-hyatt-staging',
    }],
    providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
  }),
  env: { OPENROUTER_API_KEY: 'test-key', BRAVE_SEARCH_API_KEY: 'brave-key' },
});

const rows = tripThings.map(thingView);
const hotels = rows.filter((row) => row.category === 'hotel');
const activities = rows.filter((row) => row.category !== 'hotel');
assert.equal(hotels.length, 1);
assert.equal(hotels[0].title, 'Hyatt Regency Maui');
assert.ok(String(hotels[0].location.address || '').includes('Lahaina'));
assert.equal(Number(hotels[0].location.lat), 20.92);
assert.equal(activities.length, 0);

console.log('test_intake_hyatt_staging_classifier_e2e: ok');
