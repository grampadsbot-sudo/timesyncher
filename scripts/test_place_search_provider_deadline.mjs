#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  PLACE_SEARCH_PROVIDER_READ_TIMEOUT_MS,
  placeSearchReadJson,
  resolvePlaceSearchProviderReadTimeoutMs,
  searchPlaces,
} from '../src/vacation/place-search.mjs';
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
const READ_BUDGET_MS = 80;
const OUTER_MS = 4000;

assert.equal(resolvePlaceSearchProviderReadTimeoutMs({}), PLACE_SEARCH_PROVIDER_READ_TIMEOUT_MS);
assert.equal(resolvePlaceSearchProviderReadTimeoutMs({}, 120), 120);

const OVERPASS_URL = `https://${OVERPASS_HOST}/api/interpreter`;

function overpassFetchHangUntilAbort(options) {
  return new Promise((resolve, reject) => {
    const signal = options?.signal;
    if (!signal) return;
    if (signal.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    }, { once: true });
  });
}

function overpassFetchNeverSettles() {
  return new Promise(() => {});
}

async function withOuterTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} outer timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const osmSignals = [];
let braveDoneAt = 0;
const stalledOsmBrave = await withOuterTimeout(searchPlaces({
  destination: 'Kaanapali Maui',
  lodgingPoint: CENTER,
  queries: placeQueries,
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  env,
  providerReadTimeoutMs: READ_BUDGET_MS,
  fetchImpl: async (url, options) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      osmSignals.push(Boolean(options?.signal));
      return overpassFetchHangUntilAbort(options);
    }
    if (href.includes(BRAVE_HOST)) {
      braveDoneAt = Date.now();
      return { ok: true, json: async () => ({ results: KAANAPALI_ON_TARGET_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
}), OUTER_MS, 'stalled-osm');

assert.ok(osmSignals.length >= 1 && osmSignals.every(Boolean), 'overpass fetch received abort signal');
assert.ok(braveDoneAt > 0, 'brave completed');
assert.equal(stalledOsmBrave.places.length, 1);
assert.equal(stalledOsmBrave.places[0].source, 'brave');
assert.ok(stalledOsmBrave.providerErrors?.some((row) => row.provider === 'osm'));
assert.ok(Array.isArray(stalledOsmBrave.providers));

const ignoreSignalStarted = Date.now();
const ignoreSignalResult = await withOuterTimeout(searchPlaces({
  destination: 'Kaanapali Maui',
  lodgingPoint: CENTER,
  queries: placeQueries,
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  env,
  providerReadTimeoutMs: READ_BUDGET_MS,
  fetchImpl: async (url, options) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      assert.equal(Boolean(options?.signal), true);
      return overpassFetchNeverSettles();
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: KAANAPALI_ON_TARGET_BRAVE }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
}), OUTER_MS, 'ignore-signal-osm');
const ignoreSignalElapsed = Date.now() - ignoreSignalStarted;
assert.ok(ignoreSignalElapsed < OUTER_MS / 2, `provider pass settled within budget (${ignoreSignalElapsed}ms)`);
assert.equal(ignoreSignalResult.places[0].source, 'brave');

const minimalOsm = {
  elements: [{
    type: 'node',
    id: 1,
    lat: 20.921,
    lon: -156.691,
    tags: { name: 'OSM Taco', amenity: 'restaurant' },
  }],
};

const fastStarted = Date.now();
const fastBoth = await searchPlaces({
  destination: 'Kaanapali Maui',
  lodgingPoint: CENTER,
  queries: placeQueries,
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  env,
  providerReadTimeoutMs: READ_BUDGET_MS,
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => minimalOsm };
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
assert.ok(Date.now() - fastStarted < OUTER_MS / 2);
assert.ok(fastBoth.places.some((row) => row.source === 'brave'));
assert.ok(fastBoth.places.some((row) => row.source === 'osm'));

let readJsonSignals = 0;
let readJsonTimerCleared = false;
const readJsonStarted = Date.now();
try {
  await placeSearchReadJson(async (url, options) => {
    readJsonSignals += options?.signal ? 1 : 0;
    return overpassFetchNeverSettles();
  }, OVERPASS_URL, {
    label: 'read-json timer test',
    method: 'POST',
    timeoutMs: 40,
  });
  assert.fail('expected timeout');
} catch (error) {
  assert.equal(error?.code, 'source_failed');
  assert.match(String(error?.message || ''), /timed out after 40ms/i);
}
readJsonTimerCleared = Date.now() - readJsonStarted < 500;
assert.equal(readJsonSignals, 1);
assert.ok(readJsonTimerCleared, 'read-json timeout cleared without long hang');

console.log(JSON.stringify({
  ok: true,
  checked: 'place-search-provider-deadline',
  tests: [
    'stalled_osm_aborts_brave_preserved',
    'ignore_signal_osm_outer_race',
    'all_fast_providers',
    'read_json_timer_clears',
  ],
}));
