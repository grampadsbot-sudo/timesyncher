#!/usr/bin/env node
import assert from 'node:assert/strict';
import { braveQueryString } from '../src/vacation/brave-place-query.mjs';
import { compactLocalityText, resolvedAreaText } from '../src/vacation/place-search-geocode.mjs';
import { queriesFromPlaceClassification } from '../src/vacation/place-search-query-plan.mjs';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import {
  KIHEI_LODGING_GEOCODE,
  MAUI_D2_GEOCODE,
  PAIA_FISH_MARKET_BRAVE,
} from './fixtures/place-search-maui-d2-geocode.mjs';

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };

function nominatimStub() {
  return async (url) => {
    const href = String(url);
    if (!href.includes(NOMINATIM_HOST)) throw new Error(`unexpected ${href}`);
    const q = decodeURIComponent(href);
    if (/Kihei/i.test(q)) {
      return { ok: true, json: async () => [KIHEI_LODGING_GEOCODE] };
    }
    return { ok: true, json: async () => [MAUI_D2_GEOCODE] };
  };
}

const classification = {
  ok: true,
  turnKind: 'place_search',
  target: 'Paia Fish Market',
  category: 'restaurant',
  targetKind: 'named_place',
  anchor: 'Maui',
};
const plan = queriesFromPlaceClassification(classification, 'Maui', '', '', '');
assert.equal(plan.destination, 'Maui');
assert.equal(plan.queries[0].target, 'Paia Fish Market');
assert.equal(plan.queries[0].q, 'Paia Fish Market, Maui');

const verboseArea = resolvedAreaText(MAUI_D2_GEOCODE, 'Maui');
assert.match(verboseArea, /Maui County/);
assert.equal(compactLocalityText(MAUI_D2_GEOCODE, 'Maui'), 'Maui');

const center = { lat: 20.8029568, lng: -156.3106833, label: verboseArea, compactLocality: 'Maui' };
assert.equal(
  braveQueryString(plan.queries[0], verboseArea, center, 'Maui'),
  'Paia Fish Market, Maui',
);

let braveQuery = '';
let braveEndpoint = '';
const search = await searchPlaces({
  destination: 'Maui',
  queries: plan.queries,
  relevanceTarget: 'Paia Fish Market',
  relevanceArea: 'Maui',
  searchAnchor: { text: 'Maui', source: 'destination' },
  env,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) return nominatimStub()(url);
    if (href.includes(OVERPASS_HOST)) {
      return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
    }
    if (href.includes(BRAVE_HOST)) {
      const parsed = new URL(href);
      braveQuery = parsed.searchParams.get('q') || '';
      braveEndpoint = parsed.pathname.includes('local/place_search') ? 'local' : 'web';
      return { ok: true, json: async () => ({ results: PAIA_FISH_MARKET_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});

assert.equal(braveQuery, 'Paia Fish Market, Maui');
assert.equal(braveEndpoint, 'local');
const braveProvider = search.providers.find((row) => row.provider === 'brave');
assert.equal(braveProvider?.query, 'Paia Fish Market, Maui');
assert.equal(braveProvider?.endpoint, 'local');
assert.deepEqual(search.braveLookups, [{ query: 'Paia Fish Market, Maui', endpoint: 'local' }]);

const d2Classification = {
  ok: true,
  turnKind: 'place_search',
  target: 'Paia Fish Market',
  category: 'restaurant',
  targetKind: 'named_place',
  anchor: 'Kihei',
  anchorIsLodging: true,
};
const d2Plan = queriesFromPlaceClassification(
  d2Classification,
  'Maui',
  'Kihei Kai Nani',
  '',
  'Kihei',
);
assert.equal(d2Plan.destination, 'Maui');
assert.equal(d2Plan.queries[0].q, 'Paia Fish Market, Maui');

let d2BraveQuery = '';
const d2Search = await searchPlaces({
  destination: 'Maui',
  queries: d2Plan.queries,
  relevanceTarget: 'Paia Fish Market',
  relevanceArea: 'Maui',
  searchAnchor: { text: 'Kihei', source: 'lodging' },
  env,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) return nominatimStub()(url);
    if (href.includes(OVERPASS_HOST)) {
      return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
    }
    if (href.includes(BRAVE_HOST)) {
      const parsed = new URL(href);
      d2BraveQuery = parsed.searchParams.get('q') || '';
      return { ok: true, json: async () => ({ results: PAIA_FISH_MARKET_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});

assert.equal(d2BraveQuery, 'Paia Fish Market, Maui');
assert.equal(d2Search.places[0]?.title, 'Paia Fish Market');
assert.equal(d2Search.anchorRadiusPolicy?.scope, 'destination');
assert.equal(d2Search.anchorRadiusPolicy?.radiusMeters, 40000);
assert.ok(placeToTripThing(d2Search.places[0])?.title === 'Paia Fish Market');

const categoryPlan = queriesFromPlaceClassification({
  ok: true,
  turnKind: 'place_search',
  target: 'Tacos',
  category: 'restaurant',
  targetKind: 'category',
  anchor: 'our hotel',
  anchorIsLodging: true,
}, 'Maui', 'Kihei Kai Nani', '', 'Kihei');
assert.match(categoryPlan.queries[0].q, /near Kihei/i);
assert.equal(categoryPlan.queries[0].targetKind, 'category');

const kaanapaliBrave = [{
  id: 'loc-kaanapali-taco',
  title: 'Kaanapali Taco Cart',
  latitude: 20.9212,
  longitude: -156.6941,
  categories: ['restaurant'],
  postal_address: { displayAddress: 'Kaanapali, HI' },
}];

const categorySearch = await searchPlaces({
  destination: categoryPlan.destination,
  queries: categoryPlan.queries,
  relevanceTarget: 'Tacos',
  relevanceArea: categoryPlan.destination,
  searchAnchor: { text: 'Kihei', source: 'lodging' },
  env,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) return nominatimStub()(url);
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: kaanapaliBrave }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});

assert.equal(categorySearch.places.length, 0);
assert.equal(categorySearch.outcomeStatus, 'no_results');
assert.equal(categorySearch.anchorRadiusPolicy?.scope, 'lodging_anchor');
assert.ok(
  (categorySearch.anchorRadiusRejections || []).some((row) => row.title === 'Kaanapali Taco Cart')
  || Number(categorySearch.anchorRadiusRejected) >= 1,
  'Kaanapali row dropped by Kihei lodging anchor radius',
);

console.log('test_place_search_named_place_brave_query: ok');
