#!/usr/bin/env node
/**
 * Kihei lodging anchor + tacos: relevance judge must use Kihei (not property name) so OSM taco rows pass.
 */
import assert from 'node:assert/strict';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { runCustomerChatPlaceSearch } from '../src/vacation/chat-place-search.mjs';
import { resolvePlaceSearchRelevanceArea } from '../src/vacation/place-search-anchor.mjs';
import { queriesFromPlaceClassification } from '../src/vacation/place-search-query-plan.mjs';

const KIHEI_CENTER = { lat: 20.763395, lng: -156.4463997 };
const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');

const classification = {
  ok: true,
  turnKind: 'place_search',
  target: 'tacos',
  category: 'restaurant',
  anchor: 'our hotel',
  anchorIsLodging: true,
  targetKind: 'category',
};

const relevanceArea = resolvePlaceSearchRelevanceArea({
  classification,
  lodgingText: 'Kihei Kai Nani',
  tripStatedLodgingArea: 'Kihei',
  tripDestination: 'Maui',
  tripResolvedArea: '',
});
assert.equal(relevanceArea, 'Kihei');

const plan = queriesFromPlaceClassification(classification, 'Maui', 'Kihei Kai Nani', '', 'Kihei');
assert.match(plan.queries[0].q, /Kihei Kai Nani|Kihei/i);

const osmElements = [
  {
    type: 'node',
    id: 501,
    lat: 20.764,
    lon: -156.447,
    tags: { name: 'South Shore Tacos', amenity: 'fast_food', cuisine: 'mexican', 'addr:city': 'Kihei' },
  },
  {
    type: 'node',
    id: 502,
    lat: 20.765,
    lon: -156.448,
    tags: { name: 'Maui Gas Station', amenity: 'fuel', 'addr:city': 'Kihei' },
  },
];

const judgeAreas = [];
const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };

const fetchImpl = async (url, options = {}) => {
  const href = String(url);
  if (href.includes(NOMINATIM_HOST)) {
    return { ok: true, json: async () => [{ lat: String(KIHEI_CENTER.lat), lon: String(KIHEI_CENTER.lng), display_name: 'Kihei, Maui' }] };
  }
  if (href.includes(OVERPASS_HOST)) {
    return { ok: true, json: async () => ({ elements: osmElements }) };
  }
  if (href.includes(BRAVE_HOST)) {
    return { ok: true, json: async () => ({ results: [] }) };
  }
  if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
    const raw = options.body ? JSON.parse(String(options.body)) : {};
    const state = raw.state || {};
    judgeAreas.push(state.searchArea);
    const name = String(state.name || '');
    const score = /south shore tacos/i.test(name) ? 3.9 : 0.4;
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
  }
  throw new Error(href);
};

const search = await searchPlaces({
  destination: 'Kihei',
  lodging: 'Kihei Kai Nani',
  lodgingPoint: { lat: 20.7175, lng: -156.4447, label: 'Kihei Kai Nani' },
  queries: plan.queries,
  relevanceTarget: 'tacos',
  relevanceArea: relevanceArea,
  searchAnchor: { text: 'Kihei', source: 'stated_lodging_area' },
  env,
  fetchImpl,
});

assert.ok(judgeAreas.length > 0);
assert.ok(judgeAreas.every((area) => area === 'Kihei'), judgeAreas.join(' | '));
assert.ok(search.places.some((row) => /south shore tacos/i.test(row.title)), JSON.stringify(search.places.map((p) => p.title)));
assert.equal(search.places.some((row) => /gas station/i.test(row.title)), false);

let chatRelevanceArea = null;
const chat = await runCustomerChatPlaceSearch({
  placeSearchTurn: true,
  classification,
  tripDestination: 'Maui',
  tripStatedLodgingArea: 'Kihei',
  lodging: 'Kihei Kai Nani',
  lodgingPoint: { lat: 20.7175, lng: -156.4447 },
  env,
  searchImpl: async (options) => {
    chatRelevanceArea = options.relevanceArea;
    return searchPlaces({ ...options, fetchImpl });
  },
});
assert.equal(chat.status, 'ok');
assert.equal(chatRelevanceArea, 'Kihei');

console.log('test_place_search_kihei_taco_osm_relevance: ok');
