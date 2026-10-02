#!/usr/bin/env node
import assert from 'node:assert/strict';
import { attachPlaceRelevance } from '../src/vacation/place-search-relevance.mjs';
import { insertTripThing } from '../src/vacation/trip-things.mjs';
import {
  PlaceSearchError,
  readPriorPlaces,
  searchPlaces,
  selectPriorPlaces,
} from '../src/vacation/place-search.mjs';
import { braveLocalPlaceResult, bravePlaceSearchRows } from '../src/vacation/brave-place-query.mjs';

const CENTER = { lat: 20.737, lng: -156.446 };
const TRIP_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TRIP_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HYATT_ROW = {
  id: 'trip-a-hyatt',
  title: 'Hyatt Regency Maui Resort & Spa',
  category: 'activity',
  location: { lat: 20.913, lng: -156.692 },
};
const KIHEI_ROW = {
  id: 'trip-b-cafe',
  title: 'Kihei Harbor Cafe',
  category: 'restaurant',
  location: { lat: 20.737, lng: -156.446 },
};

await assert.rejects(
  () => readPriorPlaces(CENTER, { env: { DATABASE_URL: 'postgres://example' } }),
  (error) => error instanceof PlaceSearchError && error.code === 'missing_trip_id',
);

const tripBRows = await readPriorPlaces(CENTER, {
  tripId: TRIP_B,
  query: async () => [KIHEI_ROW],
});
assert.deepEqual(tripBRows.map((place) => place.title), ['Kihei Harbor Cafe']);
assert.equal(tripBRows.some((place) => /hyatt/i.test(place.title)), false);

const tripBScoped = await readPriorPlaces(CENTER, {
  tripId: TRIP_B,
  query: async () => [HYATT_ROW, KIHEI_ROW].filter((row) => row.id.startsWith('trip-b')),
});
assert.deepEqual(tripBScoped.map((place) => place.title), ['Kihei Harbor Cafe']);

const hotelPrior = selectPriorPlaces([
  { id: 'h-near', title: 'Far Hyatt', category: 'hotel', lat: CENTER.lat, lng: CENTER.lng },
  { id: 'r-near', title: 'Near Cafe', category: 'restaurant', lat: CENTER.lat, lng: CENTER.lng },
], CENTER);
assert.deepEqual(hotelPrior.map((place) => place.title), ['Near Cafe']);

const env = {
  OPENROUTER_API_KEY: 'test-openrouter',
  BRAVE_SEARCH_API_KEY: 'test-brave',
  DATABASE_URL: '',
};
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

let judgedPrior = false;
const scopedSearch = await searchPlaces({
  destination: 'Kihei Maui',
  tripId: TRIP_B,
  queries: [{ category: 'restaurant', q: 'dinner Kihei', limit: 5, place: true, targetKind: 'category', target: 'dinner' }],
  relevanceTarget: 'dinner',
  relevanceArea: 'Kihei Maui',
  env,
  loadPriorPlaces: async () => readPriorPlaces(CENTER, {
    tripId: TRIP_B,
    query: async () => [KIHEI_ROW],
  }),
  fetchImpl: async (url, options = {}) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ lat: String(CENTER.lat), lon: String(CENTER.lng), display_name: 'Kihei' }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return {
        ok: true,
        json: async () => ({
          elements: [{
            type: 'node',
            id: 1,
            lat: CENTER.lat,
            lon: CENTER.lng,
            tags: { name: 'Live Bistro', amenity: 'restaurant' },
          }],
        }),
      };
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const name = String(raw.state?.name || '');
      if (name === 'Kihei Harbor Cafe') judgedPrior = true;
      const score = name === 'Live Bistro' || name === 'Kihei Harbor Cafe' ? 3.9 : 0.5;
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
    }
    throw new Error(`unexpected fetch ${href}`);
  },
});
assert.equal(judgedPrior, true);
assert.equal(scopedSearch.places.some((place) => /hyatt/i.test(place.title)), false);
assert.ok(scopedSearch.places.some((place) => place.title === 'Kihei Harbor Cafe'));

const webListing = {
  title: 'The best Kihei Snorkeling 2026 - Free cancellation',
  url: 'https://www.getyourguide.com/example',
  id: 'https://www.getyourguide.com/example',
};
assert.equal(bravePlaceSearchRows({ results: [], web: { results: [webListing] } }, 'local').length, 0);
assert.equal(braveLocalPlaceResult(webListing), false);

const relevance = await attachPlaceRelevance(
  [{ source: 'prior_db', title: 'Saved Grill', category: 'restaurant', externalId: 'p1', address: 'Kihei' }],
  async (url, options = {}) => {
    const href = String(url);
    if (!href.includes(OPENROUTER_HOST)) throw new Error(href);
    const raw = options.body ? JSON.parse(String(options.body)) : {};
    assert.equal(raw.state?.name, 'Saved Grill');
    return { ok: true, json: async () => ({ answers: { relevance: { choice: 1 } } }) };
  },
  { OPENROUTER_API_KEY: 'test' },
  { target: 'grill', area: 'Kihei' },
  { requireOpenRouterKey: (env) => String(env.OPENROUTER_API_KEY || '') },
);
assert.equal(relevance.places.length, 0);
assert.equal(relevance.rejections[0].source, 'prior_db');

const inserts = [];
const db = async (strings, ...values) => {
  inserts.push({ sql: strings.join(' '), values });
  if (inserts.length === 1) {
    return [{ id: 'existing-1', title: 'Monkeypod Kitchen', location: { lat: 20.68, lng: -156.44 } }];
  }
  return [{ id: 'new-2' }];
};
const deduped = await insertTripThing(db, {
  tripId: TRIP_B,
  requestId: 'req-1',
  thing: {
    title: 'Monkeypod Kitchen',
    category: 'restaurant',
    source: 'brave',
    location: { lat: 20.6801, lng: -156.4401 },
    metadata: { sourceRef: { source: 'brave', id: 'brave-mp' } },
  },
});
assert.equal(deduped.deduped, true);
assert.equal(deduped.id, 'existing-1');
assert.equal(inserts.length, 1);

console.log('test_place_search_prior_trip_scope: ok');
