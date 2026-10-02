#!/usr/bin/env node
import assert from 'node:assert/strict';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { KAANAPALI_GEOCODE, KAANAPALI_ON_TARGET_BRAVE } from './fixtures/place-relevance-kaanapali-brave.mjs';

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };
const CENTER = { lat: 20.92, lng: -156.69, label: 'Kaanapali, Maui' };
const placeQueries = [{
  category: 'restaurant',
  q: 'taco spots near Kaanapali Maui',
  limit: 5,
  place: true,
  targetKind: 'category',
  target: 'taco spots',
}];

const osm504BraveRows = await searchPlaces({
  destination: 'Kaanapali Maui',
  lodgingPoint: CENTER,
  queries: placeQueries,
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  env,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: KAANAPALI_ON_TARGET_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});
assert.equal(osm504BraveRows.places.length, 1);
assert.equal(osm504BraveRows.places[0].source, 'brave');
assert.ok(Array.isArray(osm504BraveRows.providerErrors));
assert.deepEqual(
  osm504BraveRows.providerErrors.filter((row) => row.provider === 'osm').map((row) => row.httpStatus),
  [504],
);

const osm504BraveEmpty = await searchPlaces({
  destination: 'Kaanapali Maui',
  lodgingPoint: CENTER,
  queries: placeQueries,
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  env,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});
assert.equal(osm504BraveEmpty.outcomeStatus, 'no_results');
assert.ok(osm504BraveEmpty.providerErrors?.some((row) => row.provider === 'osm' && row.httpStatus === 504));

let everyProviderError = null;
try {
  await searchPlaces({
    destination: 'Kaanapali Maui',
    queries: placeQueries,
    relevanceTarget: 'taco spots',
    relevanceArea: 'Kaanapali Maui',
    env,
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes(NOMINATIM_HOST)) {
        return { ok: true, json: async () => [] };
      }
      if (href.includes(OVERPASS_HOST)) {
        return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
      }
      if (href.includes(BRAVE_HOST)) {
        return { ok: false, status: 503, text: async () => 'unavailable', json: async () => ({}) };
      }
      throw new Error(`unexpected ${href}`);
    },
  });
} catch (error) {
  everyProviderError = error;
}
assert.equal(everyProviderError?.code, 'all_providers_failed');
assert.match(String(everyProviderError?.message || ''), /Place search failed/i);

const braveCallsOnOsmError = [];
await searchPlaces({
  destination: 'Kaanapali Maui',
  lodgingPoint: CENTER,
  queries: placeQueries,
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  env,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: false, status: 504, text: async () => 'Gateway Timeout', json: async () => ({}) };
    }
    if (href.includes(BRAVE_HOST)) {
      braveCallsOnOsmError.push(href);
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});
assert.ok(braveCallsOnOsmError.some((href) => href.includes(BRAVE_HOST)), 'brave runs after osm 504');

console.log(JSON.stringify({
  ok: true,
  checked: 'place-search-partial-provider-error',
  tests: [
    'osm_504_brave_rows_turn_succeeds_with_provider_errors',
    'osm_504_brave_empty_no_results_with_provider_errors',
    'every_live_provider_errors_502',
    'brave_runs_when_osm_errors',
  ],
}));
