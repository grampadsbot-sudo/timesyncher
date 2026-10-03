#!/usr/bin/env node
import assert from 'node:assert/strict';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import {
  getNominatimStore,
  nominatimLabelGeocodeCacheKey,
  useNominatimStore,
} from '../src/vacation/nominatim-store.mjs';
import {
  nominatimForwardSearch,
  tryGeocodeLabel,
} from '../src/vacation/place-search-geocode.mjs';
import {
  nominatimHttpReadJson,
  nominatimSelfTestSearchUrl,
} from '../src/vacation/place-search-geocode.mjs';
import { placeSearchReadJson } from '../src/vacation/place-search.mjs';
import { PlaceSearchError } from '../src/vacation/place-search-error.mjs';
import { nominatimCallsPerSecondMax } from './shepherd-staging-smoke-provider-log.mjs';
import {
  createFaithfulNeonNominatimDb,
  createMemoryNominatimStore,
} from './fixtures/nominatim-store-test-double.mjs';

function createTestStore() {
  return createMemoryNominatimStore();
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
    null,
  );
  assert.equal(fetchCount, 0);
  assert.equal(found?.lat, 20.92);
  assert.equal(providerLog.at(-1)?.status, 'ok');
  assert.equal(providerLog.at(-1)?.calledAtMs, undefined);
  useNominatimStore(null);
}

async function concurrentGeocodesSpaced() {
  const store = createTestStore();
  useNominatimStore(store);
  const sleeps = [];
  let nowMs = 10_000;
  const sleep = async (ms) => {
    sleeps.push(ms);
    nowMs += ms;
  };
  const providerLog = [];
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [{ lat: '1', lon: '2', display_name: 'x' }],
  });
  const run = (label) => tryGeocodeLabel(
    fetchImpl,
    label,
    providerLog,
    null,
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
  let nowMs = 10_000;
  const sleep = async (ms) => {
    nowMs += ms;
  };
  const labels = ['one', 'two'];
  for (const label of labels) {
    await tryGeocodeLabel(
      async () => ({
        ok: true,
        json: async () => [{ lat: '1', lon: '2', display_name: label }],
      }),
      label,
      [],
      null,
      { sleep, now: () => nowMs, maxWaitMs: 10_000 },
    );
  }
  assert.ok(nowMs >= 11_000, `expected throttle wait, nowMs=${nowMs}`);
  useNominatimStore(null);
}

async function forwardThenGeocodeSharesCache() {
  const store = createTestStore();
  useNominatimStore(store);
  const anchor = 'Ka La Resort, Kaanapali';
  let fetches = 0;
  const fetchImpl = async () => {
    fetches += 1;
    return { ok: true, json: async () => [{ lat: '20.92', lon: '-156.69', display_name: anchor }] };
  };
  await nominatimForwardSearch(fetchImpl, anchor, null, { limit: 5 });
  assert.equal(fetches, 1);
  const providerLog = [];
  await tryGeocodeLabel(fetchImpl, anchor, providerLog, null);
  assert.equal(fetches, 1);
  assert.equal(providerLog.at(-1)?.calledAtMs, undefined);
  useNominatimStore(null);
}

async function postgresThrottleAcrossStoreInstances() {
  useNominatimStore(null);
  const { db } = createFaithfulNeonNominatimDb();
  useVacationDatabase(db);
  const env = { DATABASE_URL: 'postgres://test' };
  const storeA = getNominatimStore(env);
  const storeB = getNominatimStore(env);
  const starts = [];
  let nowMs = 50_000;
  const sleep = async (ms) => {
    nowMs += ms;
  };
  const work = async (store, id) => store.runNominatimThrottled(async (callAtMs) => {
    starts.push({ id, callAtMs });
  }, { nowMs: () => nowMs, sleep });
  await Promise.all([work(storeA, 'a'), work(storeB, 'b'), work(storeA, 'c')]);
  starts.sort((left, right) => left.callAtMs - right.callAtMs);
  assert.equal(starts.length, 3);
  for (let i = 1; i < starts.length; i += 1) {
    assert.ok(starts[i].callAtMs - starts[i - 1].callAtMs >= 1000,
      `slot spacing: ${JSON.stringify(starts)}`);
  }
  useVacationDatabase(null);
}

async function gatewayOwnsNominatimFetch() {
  const url = nominatimSelfTestSearchUrl('test');
  await assert.rejects(
    () => placeSearchReadJson(async () => ({ ok: true }), url, { label: 'bad' }),
    (error) => error instanceof PlaceSearchError && error.code === 'nominatim_bypass',
  );
  const store = createTestStore();
  useNominatimStore(store);
  let gatewayFetch = 0;
  const fetchImpl = async () => {
    gatewayFetch += 1;
    return { ok: true, json: async () => [{ lat: '1', lon: '2', display_name: 'g' }] };
  };
  await tryGeocodeLabel(fetchImpl, 'gateway-only', [], null);
  assert.equal(gatewayFetch, 1);
  await assert.rejects(
    () => nominatimHttpReadJson(fetchImpl, 'https://example.com/x', { label: 'x' }),
    (error) => error instanceof PlaceSearchError && error.code === 'nominatim_bypass',
  );
  useNominatimStore(null);
}

await cacheHitSkipsNetwork();
await concurrentGeocodesSpaced();
await throttleWaitsInsteadOfRejecting();
await forwardThenGeocodeSharesCache();
await postgresThrottleAcrossStoreInstances();
await gatewayOwnsNominatimFetch();

console.log(JSON.stringify({
  ok: true,
  checked: 'nominatim-geocode-cache-throttle',
  tests: [
    'cache_hit_skips_network',
    'concurrent_geocodes_spaced_one_second',
    'throttle_waits_instead_of_rejecting',
    'forward_then_geocode_shares_cache',
    'postgres_throttle_across_store_instances',
    'gateway_owns_nominatim_fetch',
  ],
}));
