#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  finalizeServedSharedTripPayload,
  projectServedBoundaryLogosForHttp,
} from '../src/vacation/shared-trip-served-page.mjs';
import sharedTripHandler, { loadSharedTripPayload, useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import {
  resetSharedUpstreamCacheForTests,
  sharedUpstreamCacheKey,
  writeCachedUpstreamShared,
} from '../src/vacation/shared-trip-upstream-cache.mjs';
import { intakeShareSlug, intId } from '../src/vacation/intake-shared-trip.mjs';
import { GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';

const JOHNS_DUCK = 'https://icons.duckduckgo.com/ip3/johnsofbleecker.com.ico';
const gstaticJohns = /t2\.gstatic\.com\/faviconV2.*johnsofbleecker/i;

function mockReq(method, url) {
  return { method, url, headers: { accept: 'application/json' } };
}

function assertJohnsRepaired(payload, label) {
  const place = payload.places.find((row) => row.id === 682);
  assert.ok(place, `${label} missing place 682`);
  assert.doesNotMatch(place.logoUrl, /duckduckgo\.com\/ip3\/johnsofbleecker\.com\.ico/, `${label} place logo`);
  assert.match(place.logoUrl, gstaticJohns, `${label} place logo gstatic`);
  const override = payload.thingOverrides['place:682'];
  assert.ok(override?.logoUrl, `${label} missing override logo`);
  assert.equal(override.logoUrl, place.logoUrl, `${label} place/override logo mismatch`);
}

const frozenInput = {
  places: [{ id: 682, name: "John's", logoUrl: JOHNS_DUCK, website: 'https://www.johnsofbleecker.com/' }],
  thingOverrides: { 'place:682': { logoUrl: JOHNS_DUCK, website: 'https://www.johnsofbleecker.com/' } },
  trip: { metadata: { arbitraryProbe: 'logo-760-http' } },
};
const inputSnapshot = structuredClone(frozenInput);
const finalized = finalizeServedSharedTripPayload(frozenInput);
assert.equal(finalized.places[0].logoUrl, JOHNS_DUCK, 'finalize preserves stored duckduckgo url');
assert.equal(finalized.thingOverrides['place:682'].logoUrl, JOHNS_DUCK, 'finalize override preserved');
const projected = projectServedBoundaryLogosForHttp(finalized);
assertJohnsRepaired(projected, 'http projection');
assert.deepEqual(frozenInput, inputSnapshot, 'finalize must not mutate input');
const again = projectServedBoundaryLogosForHttp(projected);
assert.deepEqual(projected.places[0].logoUrl, again.places[0].logoUrl, 'projection idempotent');

const offline = await loadSharedTripPayload(GATE_B_APPROVED_SHARED_SLUG);
assert.ok(offline?.places?.length, 'offline payload');
assertJohnsRepaired(offline, 'offline');

resetSharedUpstreamCacheForTests();
const upstreamSlug = `logo760-upstream-${Date.now().toString(36)}`;
const upstreamBody = structuredClone(frozenInput);
upstreamBody.places[0].id = 908760;
upstreamBody.thingOverrides = { 'place:908760': { ...frozenInput.thingOverrides['place:682'] } };
delete upstreamBody.trip;
writeCachedUpstreamShared(sharedUpstreamCacheKey(upstreamSlug, ''), {
  status: 200,
  body: Buffer.from(JSON.stringify(upstreamBody)),
  json: upstreamBody,
  contentType: 'application/json',
});
const prevTrek = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = 'http://127.0.0.1:9';
try {
  const fromCache = await loadSharedTripPayload(upstreamSlug, mockReq('GET', `/api/shared/${upstreamSlug}/`));
  assert.ok(fromCache, 'upstream cache payload');
  const place = fromCache.places.find((row) => row.id === 908760);
  assert.match(place.logoUrl, gstaticJohns, 'upstream cache place logo');
  assert.equal(fromCache.thingOverrides['place:908760'].logoUrl, place.logoUrl, 'upstream cache override');
} finally {
  if (prevTrek == null) delete process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
  else process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = prevTrek;
}

const tripId = '760aaaaa-bbbb-4ccc-8ddd-eeeeeeee7600';
const slug = intakeShareSlug(tripId);
assert.ok(slug.startsWith('intake-'), 'intake slug');
function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}
const thingRowId = 908761;
const placeId = intId(thingRowId);
useSharedTripDatabase((strings) => {
  const text = sqlText(strings);
  if (text.includes('metadata->>\'publicSlug\'')) {
    return [{
      id: tripId,
      title: 'Logo 760 intake',
      destination: 'NYC',
      start_date: '2026-06-01',
      end_date: '2026-06-07',
      metadata: { publicSlug: slug, intakeShare: 'true' },
      status: 'onboarding',
    }];
  }
  if (text.includes('replace(id::text')) {
    return [{
      id: tripId,
      title: 'Logo 760 intake',
      destination: 'NYC',
      start_date: '2026-06-01',
      end_date: '2026-06-07',
      metadata: { publicSlug: slug, intakeShare: 'true' },
      status: 'onboarding',
    }];
  }
  if (text.includes('from trip_things')) {
    return [{
      id: thingRowId,
      category: 'restaurant',
      title: "John's intake probe",
      description: '',
      metadata: { logoUrl: JOHNS_DUCK, website: 'https://www.johnsofbleecker.com/' },
      ratings: null,
      location: null,
      source: null,
      starts_at: null,
    }];
  }
  return [];
});
const intake = await loadSharedTripPayload(slug);
assert.ok(intake?.places?.length, 'intake payload');
const intakePlace = intake.places.find((row) => row.id === placeId);
assert.match(intakePlace.logoUrl, gstaticJohns, 'intake place logo');
assert.equal(intake.thingOverrides[`place:${intakePlace.id}`].logoUrl, intakePlace.logoUrl, 'intake override');
const mockRes = {
  statusCode: 0,
  headers: {},
  body: '',
  setHeader() {},
  end(chunk) {
    this.body = String(chunk || '');
  },
};
await sharedTripHandler({ method: 'GET', url: `/api/shared?trekPath=${slug}`, headers: {} }, mockRes);
assert.equal(mockRes.statusCode, 200, 'handler GET status');
const fromHandler = JSON.parse(mockRes.body);
const handlerPlace = fromHandler.places.find((row) => row.id === placeId);
assert.match(handlerPlace.logoUrl, gstaticJohns, 'handler response place logo');
useSharedTripDatabase(null);

console.log(JSON.stringify({
  event: 'shared_trip_http_logo_boundary_760',
  finalize: true,
  offline: true,
  upstream_cache: true,
  intake: true,
  place_682_url: offline.places.find((row) => row.id === 682).logoUrl,
}));