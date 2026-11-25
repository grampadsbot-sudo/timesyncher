#!/usr/bin/env node
import assert from 'node:assert/strict';
import { vkSearchQueryString } from '../src/vacation/vk-search-place-identity.mjs';
import { compactLocalityText, resolvedAreaText } from '../src/vacation/place-search-geocode.mjs';
import { queriesFromPlaceClassification } from '../src/vacation/place-search-query-plan.mjs';
import { searchPlaces, placeToTripThing } from '../src/vacation/place-search.mjs';
import {
  KIHEI_LODGING_GEOCODE,
  MAUI_D2_GEOCODE,
  PAIA_AREA_GEOCODE,
  PAIA_FISH_MARKET_BRAVE,
} from './fixtures/place-search-maui-d2-geocode.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const VK_WAKE_URL = 'https://vk-search.test/wake';
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = { OPENROUTER_API_KEY: 'test', VK_SEARCH_WAKE_URL: VK_WAKE_URL, DATABASE_URL: '' };

const paiaVkRows = PAIA_FISH_MARKET_BRAVE.map((row) => ({
  ...row,
  url: row.url || 'https://paiafishmarket.com/',
}));

function nominatimStub() {
  return async (url) => {
    const href = String(url);
    if (!href.includes(NOMINATIM_HOST)) throw new Error(`unexpected ${href}`);
    const q = decodeURIComponent(href);
    if (/Kihei/i.test(q)) {
      return { ok: true, json: async () => [KIHEI_LODGING_GEOCODE] };
    }
    if (/Paia/i.test(q) && !/Fish Market/i.test(q)) {
      return { ok: true, json: async () => [PAIA_AREA_GEOCODE] };
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

assert.equal(
  vkSearchQueryString(plan.queries[0], verboseArea, 'Maui'),
  'Paia Fish Market, Maui',
);

let vkQuery = '';
const search = await searchPlaces({
  destination: 'Maui',
  queries: plan.queries,
  relevanceTarget: 'Paia Fish Market',
  relevanceArea: 'Maui',
  searchAnchor: { text: 'Maui', source: 'destination' },
  env,
  fetchImpl: async (url, init = {}) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) return nominatimStub()(url);
    if (href.includes(OVERPASS_HOST)) {
      return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
    }
    if (href === VK_WAKE_URL) {
      const body = JSON.parse(String(init.body || '{}'));
      vkQuery = String(body.place?.query || '');
      return { ok: true, json: async () => ({ results: paiaVkRows }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});

assert.equal(vkQuery, 'Paia Fish Market, Maui');
const vkProvider = search.providers.find((row) => row.provider === 'vk-search');
assert.equal(vkProvider?.query, 'Paia Fish Market, Maui');
assert.equal(vkProvider?.status, 'ok');

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

let d2VkQuery = '';
const d2Search = await searchPlaces({
  destination: 'Maui',
  queries: d2Plan.queries,
  relevanceTarget: 'Paia Fish Market',
  relevanceArea: 'Maui',
  searchAnchor: { text: 'Kihei', source: 'lodging' },
  env,
  fetchImpl: async (url, init = {}) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) return nominatimStub()(url);
    if (href.includes(OVERPASS_HOST)) {
      return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
    }
    if (href === VK_WAKE_URL) {
      const body = JSON.parse(String(init.body || '{}'));
      d2VkQuery = String(body.place?.query || '');
      return { ok: true, json: async () => ({ results: paiaVkRows }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});

assert.equal(d2VkQuery, 'Paia Fish Market, Maui');
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

const kaanapaliVk = [{
  id: 'loc-kaanapali-taco',
  title: 'Kaanapali Taco Cart',
  url: 'https://kaanapali-tacos.example/',
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
    if (href === VK_WAKE_URL) {
      return { ok: true, json: async () => ({ results: kaanapaliVk }) };
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
