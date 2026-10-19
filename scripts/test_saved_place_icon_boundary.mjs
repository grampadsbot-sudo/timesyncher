import assert from 'node:assert/strict';
import { test } from 'node:test';
import { insertTripThing } from '../src/vacation/trip-things.mjs';
import { upgradeTripThingInPlace, persistChatIntakePlaceThing } from '../src/vacation/chat-intake-place-persist.mjs';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';

const tripId = '00000000-0000-4000-8000-000000000002';
const rowId = '00000000-0000-4000-8000-000000000001';
const official = 'https://www.bluenote.net/';
const canonical = 'https://www.bluenote.net/nyc/';
const logo = 'https://cdn.example.test/blue-note-own-declared.png';
function thing(sourceRecord = { website: official }) {
  return { title: 'Blue Note', category: 'event', source: 'brave', location: { lat: 40.73, lng: -74 }, links: [], metadata: { logoUrl: official + 'favicon.ico', sourceRecord } };
}
function database(existing = []) {
  const writes = [];
  const db = async (parts, ...values) => {
    const sql = parts.join(' ');
    if (/insert into trip_things/.test(sql)) { writes.push(JSON.parse(values[13])); return [{ id: rowId }]; }
    if (/update trip_things/.test(sql) && /metadata =/.test(sql)) {
      const index = parts.findIndex((part) => /metadata\s*=\s*$/.test(part));
      writes.push(JSON.parse(values[index])); return [{ id: rowId }];
    }
    if (/select id, title, location, source, metadata/.test(sql)) return existing;
    return [];
  };
  return { db, writes };
}
function http({ imagesFail = false, redirect = canonical } = {}) {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url) === official) return { ok: true, status: 200, url: redirect, headers: new Headers({ 'content-type': 'text/html' }), text: async () => `<html><head><title>Blue Note</title><link rel="icon" sizes="192x192" href="${logo}"></head></html>` };
    return { ok: !imagesFail, status: imagesFail ? 404 : 200, url: String(url), headers: new Headers({ 'content-type': 'image/png' }), body: null };
  };
  return { requests, fetchImpl };
}
async function withFetch(fetchImpl, fn) {
  const old = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await fn(); } finally { globalThis.fetch = old; }
}

test('normal worker insert saves the verified declared own-site image without injected fetch', async () => {
  const { db, writes } = database(); const h = http();
  const saved = await withFetch(h.fetchImpl, () => insertTripThing(db, { tripId, thing: thing(), env: {} }));
  assert.equal(saved.id, rowId);
  assert.equal(writes[0].logoUrl, logo);
  assert.equal(writes[0].sourceRecord.logoUrl, logo);
  assert.equal(writes[0].sourceRecord.website, canonical);
  assert.equal(writes[0].logoCaptureReason, undefined);
});

test('Wikipedia and arbitrary provider result URLs do not establish venue ownership', async () => {
  for (const url of ['https://en.wikipedia.org/wiki/Blue_Note_Jazz_Club', 'https://venue-directory.example.test/blue-note']) {
    const { db, writes } = database(); const h = http();
    await withFetch(h.fetchImpl, () => insertTripThing(db, { tripId, thing: thing({ url, source: 'brave' }), env: {} }));
    assert.equal(writes[0].logoUrl, undefined);
    assert.equal(writes[0].sourceRecord.logoUrl, undefined);
    assert.equal(writes[0].logoCaptureReason, 'no_verified_place_website');
    assert.deepEqual(h.requests, []);
  }
  const { db, writes } = database(); const h = http();
  await withFetch(h.fetchImpl, () => insertTripThing(db, { tripId, thing: thing(), env: {} }));
  assert.equal(writes[0].logoUrl, logo);
});

test('failed images remove stale guesses and persist the missing reason in both locations', async () => {
  const { db, writes } = database(); const h = http({ imagesFail: true });
  await withFetch(h.fetchImpl, () => insertTripThing(db, { tripId, thing: thing(), env: {} }));
  assert.equal(writes[0].logoUrl, undefined);
  assert.equal(writes[0].sourceRecord.logoUrl, undefined);
  assert.equal(writes[0].logoCaptureReason, 'no_icon_answered_with_image');
  assert.equal(writes[0].sourceRecord.logoCaptureReason, 'no_icon_answered_with_image');
});

test('upgrade uses the same normal discovery boundary as a new insert', async () => {
  const { db, writes } = database(); const h = http();
  await withFetch(h.fetchImpl, () => upgradeTripThingInPlace(db, tripId, rowId, null, thing(), {}));
  assert.equal(writes[0].logoUrl, logo);
  assert.equal(writes[0].sourceRecord.logoUrl, logo);
});

test('deduped saves retain verified stored output without repeat discovery', async () => {
  const meta = { logoUrl: logo, sourceRecord: { website: canonical, logoUrl: logo, logoProvenance: { pageUrl: canonical, iconUrl: logo } } };
  const { db, writes } = database([{ id: rowId, title: 'Blue Note', source: 'brave', location: { lat: 40.73, lng: -74 }, metadata: meta }]);
  const h = http();
  const result = await withFetch(h.fetchImpl, () => insertTripThing(db, { tripId, thing: thing(), env: {} }));
  assert.equal(result.id, rowId);
  assert.equal(result.metadata.logoUrl, logo);
  assert.deepEqual(writes, []);
  assert.deepEqual(h.requests, []);
});

test('search candidate and saved shared serialization stay synchronous and network-free', async () => {
  const h = http();
  await withFetch(h.fetchImpl, async () => {
    const candidate = placeToTripThing({ title: 'Blue Note', category: 'event', source: 'brave', lat: 40.73, lng: -74, url: official, sourceRecord: { website: official } });
    assert.equal(candidate.title, 'Blue Note');
    assert.equal(candidate.metadata.sourceRecord.website, official);
    assert.deepEqual(h.requests, []);
    const row = thingRecordFromTripRow({ id: rowId, ...candidate, metadata: { ...candidate.metadata, logoUrl: logo, sourceRecord: { website: canonical, logoUrl: logo } } });
    const shared = sharedTripFromIntake({ trip: { id: tripId, title: 'Saved trip', destination: 'New York', start_date: '2026-10-01', end_date: '2026-10-02' }, things: [row] });
    assert.equal(shared.places[0].logoUrl, logo);
    assert.deepEqual(h.requests, []);
  });
});


test('chat intake persists the official icon through its normal save caller', async () => {
  const { db, writes } = database(); const h = http();
  const searchImpl = async () => ({ places: [{ title: 'Blue Note', category: 'event', source: 'brave', lat: 40.73, lng: -74, url: official, sourceRecord: { website: official } }] });
  const result = await withFetch(h.fetchImpl, () => persistChatIntakePlaceThing(db, { tripId, title: 'Blue Note', category: 'activity', destinationHint: 'New York', searchImpl, env: {} }));
  assert.equal(result.id, rowId);
  assert.equal(writes[0].logoUrl, logo);
  assert.equal(writes[0].sourceRecord.logoUrl, logo);
});

test('lodging intake persists the official icon through its normal save caller', async () => {
  const { db, writes } = database(); const h = http();
  const searchImpl = async () => ({ places: [{ title: 'Blue Note Hotel', category: 'hotel', categoryName: 'Hotel', source: 'brave', lat: 40.73, lng: -74, address: 'New York, NY', url: official, sourceRecord: { website: official, categories: ['lodging'] } }] });
  await withFetch(h.fetchImpl, () => persistIntakeLodgingThings(db, tripId, null, [{ title: 'Blue Note Hotel' }], { destinationHint: 'New York', searchImpl, env: {} }));
  assert.equal(writes[0].logoUrl, logo);
  assert.equal(writes[0].sourceRecord.logoUrl, logo);
});

test('redirecting an official page to a provider cannot persist provider image provenance', async () => {
  const { db, writes } = database(); const h = http({ redirect: 'https://en.wikipedia.org/wiki/Blue_Note_Jazz_Club' });
  await withFetch(h.fetchImpl, () => insertTripThing(db, { tripId, thing: thing(), env: {} }));
  assert.equal(writes[0].logoUrl, undefined);
  assert.equal(writes[0].logoCaptureReason, 'redirect_not_place_website');
});
