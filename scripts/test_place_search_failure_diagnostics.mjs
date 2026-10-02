#!/usr/bin/env node
import assert from 'node:assert/strict';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { KAANAPALI_GEOCODE, KAANAPALI_ON_TARGET_BRAVE } from './fixtures/place-relevance-kaanapali-brave.mjs';

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };

let caught = null;
try {
  await searchPlaces({
    destination: 'Kaanapali Maui',
    queries: [{ category: 'restaurant', q: 'taco spots near Kaanapali Maui', limit: 5, place: true, targetKind: 'category', target: 'taco spots' }],
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
        return { ok: true, json: async () => ({ elements: [] }) };
      }
      if (href.includes(BRAVE_HOST)) {
        return { ok: true, json: async () => ({ results: KAANAPALI_ON_TARGET_BRAVE }) };
      }
      if (href.includes(OPENROUTER_HOST)) {
        const raw = options.body ? JSON.parse(String(options.body)) : {};
        const score = String(raw.state?.name || '') === 'Prior Saved Grill' ? 3.9 : 0.1;
        return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
      }
      throw new Error(`unexpected ${href}`);
    },
    priorPlaces: [{
      title: 'Prior Saved Grill',
      category: 'restaurant',
      lat: 20.9208,
      lng: -156.6935,
      address: 'Kaanapali, HI',
      externalId: 'prior-1',
      source: 'prior_db',
    }],
  });
} catch (error) {
  caught = error;
}

assert.equal(caught?.code, 'prior_db_sole_source');
assert.equal(caught?.judgeInput?.target, 'taco spots');
assert.equal(caught?.judgeInput?.area, 'Kaanapali Maui');
assert.equal(caught?.anchor?.text, 'Kaanapali Maui');
assert.equal(caught?.anchor?.source, 'named_anchor');
assert.ok(caught?.searchCenter?.lat && caught?.searchCenter?.lng);
assert.deepEqual(caught?.survivingPriorDbTitles, ['Prior Saved Grill']);
assert.ok(Array.isArray(caught?.relevanceRejections) && caught.relevanceRejections.length > 0);
assert.ok(caught.relevanceRejections[0].source);
assert.ok(Number.isFinite(Number(caught.relevanceRejections[0].score)));

console.log('test_place_search_failure_diagnostics: ok');
