#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveIntakePlace } from '../src/vacation/trip-intake-classify.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

let nominatimOutboundCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes('nominatim.openstreetmap.org')) {
    nominatimOutboundCalls += 1;
    return { ok: true, json: async () => [] };
  }
  return originalFetch(url, init);
};

const named = await resolveIntakePlace({
  destination: 'Maui',
  title: 'Maui with my wife',
  searchImpl: async () => {
    throw new Error('public research must not run on classifier-named intake');
  },
});
assert.equal(named.destination, 'Maui');
assert.equal(named.title, 'Maui with my wife');
assert.equal(nominatimOutboundCalls, 0, 'critical-path intake resolution must not call Nominatim before trip create returns');

globalThis.fetch = originalFetch;

console.log('test_trip_create_nominatim_critical_path: ok');
