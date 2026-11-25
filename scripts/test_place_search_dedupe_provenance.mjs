#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mergePlaces, searchPlaces } from '../src/vacation/place-search.mjs';
import { KAANAPALI_GEOCODE, KAANAPALI_ON_TARGET_BRAVE } from './fixtures/place-relevance-kaanapali-brave.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const PRIOR_ROW = {
  title: 'Whalers Village Tacos',
  source: 'prior_db',
  category: 'restaurant',
  lat: 20.921,
  lng: -156.694,
  externalId: 'prior-whalers',
  address: 'Kaanapali, HI',
};

const VK_ROW = {
  title: 'Whalers Village Tacos',
  source: 'vk-search',
  category: 'restaurant',
  lat: 20.9212,
  lng: -156.6941,
  externalId: 'vk-whalers',
  url: 'https://example.com/whalers-tacos',
  address: '2435 Kaanapali Pkwy',
};

const dedupeMerges = [];
const merged = mergePlaces([[PRIOR_ROW], [VK_ROW]], { dedupeMerges });
assert.equal(merged.length, 1, 'duplicate place collapses to one row');
assert.equal(merged[0].source, 'vk-search', 'live provider wins primary source after merge');
assert.deepEqual(merged[0].sources, ['vk-search', 'prior_db']);
assert.equal(merged[0].url, VK_ROW.url);
assert.equal(dedupeMerges.length, 1);
assert.equal(dedupeMerges[0].live.provider, 'vk-search');
assert.equal(dedupeMerges[0].priorDb.externalId, 'prior-whalers');

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const VK_SEARCH_WAKE_URL = 'https://vk-search.example/wake';
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = { OPENROUTER_API_KEY: 'test', VK_SEARCH_WAKE_URL, DATABASE_URL: '' };

const found = await searchPlaces({
  destination: 'Kaanapali Maui',
  queries: [{ category: 'restaurant', q: 'taco spots near Kaanapali Maui', limit: 5, place: true, targetKind: 'category', target: 'taco spots' }],
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  env,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href === VK_SEARCH_WAKE_URL) {
      return { ok: true, json: async () => ({ results: KAANAPALI_ON_TARGET_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { choice: 5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
  priorPlaces: [{
    title: 'Whalers Village Tacos',
    category: 'restaurant',
    lat: 20.921,
    lng: -156.694,
    address: 'Kaanapali, HI',
    externalId: 'prior-whalers',
    source: 'prior_db',
  }],
});

assert.equal(found.places.length, 1);
assert.equal(found.places[0].source, 'vk-search');
assert.deepEqual(found.places[0].sources, ['vk-search', 'prior_db']);
assert.ok(Array.isArray(found.dedupeMerges) && found.dedupeMerges.length === 1);

console.log('test_place_search_dedupe_provenance: ok (merge preserves live source in src/vacation/place-search-merge.mjs)');
