import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { buildSharedLiveTabLists } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import { resolveThingLogoUrl, NAMED_THING_LOGOS } from '../src/vacation/thing-logo-capture.mjs';

const website = 'https://www.arthousehotelnyc.com/';
const declared = 'https://image-tc.galaxy.tf/wipng-diqogu9xx9dzdynxlmw6rahjm/favicon.png';
const sourceRecord = {
  website,
  logoUrl: declared,
  logoProvenance: { pageUrl: website, iconUrl: declared },
};
const guess = 'https://unverified-hotel.test/favicon.ico?old=1#icon';
const guessCanonical = 'https://unverified-hotel.test/favicon.ico';

function payload(logoUrl = declared, source = sourceRecord) {
  return {
    places: [{ id: 1, name: 'Arthouse Hotel', category_name: 'Hotel', website, logoUrl, sourceRecord: source }],
    thingOverrides: { 'place:1': { category: 'hotel', logoUrl } },
  };
}

test('copied sourceRecord.logoUrl without logoProvenance does not admit a favicon guess', () => {
  const source = { website: 'https://unverified-hotel.test/', logoUrl: guessCanonical };
  const raw = payload(guessCanonical, source);
  assert.equal(resolveThingLogoUrl(raw.places[0], raw.thingOverrides['place:1']), '');
  const served = finalizeServedSharedTripPayload(raw);
  assert.equal(served.thingOverrides['place:1'].logoUrl, undefined);
});

test('same-own-site declaration provenance with matching iconUrl survives served filtering', () => {
  const icon = 'https://declared-hotel.test/favicon.ico';
  const page = 'https://declared-hotel.test/';
  const source = { website: page, logoUrl: icon, logoProvenance: { pageUrl: page, iconUrl: icon } };
  const served = finalizeServedSharedTripPayload(payload(icon, source));
  assert.equal(served.thingOverrides['place:1'].logoUrl, icon);
});

test('false verified, mismatched iconUrl, and non-own-site declaring page fail provenance', () => {
  const page = 'https://declared-hotel.test/';
  const icon = 'https://declared-hotel.test/favicon.ico';
  const cases = [
    { logoProvenance: { pageUrl: page, iconUrl: icon, verified: false } },
    { logoProvenance: { pageUrl: page, iconUrl: 'https://other.test/icon.ico' } },
    { logoProvenance: { pageUrl: 'https://directory.example.com/hotel', iconUrl: icon } },
  ];
  for (const extra of cases) {
    const source = { website: page, logoUrl: icon, ...extra };
    assert.equal(resolveThingLogoUrl(
      { name: 'Declared Hotel', website: page, sourceRecord: source },
      { category: 'hotel' },
    ), '', JSON.stringify(extra));
  }
});

test('served payload rejects persisted favicon guesses and website-only synthesis', () => {
  for (const field of ['logoUrl', 'iconUrl', 'captured_logo_url']) {
    const raw = payload(undefined, { website: 'https://unverified-hotel.test/' });
    delete raw.places[0].logoUrl;
    delete raw.thingOverrides['place:1'].logoUrl;
    raw.places[0][field] = guess;
    if (field !== 'captured_logo_url') raw.thingOverrides['place:1'][field] = guess;
    assert.equal(resolveThingLogoUrl(raw.places[0], raw.thingOverrides['place:1']), '', field);
    const served = finalizeServedSharedTripPayload(raw);
    assert.equal(served.places[0].logoUrl, undefined, field);
    assert.equal(served.thingOverrides['place:1'].logoUrl, undefined, field);
    assert.equal(served.places[0].iconUrl, undefined, field);
    assert.equal(served.thingOverrides['place:1'].iconUrl, undefined, field);
    assert.equal(served.thingOverrides['place:1'].logoCaptureReason, 'no_logo_or_favicon', field);
    assert.deepEqual(finalizeServedSharedTripPayload(served), served, field);
  }
  assert.equal(resolveThingLogoUrl({ name: 'Unverified Hotel', website: 'https://unverified-hotel.test/' }), '');
});

test('official declared hotel logo replaces a stale favicon guess without discovery at render time', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('render must not discover icons'); };
  try {
    const raw = payload(guess);
    const before = structuredClone(raw);
    const served = finalizeServedSharedTripPayload(raw);
    assert.equal(served.places[0].logoUrl, declared);
    assert.equal(served.thingOverrides['place:1'].logoUrl, declared);
    assert.deepEqual(served.places[0].sourceRecord, sourceRecord);
    const lists = buildSharedLiveTabLists(served);
    assert.ok(lists.hotels[0].includes(`src="${declared}"`));
    assert.deepEqual(finalizeServedSharedTripPayload(served), served);
    assert.deepEqual(raw, before, 'serialization must not mutate its input');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('explicit provider favicon and existing named supplier logo survive the served filter', () => {
  const provider = 'https://www.priceline.com/favicon.ico';
  const raw = payload(provider, { source: 'customer', website: 'https://www.priceline.com/', logoUrl: provider });
  raw.places[0].name = 'Priceline opaque Standard sedan';
  raw.places[0].category_name = 'Car';
  raw.thingOverrides['place:1'].category = 'car';
  const served = finalizeServedSharedTripPayload(raw);
  assert.equal(served.places[0].logoUrl, provider);
  assert.equal(served.thingOverrides['place:1'].logoUrl, provider);
  assert.deepEqual(served.places[0].sourceRecord, raw.places[0].sourceRecord);
  assert.equal(resolveThingLogoUrl({ name: 'JetBlue LAS-JFK', logoUrl: NAMED_THING_LOGOS.jetblue }), NAMED_THING_LOGOS.jetblue);
});

test('a declared favicon.ico is retained as source data rather than rejected by filename', () => {
  const icon = 'https://declared-hotel.test/favicon.ico';
  const source = { website: 'https://declared-hotel.test/', logoUrl: icon, logoProvenance: { pageUrl: 'https://declared-hotel.test/', iconUrl: icon } };
  const served = finalizeServedSharedTripPayload(payload(icon, source));
  assert.equal(served.thingOverrides['place:1'].logoUrl, icon);
  assert.deepEqual(served.places[0].sourceRecord, source);
});

test('successful upstream GET applies the same filter while non-success responses pass through', async () => {
  const oldFetch = globalThis.fetch;
  const oldBase = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
  const calls = [];
  let upstreamStatus = 200;
  const upstream = payload(guess);
  upstream.places.push({ id: 2, name: 'Unverified Hotel', category_name: 'Hotel', website: 'https://unverified-hotel.test/', logoUrl: guess });
  upstream.thingOverrides['place:2'] = { logoUrl: guess };
  process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = 'https://upstream.example.test';
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    return new Response(upstreamStatus === 200 ? JSON.stringify(upstream) : 'upstream error', {
      status: upstreamStatus, headers: { 'content-type': upstreamStatus === 200 ? 'application/json' : 'text/plain' },
    });
  };
  const invoke = async () => {
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, getHeader(key) { return this.headers[key]; }, end(body) { this.body = String(body); } };
    await sharedTripHandler({ method: 'GET', url: '/api/shared/source-logo-probe/', headers: {} }, res);
    return res;
  };
  try {
    const res = await invoke();
    assert.equal(res.statusCode, 200);
    const served = JSON.parse(res.body);
    assert.equal(served.thingOverrides['place:1'].logoUrl, declared);
    assert.equal(served.places[1].logoUrl, undefined);
    assert.equal(served.thingOverrides['place:2'].logoUrl, undefined);
    assert.deepEqual(served.places[0].sourceRecord, sourceRecord);
    upstreamStatus = 503;
    const failed = await invoke();
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.body, 'upstream error');
    assert.deepEqual(calls, [
      { url: 'https://upstream.example.test/api/shared/source-logo-probe/', method: 'GET' },
      { url: 'https://upstream.example.test/api/shared/source-logo-probe/', method: 'GET' },
    ], 'GET may fetch only the configured upstream, never icon discovery');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldBase === undefined) delete process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
    else process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = oldBase;
  }
});
