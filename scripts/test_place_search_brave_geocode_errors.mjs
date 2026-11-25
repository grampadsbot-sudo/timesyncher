#!/usr/bin/env node
import assert from 'node:assert/strict';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { useNominatimStore } from '../src/vacation/nominatim-store.mjs';

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const VK_SEARCH_WAKE_URL = 'https://vk-search.example/wake';
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = { OPENROUTER_API_KEY: 'test', VK_SEARCH_WAKE_URL, DATABASE_URL: '' };
const placeQueries = [{
  category: 'restaurant',
  q: 'taco spots near Kaanapali Maui',
  limit: 5,
  place: true,
  targetKind: 'category',
  target: 'taco spots',
}];

function createPassthroughStore() {
  return {
    async getCachedGeocode() { return null; },
    async putCachedGeocode() {},
    async reserveNominatimSlot() {},
    async runNominatimThrottled(work) {
      return work(Date.now());
    },
  };
}

useNominatimStore(createPassthroughStore());

async function brave429() {
  const result = await searchPlaces({
    destination: 'Kaanapali Maui',
    lodgingPoint: { lat: 20.92, lng: -156.69 },
    queries: placeQueries,
    relevanceTarget: 'taco spots',
    relevanceArea: 'Kaanapali Maui',
    env,
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes(NOMINATIM_HOST)) {
        return { ok: true, json: async () => [{ lat: '20.92', lon: '-156.69', display_name: 'Kaanapali' }] };
      }
      if (href.includes(OVERPASS_HOST)) {
        return { ok: true, json: async () => ({ elements: [] }) };
      }
      if (href === VK_SEARCH_WAKE_URL) {
        return { ok: false, status: 429, text: async () => 'rate limited', json: async () => ({}) };
      }
      if (href.includes(OPENROUTER_HOST)) {
        return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
      }
      throw new Error(`unexpected ${href}`);
    },
  });
  const vk = result.providers?.find((row) => row.provider === 'vk-search');
  assert.equal(vk?.status, 'error');
  assert.equal(vk?.httpStatus, 429);
  assert.notEqual(vk?.reason, 'no_results');
}

async function brave401() {
  const result = await searchPlaces({
    destination: 'Kaanapali Maui',
    lodgingPoint: { lat: 20.92, lng: -156.69 },
    queries: placeQueries,
    relevanceTarget: 'taco spots',
    relevanceArea: 'Kaanapali Maui',
    env,
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes(NOMINATIM_HOST)) {
        return { ok: true, json: async () => [{ lat: '20.92', lon: '-156.69', display_name: 'Kaanapali' }] };
      }
      if (href.includes(OVERPASS_HOST)) {
        return { ok: true, json: async () => ({ elements: [] }) };
      }
      if (href === VK_SEARCH_WAKE_URL) {
        return { ok: false, status: 401, text: async () => 'unauthorized', json: async () => ({}) };
      }
      if (href.includes(OPENROUTER_HOST)) {
        return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
      }
      throw new Error(`unexpected ${href}`);
    },
  });
  const vk = result.providers?.find((row) => row.provider === 'vk-search');
  assert.equal(vk?.status, 'error');
  assert.equal(vk?.httpStatus, 401);
}

async function nominatim429GeocodeFailed() {
  const vkCalls = [];
  let caught = null;
  try {
    await searchPlaces({
      destination: 'Kaanapali Maui',
      lodging: 'Ka La Resort',
      queries: placeQueries,
      relevanceTarget: 'taco spots',
      relevanceArea: 'Kaanapali Maui',
      searchAnchor: { text: 'Ka La Resort', source: 'lodging' },
      env,
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.includes(NOMINATIM_HOST)) {
          return { ok: false, status: 429, text: async () => 'Too Many Requests', json: async () => ({}) };
        }
        if (href === VK_SEARCH_WAKE_URL) {
          vkCalls.push(href);
          return { ok: true, json: async () => ({ results: [] }) };
        }
        throw new Error(`unexpected ${href}`);
      },
    });
  } catch (error) {
    caught = error;
  }
  assert.equal(caught?.code, 'geocode_failed');
  assert.equal(vkCalls.length, 0, 'VK Search must not run without coordinates');
  const vk = caught?.providers?.find((row) => row.provider === 'vk-search');
  assert.equal(vk, undefined);
  const nominatim = caught?.providers?.filter((row) => row.provider === 'nominatim') || [];
  assert.ok(nominatim.some((row) => row.status === 'error' && row.httpStatus === 429));
  assert.ok(Array.isArray(caught?.providerErrors));
  assert.ok(caught.providerErrors.some((row) => row.provider === 'nominatim' && row.httpStatus === 429));
}

await brave429();
await brave401();
await nominatim429GeocodeFailed();

useNominatimStore(null);

console.log(JSON.stringify({
  ok: true,
  checked: 'place-search-brave-geocode-errors',
  tests: ['brave_429_error_http_status', 'brave_401_error_http_status', 'nominatim_429_geocode_failed_no_brave'],
}));
