#!/usr/bin/env node
/**
 * Gate B residuals @ fbb8a79: check 6 brave taco persist, check 6b non-502 lodging path, check D Paia save radius.
 */
import assert from 'node:assert/strict';
import { orderRowsForRelevanceJudge } from '../src/vacation/place-relevance-stage-budget.mjs';
import { placeSearchClientError } from '../src/vacation/place-search-reply-facts.mjs';
import { runCustomerChatPlaceSearch } from '../src/vacation/chat-place-search.mjs';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import {
  KAANAPALI_GEOCODE,
  KAANAPALI_ON_TARGET_BRAVE,
  KAANAPALI_TACO_BRAVE_RESULTS,
  LODGING_LOCALITY,
  STAGING_HOTEL_BRAVE_REJECTIONS,
} from './fixtures/place-relevance-kaanapali-brave.mjs';
import {
  MAUI_D2_GEOCODE,
  PAIA_AREA_GEOCODE,
  PAIA_FISH_MARKET_BRAVE,
} from './fixtures/place-search-maui-d2-geocode.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = {
  OPENROUTER_API_KEY: 'test-openrouter',
  BRAVE_SEARCH_API_KEY: 'test-brave',
  DATABASE_URL: '',
};

function relevanceScoreForName(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('whalers village') || lower.includes('taco borracho')) return 3.9;
  if (STAGING_HOTEL_BRAVE_REJECTIONS.some((row) => row.title.toLowerCase() === lower)) return 0.4;
  return 0.2;
}

function mockCheck6Fetch({ judgedTitles = [] }) {
  return async (url, options = {}) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      const elements = Array.from({ length: 20 }, (_, index) => ({
        type: 'node',
        id: 8000 + index,
        lat: 20.8 + index * 0.002,
        lon: -156.69,
        tags: { name: `OSM Noise ${index}`, amenity: 'restaurant' },
      }));
      return { ok: true, json: async () => ({ elements }) };
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: KAANAPALI_TACO_BRAVE_RESULTS }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      judgedTitles.push(raw.state?.name);
      const score = relevanceScoreForName(raw.state?.name);
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
    }
    throw new Error(`unexpected fetch ${href}`);
  };
}

const judgedTitles = [];
const check6 = await searchPlaces({
  destination: 'Kaanapali Maui',
  queries: [{
    category: 'restaurant',
    q: 'taco spots near Kaanapali Maui',
    limit: 5,
    place: true,
    targetKind: 'category',
    target: 'taco spots',
  }],
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  searchAnchor: { text: 'Kaanapali Maui', source: 'named_anchor' },
  env,
  fetchImpl: mockCheck6Fetch({ judgedTitles }),
});

const braveLive = check6.places.filter((row) => row.source === 'brave');
assert.ok(braveLive.length > 0, JSON.stringify(check6.places.map((row) => row.title)));
assert.ok(
  judgedTitles.some((title) => /whalers village/i.test(String(title))),
  `Brave row must reach Jev before OSM cap: ${judgedTitles.join(' | ')}`,
);
assert.ok(placeToTripThing(braveLive[0])?.metadata?.sourceRef?.id, 'brave taco row must be persistable');

const lodgingClassification = {
  ok: true,
  turnKind: 'place_search',
  target: 'tacos',
  category: 'restaurant',
  anchor: 'our hotel',
  anchorIsLodging: true,
  targetKind: 'category',
};

const chat6b = await runCustomerChatPlaceSearch({
  placeSearchTurn: true,
  classification: lodgingClassification,
  tripDestination: 'Maui',
  tripStatedLodgingArea: 'Kaanapali',
  statedLodgingArea: 'Kaanapali',
  lodging: '',
  lodgingPoint: null,
  env,
  searchImpl: async (options) => {
    assert.equal(options.relevanceStatedLodgingArea, 'Kaanapali');
    return searchPlaces({
      ...options,
      fetchImpl: async (url, opts) => {
        const href = String(url);
        if (href.includes(NOMINATIM_HOST) && /Kaanapali/i.test(decodeURIComponent(href))) {
          return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
        }
        if (href.includes(OVERPASS_HOST)) {
          return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
        }
        return mockCheck6Fetch({ judgedTitles: [] })(url, opts);
      },
    });
  },
});
assert.equal(chat6b.status, 'ok', JSON.stringify(chat6b));
assert.ok(chat6b.things.length > 0);
assert.notEqual(
  placeSearchClientError(chat6b.search || {}),
  'relevance_judge_failed',
  JSON.stringify(chat6b.search),
);

const FISH_MARKET_MAUI_BRAVE = [
  {
    id: 'loc-fish-market-maui',
    title: 'The Fish Market Maui',
    latitude: 20.952354,
    longitude: -156.686417,
    categories: ['restaurant'],
    postal_address: { displayAddress: '3600 Lower Honoapiilani Rd, Lahaina, HI' },
  },
  {
    id: 'loc-paia-waikiki-wrong',
    title: 'Paia Fish Market Waikiki',
    latitude: 21.2793,
    longitude: -157.8294,
    categories: ['restaurant'],
    postal_address: { displayAddress: 'Waikiki, HI' },
  },
];

function paiaNominatim(url) {
  const href = String(url);
  const q = decodeURIComponent(href);
  if (/Paia/i.test(q) && !/Fish Market/i.test(q)) {
    return { ok: true, json: async () => [PAIA_AREA_GEOCODE] };
  }
  return { ok: true, json: async () => [MAUI_D2_GEOCODE] };
}

const dSave = await searchPlaces({
  destination: 'Maui',
  queries: [{
    category: 'restaurant',
    q: 'Paia Fish Market, Maui',
    limit: 5,
    place: true,
    targetKind: 'named_place',
    target: 'Paia Fish Market',
  }],
  relevanceTarget: 'Paia Fish Market',
  relevanceArea: 'Maui',
  relevanceStatedLodgingArea: 'Paia',
  searchAnchor: { text: 'Maui', source: 'destination' },
  env,
  fetchImpl: async (url, options = {}) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) return paiaNominatim(url);
    if (href.includes(OVERPASS_HOST)) {
      return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: FISH_MARKET_MAUI_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const name = String(raw.state?.name || '');
      const score = /waikiki/i.test(name) ? 0.2 : 3.8;
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});

assert.equal(dSave.places.length, 1);
assert.match(dSave.places[0].title, /Fish Market Maui/i);
assert.ok(
  !(dSave.anchorRadiusRejections || []).some((row) => /Fish Market Maui/i.test(row.title)),
  JSON.stringify(dSave.anchorRadiusRejections),
);
assert.ok(
  (dSave.anchorRadiusRejections || []).some((row) => /Waikiki/i.test(row.title)),
  'wrong-island Waikiki must stay outside Paia-centered radius',
);

const ordered = orderRowsForRelevanceJudge([
  { source: 'osm', title: 'a' },
  { source: 'brave', title: 'b', providerRank: 1 },
  { source: 'brave', title: 'c', providerRank: 0 },
]);
assert.equal(ordered[0].title, 'c');
assert.equal(ordered[1].title, 'b');

console.log('test_gate_b_6_6b_d_fbb8a79: ok');
