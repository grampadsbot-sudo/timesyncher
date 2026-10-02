#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';
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

console.log('test_place_search_classifier_category: ok');
