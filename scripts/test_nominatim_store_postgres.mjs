#!/usr/bin/env node
import assert from 'node:assert/strict';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import {
  getNominatimStore,
  parseNominatimGeocodeCachePayload,
  useNominatimStore,
} from '../src/vacation/nominatim-store.mjs';
import { PlaceSearchError } from '../src/vacation/place-search-error.mjs';

function createRecordingNominatimDb({ payloadAsStringOnRead = false } = {}) {
  const cache = new Map();
  const calls = [];
  const recording = { nextSlotMs: 0 };
  const db = async (strings, ...values) => {
    calls.push({ strings: [...strings], values: [...values] });
    const text = strings.join(' ').toLowerCase();
    if (text.includes('insert into nominatim_geocode_cache')) {
      const [cacheKey, payloadJson, expiresAt] = values;
      cache.set(cacheKey, { payloadJson, expiresAt });
      return [];
    }
    if (text.includes('from nominatim_geocode_cache')) {
      const [cacheKey] = values;
      const row = cache.get(cacheKey);
      if (!row) return [];
      const payload = payloadAsStringOnRead ? row.payloadJson : JSON.parse(row.payloadJson);
      return [{ payload }];
    }
    if (text.includes('update nominatim_throttle')) {
      const now = Number(values[0]);
      const interval = Number(values[1]);
      if (!recording.nextSlotMs) recording.nextSlotMs = 0;
      const executeAt = Math.max(recording.nextSlotMs, now);
      recording.nextSlotMs = executeAt + interval;
      return [{ execute_at_ms: executeAt }];
    }
    throw new Error(`unexpected sql: ${strings.join('')}`);
  };
  return { db, calls, cache, recording };
}

async function throttleUpdateSpacesConcurrentSlots() {
  useNominatimStore(null);
  const { db, recording } = createRecordingNominatimDb();
  useVacationDatabase(db);
  const store = getNominatimStore({ DATABASE_URL: 'postgres://test' });
  let nowMs = 100_000;
  const starts = [];
  const sleep = async (ms) => {
    nowMs += ms;
  };
  await Promise.all([
    store.runNominatimThrottled(async () => { starts.push(nowMs); }, { nowMs: () => nowMs, sleep }),
    store.runNominatimThrottled(async () => { starts.push(nowMs); }, { nowMs: () => nowMs, sleep }),
    store.runNominatimThrottled(async () => { starts.push(nowMs); }, { nowMs: () => nowMs, sleep }),
  ]);
  starts.sort((a, b) => a - b);
  assert.equal(starts.length, 3);
  assert.ok(starts[1] - starts[0] >= 1000);
  assert.ok(starts[2] - starts[1] >= 1000);
  assert.ok(recording.nextSlotMs >= starts[2] + 1000);
  useVacationDatabase(null);
}

async function putUsesJsonStringCast() {
  useNominatimStore(null);
  const { db, calls } = createRecordingNominatimDb();
  useVacationDatabase(db);
  const env = { DATABASE_URL: 'postgres://test' };
  const store = getNominatimStore(env);
  const payload = [{ lat: '20.92', lon: '-156.69', display_name: 'Ka La Resort' }];
  await store.putCachedGeocode('geocode:ka la resort', payload, 60_000);
  const insertCall = calls.find((call) => call.strings.join('').toLowerCase().includes('insert into nominatim_geocode_cache'));
  assert.ok(insertCall, 'expected insert into nominatim_geocode_cache');
  const sqlText = insertCall.strings.join('');
  assert.match(sqlText, /::jsonb/i, 'payload insert must cast with ::jsonb');
  const payloadParam = insertCall.values[1];
  assert.equal(typeof payloadParam, 'string', 'payload param must be a JSON string');
  assert.deepEqual(JSON.parse(payloadParam), payload);
  useVacationDatabase(null);
}

async function getRoundTripsParsedObject() {
  useNominatimStore(null);
  const { db } = createRecordingNominatimDb();
  useVacationDatabase(db);
  const store = getNominatimStore({ DATABASE_URL: 'postgres://test' });
  const key = 'geocode:roundtrip';
  const payload = [{ lat: '1', lon: '2', display_name: 'x' }];
  await store.putCachedGeocode(key, payload);
  const hit = await store.getCachedGeocode(key);
  assert.deepEqual(hit, payload);
  useVacationDatabase(null);
}

async function getParsesStringPayloadFromDriver() {
  useNominatimStore(null);
  const { db } = createRecordingNominatimDb({ payloadAsStringOnRead: true });
  useVacationDatabase(db);
  const store = getNominatimStore({ DATABASE_URL: 'postgres://test' });
  const key = 'geocode:string-driver';
  const payload = { display_name: 'reverse hit', lat: '3', lon: '4' };
  await store.putCachedGeocode(key, payload);
  const hit = await store.getCachedGeocode(key);
  assert.deepEqual(hit, payload);
  useVacationDatabase(null);
}

async function corruptCachePayloadIsLoud() {
  assert.throws(
    () => parseNominatimGeocodeCachePayload('not-json'),
    (error) => error instanceof PlaceSearchError && error.code === 'nominatim_geocode_cache_corrupt',
  );
  assert.throws(
    () => parseNominatimGeocodeCachePayload(42),
    (error) => error instanceof PlaceSearchError && error.code === 'nominatim_geocode_cache_corrupt',
  );
}

async function noDatabaseThrowsLoudly() {
  useNominatimStore(null);
  useVacationDatabase(null);
  assert.throws(
    () => getNominatimStore({}),
    (error) => error instanceof PlaceSearchError && error.code === 'nominatim_store_unavailable',
  );
}

async function cacheWriteFailureIsLoud() {
  useNominatimStore(null);
  const db = async () => {
    throw new Error('invalid input syntax for type json');
  };
  useVacationDatabase(db);
  const store = getNominatimStore({ DATABASE_URL: 'postgres://test' });
  await assert.rejects(
    () => store.putCachedGeocode('geocode:fail', [{ lat: '1', lon: '2' }]),
    /invalid input syntax for type json/,
  );
  useVacationDatabase(null);
}

await putUsesJsonStringCast();
await getRoundTripsParsedObject();
await getParsesStringPayloadFromDriver();
await corruptCachePayloadIsLoud();
await noDatabaseThrowsLoudly();
await cacheWriteFailureIsLoud();
await throttleUpdateSpacesConcurrentSlots();

console.log(JSON.stringify({
  ok: true,
  checked: 'nominatim-store-postgres',
  tests: [
    'put_uses_json_string_cast',
    'get_round_trips_parsed_object',
    'get_parses_string_payload_from_driver',
    'corrupt_cache_payload_is_loud',
    'no_database_throws_loudly',
    'cache_write_failure_is_loud',
    'throttle_update_spaces_concurrent_slots',
  ],
}));
