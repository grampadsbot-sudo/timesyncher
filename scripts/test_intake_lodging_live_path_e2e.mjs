#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attachIntakeItineraryFromReply } from '../routes/vacation-itinerary.mjs';
import {
  braveAddress,
  braveCategoryName,
  braveLocalPlaceResult,
  bravePlaceSearchRows,
  bravePoint,
  braveProviderCategories,
  braveTitle,
} from '../src/vacation/brave-place-query.mjs';
import { intakeLodgingLookupQuery } from '../src/vacation/intake-lodging-lookup.mjs';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/intake-lodging-brave/', import.meta.url));
const KAANAPALI_CENTER = { lat: 20.9250419, lng: -156.6899009 };
const KIHEI_CENTER = { lat: 20.763395, lng: -156.4463997 };

function loadFixture(name) {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, 'utf8'));
}

function bravePlacesFromFixture(fixture, category = 'hotel') {
  const rows = [];
  for (const result of bravePlaceSearchRows(fixture, 'local')) {
    if (!braveLocalPlaceResult(result)) continue;
    const point = bravePoint(result);
    const title = braveTitle(result?.title || result?.name);
    const address = braveAddress(result);
    if (!title) continue;
    rows.push({
      source: 'brave',
      title,
      category,
      lat: point.lat,
      lng: point.lng,
      address,
      url: String(result?.url || ''),
      externalId: String(result?.id || result?.url || ''),
      categoryName: braveCategoryName(result),
      providerCategories: braveProviderCategories(result),
    });
  }
  return rows;
}

function mockLiveDb(tripId) {
  const tripThings = [];
  const turns = new Map([['turn-followup', { liveTranscript: { turnIndex: 3 } }]]);
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
    if (sql.includes('delete from trip_things')) {
      const title = values.find((value) => typeof value === 'string' && /Hyatt|Kihei/i.test(value));
      const scopedTrip = values.find((value) => value === tripId);
      if (!scopedTrip) return [];
      const next = tripThings.filter((row) => !(row.trip_id === tripId && title && row.title.toLowerCase() === title.toLowerCase() && row.metadata?.source === 'customer_stated'));
      tripThings.length = 0;
      tripThings.push(...next);
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
      const row = {
        id: `thing-${tripThings.length + 1}`,
        trip_id: tripId,
        category,
        title,
        location,
        metadata,
        source,
      };
      tripThings.push(row);
      return [{ id: row.id }];
    }
    if (sql.includes('from transcript_turns') && sql.includes('payload')) {
      return [{ payload: turns.get(values[0]) || {} }];
    }
    if (sql.includes('update transcript_turns') && sql.includes('payload')) {
      turns.set(values[1], values[0]);
      return [];
    }
    if (sql.includes('from trips') && sql.includes('start_date')) {
      return [{ start_date: '2026-04-01', end_date: '2026-04-08' }];
    }
    if (sql.includes('update trips') && sql.includes('metadata')) return [];
    if (sql.includes('select count') && sql.includes('trip_things')) {
      return [{ n: tripThings.length }];
    }
    return [];
  };
  return { db, tripThings, turns };
}

const hyattFixture = loadFixture('hyatt-regency-maui.json');
const kiheiFixture = loadFixture('kihei-kai-nani.json');
const hyattPlaces = bravePlacesFromFixture(hyattFixture);
const kiheiPlaces = bravePlacesFromFixture(kiheiFixture);

const { db: followDb, tripThings: followThings, turns: followTurns } = mockLiveDb('trip-followup');
followThings.push({
  id: 'thing-plan',
  trip_id: 'trip-followup',
  category: 'activity',
  title: 'Snorkel day',
  location: {},
  metadata: { source: 'chat_extraction' },
});
followThings.push({
  id: 'thing-stale',
  trip_id: 'trip-followup',
  category: 'hotel',
  title: 'Hyatt Regency Maui',
  location: {},
  metadata: { source: 'customer_stated', customerStatedLodging: true },
});

let hyattCapturedQuery = '';
await attachIntakeItineraryFromReply(
  followDb,
  'trip-followup',
  'We are staying at Hyatt Regency Maui in Kaanapali.',
  {
    customerTurnId: 'turn-followup',
    extractedDestination: 'Kaanapali',
    env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
    searchPlacesImpl: async ({ propertyName, areaHint }) => {
      hyattCapturedQuery = intakeLodgingLookupQuery(propertyName, areaHint);
      return {
        places: hyattPlaces,
        center: KAANAPALI_CENTER,
        providers: [{ provider: 'brave', status: 'ok', resultCount: hyattPlaces.length, query: hyattCapturedQuery }],
      };
    },
  },
  '',
  [{ name: 'Hyatt Regency Maui', kind: 'hotel', who: '', when: '' }],
);

assert.equal(hyattCapturedQuery, 'Hyatt Regency Maui, Kaanapali');
const followHotels = followThings.filter((row) => row.category === 'hotel');
assert.equal(followHotels.length, 1);
assert.equal(followHotels[0].metadata?.source || followHotels[0].source, 'brave');
assert.ok(Number(followHotels[0].location?.lat) > 20.9);
const followPayload = followTurns.get('turn-followup');
assert.ok(Array.isArray(followPayload.intakeLodgingLookup));
assert.equal(followPayload.intakeLodgingLookup[0].status, 'ok');

const { db: missDb, tripThings: missThings, turns: missTurns } = mockLiveDb('trip-miss');
missThings.push({
  id: 'thing-activity',
  trip_id: 'trip-miss',
  category: 'activity',
  title: 'Beach walk',
  location: {},
  metadata: { source: 'chat_extraction' },
});
missTurns.set('turn-miss', { liveTranscript: { turnIndex: 2 } });

const emptyNominatimFetch = async (url) => {
  const href = String(url);
  if (!href.includes('nominatim.openstreetmap.org')) throw new Error(`unexpected fetch ${href}`);
  return { ok: true, json: async () => [] };
};

await attachIntakeItineraryFromReply(
  missDb,
  'trip-miss',
  'Book Kihei Kai Nani in Kihei.',
  {
    customerTurnId: 'turn-miss',
    extractedDestination: 'Kihei',
    env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
    fetchImpl: emptyNominatimFetch,
    searchPlacesImpl: async () => ({
      places: [],
      center: KIHEI_CENTER,
      providers: [{ provider: 'brave', status: 'empty', reason: 'no_results', resultCount: 0 }],
    }),
  },
  '',
  [{ name: 'Kihei Kai Nani', kind: 'hotel', who: '', when: '' }],
);

assert.equal(missThings.filter((row) => row.category === 'hotel').length, 1);
const missPayload = missTurns.get('turn-miss');
assert.equal(missPayload.intakeLodgingLookup[0].status, 'miss');
assert.equal(missPayload.intakeLodgingLookup[0].reason, 'no_coordinates');

const { db: kiheiDb, tripThings: kiheiThings, turns: kiheiTurns } = mockLiveDb('trip-kihei');
kiheiTurns.set('turn-kihei', { liveTranscript: { turnIndex: 1 } });
let kiheiCapturedQuery = '';
await attachIntakeItineraryFromReply(
  kiheiDb,
  'trip-kihei',
  'We booked Kihei Kai Nani in Kihei.',
  {
    customerTurnId: 'turn-kihei',
    extractedDestination: 'Kihei',
    env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
    searchPlacesImpl: async ({ propertyName, areaHint }) => {
      kiheiCapturedQuery = intakeLodgingLookupQuery(propertyName, areaHint);
      return {
        places: kiheiPlaces,
        center: KIHEI_CENTER,
        providers: [{ provider: 'brave', status: 'ok', resultCount: kiheiPlaces.length, query: kiheiCapturedQuery }],
      };
    },
  },
  '',
  [{ name: 'Kihei Kai Nani', kind: 'hotel', who: '', when: '' }],
);
assert.equal(kiheiCapturedQuery, 'Kihei Kai Nani, Kihei');
assert.equal(kiheiThings.filter((row) => row.category === 'hotel').length, 1);
assert.equal(kiheiTurns.get('turn-kihei').intakeLodgingLookup[0].status, 'ok');

console.log('test_intake_lodging_live_path_e2e: ok');
