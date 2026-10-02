#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyTripIntake, TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT } from '../src/vacation/trip-intake-classify.mjs';
import { queriesFromPlaceClassification } from '../src/vacation/place-search-query-plan.mjs';
import { searchPlaces } from '../src/vacation/place-search.mjs';

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');

const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function mockClassifierFetch(extraction) {
  return async (url) => {
    if (String(url).includes('/decisions')) {
      return jsonResponse({ answers: { trip_intake: { noul: 0.1 } } });
    }
    return jsonResponse({
      choices: [{ message: { content: JSON.stringify(extraction) } }],
    });
  };
}

const tacoPlan = queriesFromPlaceClassification({
  ok: true,
  turnKind: 'place_search',
  target: 'taco spots',
  category: 'restaurant',
  anchor: 'Kaanapali Maui',
  anchorIsLodging: false,
  targetKind: 'category',
}, 'Maui', '', '');
assert.equal(tacoPlan.queries[0].category, 'restaurant');

let overpassBody = '';
const tacoFetch = async (url, options = {}) => {
  const href = String(url);
  if (href.includes(NOMINATIM_HOST)) {
    return { ok: true, json: async () => [{ lat: '20.92', lon: '-156.69', display_name: 'Kaanapali', address: { town: 'Kaanapali' } }] };
  }
  if (href.includes(OVERPASS_HOST)) {
    overpassBody = String(options.body || '');
    return { ok: true, json: async () => ({ elements: [] }) };
  }
  if (href.includes(BRAVE_HOST)) {
    return { ok: true, json: async () => ({ results: [{ id: 'b1', title: 'Taco Spot', latitude: 20.921, longitude: -156.691 }] }) };
  }
  if (href.includes(OPENROUTER_HOST)) {
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
  }
  throw new Error(href);
};
await searchPlaces({
  destination: tacoPlan.destination,
  queries: tacoPlan.queries,
  relevanceTarget: 'taco spots',
  relevanceArea: tacoPlan.destination,
  env,
  fetchImpl: tacoFetch,
});
assert.match(overpassBody, /amenity/);
assert.doesNotMatch(overpassBody, /tourism/);

overpassBody = '';
const activityPlan = queriesFromPlaceClassification({
  turnKind: 'place_search',
  target: 'snorkeling spots',
  category: 'activity',
  anchor: 'Molokini',
  anchorIsLodging: false,
  targetKind: 'category',
}, 'Maui', '', '');
const activityFetch = async (url, options = {}) => {
  const href = String(url);
  if (href.includes(NOMINATIM_HOST)) {
    return { ok: true, json: async () => [{ lat: '20.63', lon: '-156.49', display_name: 'Molokini', address: {} }] };
  }
  if (href.includes(OVERPASS_HOST)) {
    overpassBody = String(options.body || '');
    return { ok: true, json: async () => ({ elements: [] }) };
  }
  if (href.includes(BRAVE_HOST)) {
    return { ok: true, json: async () => ({ results: [{ id: 'b2', title: 'Lookout Point', latitude: 20.631, longitude: -156.491 }] }) };
  }
  if (href.includes(OPENROUTER_HOST)) {
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
  }
  throw new Error(href);
};
await searchPlaces({
  destination: activityPlan.destination,
  queries: activityPlan.queries,
  relevanceTarget: 'snorkeling spots',
  relevanceArea: activityPlan.destination,
  env,
  fetchImpl: activityFetch,
});
assert.match(overpassBody, /tourism/);
assert.doesNotMatch(overpassBody, /amenity.*restaurant/);

const missingCategory = await classifyTripIntake({
  text: 'taco spots near Kaanapali',
  env: { OPENROUTER_API_KEY: 'key' },
  fetchImpl: mockClassifierFetch({
    turnKind: 'place_search',
    target: 'tacos',
    anchor: 'Kaanapali',
    anchorIsLodging: false,
    category: '',
    targetKind: '',
    question: '',
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
  }),
});
assert.equal(missingCategory.ok, false);
assert.match(missingCategory.error, /category required/i);

const unknownCategory = await classifyTripIntake({
  text: 'taco spots near Kaanapali',
  env: { OPENROUTER_API_KEY: 'key' },
  fetchImpl: mockClassifierFetch({
    turnKind: 'place_search',
    target: 'tacos',
    anchor: 'Kaanapali',
    anchorIsLodging: false,
    category: 'museum',
    targetKind: 'category',
    question: '',
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
  }),
});
assert.equal(unknownCategory.ok, false);
assert.match(unknownCategory.error, /category unknown/i);

assert.match(TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT, /target must be their specific ask/i);
assert.match(TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT, /customer specific place wording/i);
assert.match(TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT, /never copy category into target/i);

const tacosNearHotel = await classifyTripIntake({
  text: 'best tacos near our hotel',
  env: { OPENROUTER_API_KEY: 'key' },
  fetchImpl: mockClassifierFetch({
    turnKind: 'place_search',
    target: 'tacos',
    anchor: 'our hotel',
    anchorIsLodging: true,
    category: 'restaurant',
    targetKind: 'category',
    question: '',
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
  }),
});
assert.equal(tacosNearHotel.ok, true);
assert.equal(tacosNearHotel.target, 'tacos');
assert.equal(tacosNearHotel.category, 'restaurant');

const hotelTacoPlan = queriesFromPlaceClassification(tacosNearHotel, 'Maui', 'Hyatt Regency Maui', 'Kaanapali Maui');
assert.equal(hotelTacoPlan.queries[0].category, 'restaurant');
assert.match(hotelTacoPlan.queries[0].q, /tacos/i);
assert.doesNotMatch(hotelTacoPlan.queries[0].q, /restaurant/i);

let braveQuery = '';
overpassBody = '';
const hotelTacoFetch = async (url, options = {}) => {
  const href = String(url);
  if (href.includes(NOMINATIM_HOST)) {
    return { ok: true, json: async () => [{ lat: '20.92', lon: '-156.69', display_name: 'Kaanapali', address: { town: 'Kaanapali' } }] };
  }
  if (href.includes(OVERPASS_HOST)) {
    overpassBody = String(options.body || '');
    return { ok: true, json: async () => ({ elements: [] }) };
  }
  if (href.includes(BRAVE_HOST)) {
    const params = new URL(href).searchParams;
    braveQuery = String(params.get('q') || '');
    return { ok: true, json: async () => ({ results: [{ id: 'b3', title: 'Taco Shack', latitude: 20.921, longitude: -156.691 }] }) };
  }
  if (href.includes(OPENROUTER_HOST)) {
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
  }
  throw new Error(href);
};
await searchPlaces({
  destination: hotelTacoPlan.destination,
  queries: hotelTacoPlan.queries,
  relevanceTarget: 'tacos',
  relevanceArea: hotelTacoPlan.destination,
  lodging: 'Hyatt Regency Maui',
  env,
  fetchImpl: hotelTacoFetch,
});
assert.match(braveQuery, /tacos/i);
assert.doesNotMatch(braveQuery, /restaurant/i);
assert.match(overpassBody, /amenity/);

console.log('test_place_search_classifier_category: ok');
