#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  nominatimLabelGeocodeCacheKey,
  nominatimWrapSearchCachePayload,
  useNominatimStore,
} from '../src/vacation/nominatim-store.mjs';
import { tryGeocodeLabel } from '../src/vacation/place-search-geocode.mjs';
import { createMemoryNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

const store = createMemoryNominatimStore();
useNominatimStore(store);
let throttleRuns = 0;
const originalRun = store.runNominatimThrottled.bind(store);
store.runNominatimThrottled = async (work, options) => {
  throttleRuns += 1;
  return originalRun(work, options);
};

const key = nominatimLabelGeocodeCacheKey('Kihei');
await store.putCachedGeocode(key, nominatimWrapSearchCachePayload(
  [{ lat: '20.765', lon: '-156.445', display_name: 'Kihei, Maui' }],
  1,
));

const providerLog = [];
const found = await tryGeocodeLabel(
  async () => {
    throw new Error('network must not run on cache hit');
  },
  'Kihei',
  providerLog,
  null,
);
assert.equal(throttleRuns, 0);
assert.equal(found?.lat, 20.765);
assert.equal(providerLog.at(-1)?.cacheHit, true);
assert.equal(providerLog.at(-1)?.nominatimThrottleWaitMs, 0);

useNominatimStore(null);
console.log('test_nominatim_cache_hit_no_throttle: ok');
