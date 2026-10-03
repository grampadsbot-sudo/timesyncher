#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  getNominatimStore,
  nominatimLabelGeocodeCacheKey,
  useNominatimStore,
} from '../src/vacation/nominatim-store.mjs';
import { tryGeocodeLabel } from '../src/vacation/place-search-geocode.mjs';
import { PlaceSearchError } from '../src/vacation/place-search-error.mjs';
import { nominatimCallsPerSecondMax } from './shepherd-staging-smoke-provider-log.mjs';

function createTestStore() {
  const cache = new Map();
  let nextSlotMs = 0;
  let slotChain = Promise.resolve();
  return {
    async getCachedGeocode(cacheKey) {
      const hit = cache.get(String(cacheKey || '').trim());
      if (!hit || hit.expiresAt <= Date.now()) return null;
      return hit.payload;
    },
    async putCachedGeocode(cacheKey, payload, ttlMs = 60_000) {
      cache.set(String(cacheKey || '').trim(), { payload, expiresAt: Date.now() + ttlMs });
    },
    async reserveNominatimSlot({ nowMs = 0, maxWaitMs = 60_000, sleep } = {}) {
      let release;
      const prior = slotChain;
      slotChain = new Promise((resolve) => {
        release = resolve;
      });
      await prior;
      try {
        const now = Number(nowMs);
        const executeAt = Math.max(nextSlotMs, now);
        nextSlotMs = executeAt + 1000;
        const waitMs = Math.max(0, executeAt - now);
        if (waitMs > maxWaitMs) {
          throw new PlaceSearchError(`wait ${waitMs}`, 'nominatim_throttle_timeout');
        }
        if (waitMs > 0 && sleep) await sleep(waitMs);
      } finally {
        release();
      }
    },
  };
}

async function cacheHitSkipsNetwork() {
  const store = createTestStore();
  useNominatimStore(store);
  const key = nominatimLabelGeocodeCacheKey('Ka La Resort, Kaanapali');
  await store.putCachedGeocode(key, [{ lat: '20.92', lon: '-156.69', display_name: 'cached hit' }]);
  let fetchCount = 0;
  const providerLog = [];
  const found = await tryGeocodeLabel(
    async () => {
      fetchCount += 1;
      throw new Error('network should not run');
    },
    'Ka La Resort, Kaanapali',
    providerLog,
    async () => {
      fetchCount += 1;
      return [];
    },
  );
  assert.equal(fetchCount, 0);
  assert.equal(found?.lat, 20.92);
  assert.equal(providerLog.at(-1)?.status, 'ok');
  useNominatimStore(null);
}

async function concurrentGeocodesSpaced() {
  const store = createTestStore();
  useNominatimStore(store);
  const sleeps = [];
  let nowMs = 0;
  const sleep = async (ms) => {
    sleeps.push(ms);
    nowMs += ms;
  };
  const readJson = async () => [{ lat: '1', lon: '2', display_name: 'x' }];
  const providerLog = [];
  const run = (label) => tryGeocodeLabel(
    async () => {
      await readJson();
    },
    label,
    providerLog,
    readJson,
    { sleep, now: () => nowMs },
  );
  await Promise.all([
    run('label a'),
    run('label b'),
    run('label c'),
  ]);
  assert.ok(sleeps.length >= 2, `expected waits, got ${sleeps.join(',')}`);
  assert.ok(sleeps.every((ms) => ms >= 1000), `waits must be >= 1000ms: ${sleeps.join(',')}`);
  assert.ok(providerLog.length >= 3);
  assert.equal(nominatimCallsPerSecondMax(providerLog), 1);
  useNominatimStore(null);
}

async function throttleWaitsInsteadOfRejecting() {
  const store = createTestStore();
  useNominatimStore(store);
  let nowMs = 0;
  const sleep = async (ms) => {
    nowMs += ms;
  };
  const labels = ['one', 'two'];
  for (const label of labels) {
    await tryGeocodeLabel(
      async () => [{ lat: '1', lon: '2', display_name: label }],
      label,
      [],
      async () => [{ lat: '1', lon: '2', display_name: label }],
      { sleep, now: () => nowMs, maxWaitMs: 10_000 },
    );
  }
  assert.ok(nowMs >= 1000, `expected throttle wait, nowMs=${nowMs}`);
  useNominatimStore(null);
}

await cacheHitSkipsNetwork();
await concurrentGeocodesSpaced();
await throttleWaitsInsteadOfRejecting();

console.log(JSON.stringify({
  ok: true,
  checked: 'nominatim-geocode-cache-throttle',
  tests: [
    'cache_hit_skips_network',
    'concurrent_geocodes_spaced_one_second',
    'throttle_waits_instead_of_rejecting',
  ],
}));
