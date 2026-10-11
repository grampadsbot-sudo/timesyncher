#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  applyIntakeExtractedTripTitle,
} from '../src/vacation/intake-title-persist.mjs';
import {
  attachIntakeItineraryFromReply,
  writeIntakeItineraryFromChat,
} from '../routes/vacation-itinerary.mjs';
import { intakeLodgingLookupQuery } from '../src/vacation/intake-lodging-lookup.mjs';

const SAVED_TITLE = 'March Maui week';
const HYATT = 'Hyatt Regency Maui';

function mockTripDb(tripId, { title = SAVED_TITLE, destination = 'Maui' } = {}) {
  const tripThings = [];
  let tripTitle = title;
  let tripMeta = {};
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
    if (sql.includes('select count') && sql.includes('trip_things')) {
      return [{ n: tripThings.length }];
    }
    if (sql.includes('insert into trip_things')) {
      const viaInsertTripThing = sql.includes('source_request_id');
      const category = viaInsertTripThing ? values[2] : values[1];
      const rowTitle = viaInsertTripThing ? values[4] : values[2];
      const locationRaw = viaInsertTripThing ? values[10] : '{}';
      const location = typeof locationRaw === 'string' ? JSON.parse(locationRaw) : (locationRaw || {});
      const metaRaw = viaInsertTripThing ? values[13] : {};
      const metadata = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw || {});
      tripThings.push({
        id: `thing-${tripThings.length + 1}`,
        trip_id: tripId,
        category,
        title: rowTitle,
        location,
        metadata,
      });
      return [{ id: tripThings[tripThings.length - 1].id }];
    }
    if (sql.includes('from trips') && sql.includes('destination')) {
      return [{ title: tripTitle, destination, metadata: tripMeta }];
    }
    if (sql.includes('from trips') && sql.includes('start_date')) {
      return [{ start_date: '2027-03-10', end_date: '2027-03-17' }];
    }
    if (sql.includes('update trips')) {
      for (const value of values) {
        if (typeof value === 'string' && value && value !== tripId && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          if (value !== tripTitle && (value.includes('Maui') || value.includes('week') || !/^shell-/i.test(value))) {
            tripTitle = value;
          }
        }
        if (value && typeof value === 'object' && value.titleSource) {
          tripMeta = { ...(tripMeta || {}), ...value };
          delete tripMeta.titleError;
        }
      }
      return [];
    }
    if (sql.includes('update transcript_turns')) return [];
    if (sql.includes('from transcript_turns')) return [{ payload: {} }];
    return [];
  };
  return { db, tripThings, getTitle: () => tripTitle, getMeta: () => tripMeta };
}

const { db: shellDb, tripThings: shellThings, getTitle: shellTitle } = mockTripDb('trip-shell', {
  title: 'shell-abc123',
  destination: 'Maui',
});
shellThings.push({
  id: 'thing-plan',
  trip_id: 'trip-shell',
  category: 'activity',
  title: 'Beach day',
  location: {},
  metadata: { source: 'chat_extraction' },
});
await writeIntakeItineraryFromChat(
  shellDb,
  'trip-shell',
  'Maui March 10-17 2027 with my wife',
  [],
  {
    extractedDestination: 'Maui',
    extractedTitle: SAVED_TITLE,
    searchImpl: async () => ({ ok: true, error: null }),
    env: {},
  },
);
assert.equal(shellTitle(), SAVED_TITLE);

const { db: followDb, tripThings: followThings } = mockTripDb('trip-follow');
followThings.push({
  id: 'thing-plan',
  trip_id: 'trip-follow',
  category: 'activity',
  title: 'Snorkel day',
  location: {},
  metadata: { source: 'chat_extraction' },
});
let hyattQuery = '';
await attachIntakeItineraryFromReply(
  followDb,
  'trip-follow',
  "We're staying at the Hyatt Regency Maui in Kaanapali.",
  {
    extractedDestination: 'Kaanapali',
    titleError: 'trip title was not in the extraction',
    env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
    searchPlacesImpl: async ({ propertyName, areaHint }) => {
      hyattQuery = intakeLodgingLookupQuery(propertyName, areaHint);
      return {
        places: [{
          source: 'brave',
          title: HYATT,
          category: 'hotel',
          lat: 20.92,
          lng: -156.69,
          address: 'Kaanapali',
          externalId: 'hyatt-1',
          providerCategories: ['lodging'],
        }],
        center: { lat: 20.92, lng: -156.69 },
        providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
      };
    },
  },
  '',
  [{ name: HYATT, kind: 'hotel', who: '', when: '' }],
);
assert.equal(hyattQuery, `${HYATT}, Kaanapali`);
const hotels = followThings.filter((row) => row.category === 'hotel');
assert.equal(hotels.length, 1);
assert.match(hotels[0].title, /Hyatt/i);

const { db: applyDb, getTitle: applyTitle } = mockTripDb('trip-apply', { title: 'shell-pre' });
await applyIntakeExtractedTripTitle(applyDb, 'trip-apply', {
  extractedDestination: 'Maui',
  extractedTitle: SAVED_TITLE,
  savedTripTitle: 'shell-pre',
  searchImpl: async () => ({ ok: true, error: null }),
});
assert.equal(applyTitle(), SAVED_TITLE);

console.log('test_intake_lodging_followup_saved_trip_title: ok');
