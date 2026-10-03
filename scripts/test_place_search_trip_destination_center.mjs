#!/usr/bin/env node
import assert from 'node:assert/strict';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';
import { runPlaceProviderPass } from '../src/vacation/place-search-provider-pass.mjs';

installNoopNominatimStore();

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass', 'api', 'de'].join('-');

let nominatimCalls = 0;
const fetchImpl = async (url) => {
  const href = String(url);
  if (href.includes(NOMINATIM_HOST)) {
    nominatimCalls += 1;
    throw new Error('geocode gateway should not run when trip destination center is stored');
  }
  if (href.includes(OVERPASS_HOST)) {
    return { ok: true, json: async () => ({ elements: [] }) };
  }
  if (href.includes('brave.com')) {
    return { ok: true, json: async () => ({ results: [] }) };
  }
  if (href.includes('openrouter')) {
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
  }
  throw new Error(href);
};

const fail = (message) => {
  throw new Error(message);
};

const pass = await runPlaceProviderPass({
  fetchImpl,
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' },
  dest: 'Kihei',
  lodging: '',
  lodgingPoint: null,
  tripDestinationCenter: { lat: 20.765, lng: -156.445, label: 'Kihei' },
  placeQueries: [{
    category: 'market',
    q: 'farmers market near Kihei',
    limit: 5,
    place: true,
    targetKind: 'category',
    target: 'farmers market',
  }],
  osmCategoryFilter: ['market'],
  searchAnchor: { text: 'Kihei', source: 'named_anchor' },
  relevanceContext: { target: 'farmers market', area: 'Kihei' },
  tripId: 'trip-center',
  priorPlaces: [],
  selectPriorPlaces: (rows) => rows,
  priorRowsFromInput: (rows) => rows,
  queryOsm: async (f) => {
    await f(`https://${OVERPASS_HOST}/api/interpreter`);
    return [];
  },
  queryBrave: async () => [],
  mergePlaces: () => [],
  attachRelevance: async (rows) => ({ places: rows, rejections: [] }),
  readJson: async () => ({}),
  fail,
});

assert.equal(pass.status, 'no_results');
assert.equal(nominatimCalls, 0);
const nominatimRows = pass.providerLog.filter((row) => row.provider === 'nominatim');
assert.ok(nominatimRows.some((row) => row.reason === 'trip_destination_center'));
assert.ok(nominatimRows.some((row) => row.reason === 'anchor_matches_search_center'));

console.log('test_place_search_trip_destination_center: ok');
