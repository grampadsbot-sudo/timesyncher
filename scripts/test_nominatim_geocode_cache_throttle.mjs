#!/usr/bin/env node
import assert from 'node:assert/strict';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import {
  getNominatimStore,
  nominatimLabelGeocodeCacheKey,
  nominatimWrapSearchCachePayload,
  useNominatimStore,
} from '../src/vacation/nominatim-store.mjs';
import {
  nominatimForwardSearch,
  nominatimHttpReadJson,
  nominatimSelfTestSearchUrl,
  tryGeocodeLabel,
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

function outboundFetchTimesMs(providerLog = []) {
  return providerLog
    .filter((row) => String(row?.provider || '') === 'nominatim' && Number(row?.calledAtMs) > 0)
    .map((row) => Number(row.calledAtMs))
    .sort((left, right) => left - right);
}

function assertFetchTimesAtLeastOneSecondApart(times) {
  for (let i = 1; i < times.length; i += 1) {
    assert.ok(times[i] - times[i - 1] >= 1000, `fetch times must be >= 1000ms apart: ${times.join(',')}`);
  }
}

async function cacheHitSkipsNetwork() {
  const store = createTestStore();
  useNominatimStore(store);
  const key = nominatimLabelGeocodeCacheKey('Ka La Resort, Kaanapali');
  await store.putCachedGeocode(key, nominatimWrapSearchCachePayload(
    [{ lat: '20.92', lon: '-156.69', display_name: 'cached hit' }],
    1,
  ));
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

async function runConcurrentGeocodes({ sleep, advanceClockOnSleep = true, nowMsStart = 10_000 }) {
  const store = createTestStore();
  useNominatimStore(store);
  let nowMs = nowMsStart;
  const sleepImpl = async (ms) => {
    await sleep(ms);
    if (advanceClockOnSleep) nowMs += ms;
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
    { sleep: sleepImpl, now: () => nowMs },
  );
  await Promise.all([
    run('label a'),
    run('label b'),
    run('label c'),
  ]);
  useNominatimStore(null);
  return { providerLog, nowMs };
}

async function concurrentGeocodesSpaced() {
  const sleeps = [];
  const { providerLog } = await runConcurrentGeocodes({
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.ok(sleeps.length >= 2, `expected waits, got ${sleeps.join(',')}`);
  assert.ok(sleeps.every((ms) => ms >= 1000), `waits must be >= 1000ms: ${sleeps.join(',')}`);
  const fetchTimes = outboundFetchTimesMs(providerLog);
  assert.equal(fetchTimes.length, 3);
  assertFetchTimesAtLeastOneSecondApart(fetchTimes);
  assert.equal(nominatimCallsPerSecondMax(providerLog), 1);
}

async function noopSleepFailsFetchSpacingAssertion() {
  const { providerLog } = await runConcurrentGeocodes({
    sleep: async () => {},
    advanceClockOnSleep: false,
  });
  const fetchTimes = outboundFetchTimesMs(providerLog);
  assert.equal(fetchTimes.length, 3);
  let spacingHeld = true;
  try {
    assertFetchTimesAtLeastOneSecondApart(fetchTimes);
  } catch {
    spacingHeld = false;
  }
  assert.equal(spacingHeld, false, 'spacing check must fail when sleep does not advance the clock');
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
    return {
      ok: true,
      json: async () => Array.from({ length: 5 }, (_, i) => ({
        lat: String(20.9 + i * 0.01),
        lon: '-156.69',
        display_name: `${anchor} hit ${i}`,
      })),
    };
  };
  const { hits } = await nominatimForwardSearch(fetchImpl, anchor, null, { limit: 5 });
  assert.equal(hits.length, 5);
  assert.equal(fetches, 1);
  const providerLog = [];
  await tryGeocodeLabel(fetchImpl, anchor, providerLog, null);
  assert.equal(fetches, 1);
  assert.equal(providerLog.at(-1)?.calledAtMs, undefined);
  useNominatimStore(null);
}

async function geocodeThenForwardLimitFiveMissesCache() {
  const store = createTestStore();
  useNominatimStore(store);
  const anchor = 'Small Cache Resort';
  let fetches = 0;
  const fetchImpl = async () => {
    fetches += 1;
    const body = fetches === 1
      ? [{ lat: '21.0', lon: '-156.0', display_name: anchor }]
      : Array.from({ length: 5 }, (_, i) => ({
        lat: String(21.1 + i * 0.01),
        lon: '-156.1',
        display_name: `${anchor} wide ${i}`,
      }));
    return { ok: true, json: async () => body };
  };
  await tryGeocodeLabel(fetchImpl, anchor, [], null);
  assert.equal(fetches, 1);
  const { hits } = await nominatimForwardSearch(fetchImpl, anchor, null, { limit: 5 });
  assert.equal(fetches, 2);
  assert.equal(hits.length, 5);
  useNominatimStore(null);
}

async function postgresThrottleAcrossStoreInstances() {
  useNominatimStore(null);
  const { db } = createFaithfulNeonNominatimDb();
  useVacationDatabase(db);
  const env = { DATABASE_URL: 'postgres://test' };
  assert.equal(getNominatimStore(env), getNominatimStore(env));
  let nowMs = 50_000;
  const sleep = async (ms) => {
    nowMs += ms;
  };
  const providerLog = [];
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [{ lat: '1', lon: '2', display_name: 'pg' }],
  });
  const run = (label) => tryGeocodeLabel(
    fetchImpl,
    label,
    providerLog,
    null,
    { env, sleep, now: () => nowMs },
  );
  await Promise.all([run('pg a'), run('pg b'), run('pg c')]);
  const fetchTimes = outboundFetchTimesMs(providerLog);
  assert.equal(fetchTimes.length, 3);
  assertFetchTimesAtLeastOneSecondApart(fetchTimes);
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
await noopSleepFailsFetchSpacingAssertion();
await throttleWaitsInsteadOfRejecting();
await forwardThenGeocodeSharesCache();
await geocodeThenForwardLimitFiveMissesCache();
await postgresThrottleAcrossStoreInstances();
await gatewayOwnsNominatimFetch();

console.log(JSON.stringify({
  ok: true,
  checked: 'nominatim-geocode-cache-throttle',
  tests: [
    'cache_hit_skips_network',
    'concurrent_geocodes_spaced_one_second',
    'noop_sleep_fails_fetch_spacing_assertion',
    'throttle_waits_instead_of_rejecting',
    'forward_then_geocode_shares_cache',
    'geocode_then_forward_limit_five_misses_cache',
    'postgres_throttle_across_store_instances',
    'gateway_owns_nominatim_fetch',
  ],
}));
