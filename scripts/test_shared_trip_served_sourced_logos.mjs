import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { buildSharedLiveTabLists } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import { resolveThingLogoUrl, logoCaptureMissReason, NAMED_THING_LOGOS } from '../src/vacation/thing-logo-capture.mjs';
import { effectiveCcabDeclaredLogoUrl } from '../src/vacation/place-logo-provenance.mjs';

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

test('provenance validation rejects a copied favicon without removing its served logo', () => {
  const source = { website: 'https://unverified-hotel.test/', logoUrl: guessCanonical };
  assert.equal(effectiveCcabDeclaredLogoUrl(source), '');
  const raw = payload(guessCanonical, source);
  assert.equal(logoCaptureMissReason(raw.places[0], raw.thingOverrides['place:1']), 'no_logo_or_favicon');
  assert.equal(resolveThingLogoUrl(raw.places[0], raw.thingOverrides['place:1']), guessCanonical);
  const served = finalizeServedSharedTripPayload(raw);
  assert.equal(served.thingOverrides['place:1'].logoUrl, guessCanonical);
});

test('same-own-site declaration provenance with matching iconUrl survives served filtering', () => {
  const icon = 'https://declared-hotel.test/favicon.ico';
  const page = 'https://declared-hotel.test/';
  const source = { website: page, logoUrl: icon, logoProvenance: { pageUrl: page, iconUrl: icon } };
  assert.equal(effectiveCcabDeclaredLogoUrl(source), icon);
  assert.equal(logoCaptureMissReason({ sourceRecord: source }), '');
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
    assert.equal(effectiveCcabDeclaredLogoUrl(source), '', JSON.stringify(extra));
    const served = finalizeServedSharedTripPayload(payload(icon, source));
    assert.equal(served.thingOverrides['place:1'].logoUrl, icon, JSON.stringify(extra));
    assert.deepEqual(served.places[0].sourceRecord, source);
  }
});

test('served payload retains persisted favicons and website-only fallback from the base', () => {
  for (const field of ['logoUrl', 'iconUrl', 'captured_logo_url']) {
    const raw = payload(undefined, { website: 'https://unverified-hotel.test/' });
    delete raw.places[0].logoUrl;
    delete raw.thingOverrides['place:1'].logoUrl;
    raw.places[0][field] = guess;
    if (field !== 'captured_logo_url') raw.thingOverrides['place:1'][field] = guess;
    assert.equal(resolveThingLogoUrl(raw.places[0], raw.thingOverrides['place:1']), guess, field);
    const served = finalizeServedSharedTripPayload(raw);
    assert.equal(served.places[0].logoUrl, guess, field);
    assert.equal(served.thingOverrides['place:1'].logoUrl, guess, field);
    if (field === 'iconUrl') {
      assert.equal(served.places[0].iconUrl, guess, field);
      assert.equal(served.thingOverrides['place:1'].iconUrl, guess, field);
    }
    assert.ok(buildSharedLiveTabLists(served).hotels[0].includes(`src="${guess}"`), field);
    assert.deepEqual(finalizeServedSharedTripPayload(served), served, field);
  }
  assert.equal(resolveThingLogoUrl({ name: 'Unverified Hotel', website: 'https://unverified-hotel.test/' }), guessCanonical);
});

test('declared source data survives without replacing a persisted logo or discovering icons', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('render must not discover icons'); };
  try {
    const raw = payload(guess);
    const before = structuredClone(raw);
    const served = finalizeServedSharedTripPayload(raw);
    assert.equal(served.places[0].logoUrl, guess);
    assert.equal(served.thingOverrides['place:1'].logoUrl, guess);
    assert.deepEqual(served.places[0].sourceRecord, sourceRecord);
    const lists = buildSharedLiveTabLists(served);
    assert.ok(lists.hotels[0].includes(`src="${guess}"`));
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

test('upstream GET preserves logos, provenance, payload and non-success responses', async () => {
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
    assert.deepEqual(served, upstream);
    assert.equal(served.thingOverrides['place:1'].logoUrl, guess);
    assert.equal(served.places[1].logoUrl, guess);
    assert.equal(served.thingOverrides['place:2'].logoUrl, guess);
    assert.equal(res.headers['content-type'], 'application/json');
    assert.equal(res.headers['cache-control'], 'no-store');
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

test('provenance checker rejects aggregate icon services independently of served selection', () => {
  for (const logoUrl of [
    'https://www.google.com/s2/favicons?domain=hotel.test',
    'https://t2.gstatic.com/faviconV2?url=hotel.test',
    'https://icons.duckduckgo.com/ip3/hotel.test.ico',
    'https://logo.clearbit.com/hotel.test',
    'https://icon.horse/icon/hotel.test',
    'https://api.faviconkit.com/hotel.test/64',
    'https://favicongrabber.com/api/grab/hotel.test',
    'https://favicon.io/hotel.png',
  ]) {
    assert.equal(effectiveCcabDeclaredLogoUrl({ website, logoUrl }), '', logoUrl);
  }
  assert.equal(effectiveCcabDeclaredLogoUrl(sourceRecord), declared);
  assert.equal(effectiveCcabDeclaredLogoUrl(), '');
});

test('favicon provenance requires an own-site document rather than an image or credential URL', () => {
  const page = 'https://hotel.test/';
  const icon = 'https://hotel.test/favicon.ico?version=1#icon';
  const record = { website: page, logoUrl: icon };
  for (const pageUrl of [
    icon,
    'https://hotel.test/logo.png',
    'https://hotel.test/favicon.ico',
    'https://user:password@hotel.test/',
    'data:text/html,icon',
    'not a URL',
    'https://directory.test/hotel',
  ]) {
    assert.equal(effectiveCcabDeclaredLogoUrl({ ...record, logoProvenance: { pageUrl, iconUrl: icon } }), '', pageUrl);
  }
  const valid = { ...record, logoProvenance: { pageUrl: 'https://www.hotel.test/about', iconUrl: icon } };
  const before = structuredClone(valid);
  assert.equal(effectiveCcabDeclaredLogoUrl(valid), icon);
  assert.deepEqual(valid, before, 'validation must not mutate provenance');
});
