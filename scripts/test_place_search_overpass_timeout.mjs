#!/usr/bin/env node
import assert from 'node:assert/strict';
import { PLACE_SEARCH_OVERPASS_TIMEOUT_MS, searchPlaces } from '../src/vacation/place-search.mjs';
import { KAANAPALI_GEOCODE, KAANAPALI_ON_TARGET_BRAVE } from './fixtures/place-relevance-kaanapali-brave.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };

const started = Date.now();
const result = await searchPlaces({
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
  fetchImpl: async (url, options = {}) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return new Promise(() => {});
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: KAANAPALI_ON_TARGET_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const score = String(raw.state?.name || '').includes('Grill') ? 3.9 : 0.1;
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});

const elapsed = Date.now() - started;
assert.ok(elapsed < PLACE_SEARCH_OVERPASS_TIMEOUT_MS + 12_000, `search took ${elapsed}ms`);
const osmLog = (result.providers || []).find((row) => row.provider === 'osm');
assert.ok(osmLog, 'expected osm provider log row');
assert.equal(osmLog.status, 'error');
assert.match(String(osmLog.reason || ''), /timed out/i);
assert.ok(Array.isArray(result.places));

console.log('test_place_search_overpass_timeout: ok');
