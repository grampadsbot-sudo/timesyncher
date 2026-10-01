import assert from 'node:assert/strict';

import sharedTripHandler, { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { collaboratorEulaAcceptUrl } from '../src/vacation/collaborators.mjs';
import { publicTripUrl, sharedTripWebsiteUrl, webAccessAcceptUrl } from '../src/vacation/web-access.mjs';
import { intakeShareSlug as slugFn } from '../src/vacation/intake-shared-trip.mjs';

const env = {
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com/',
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://trek-upstream.example.com/',
  TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://trek-upstream.example.com/',
};

const tripId = '01234567-89ab-4cde-8f01-23456789abcd';
assert.equal(intakeShareSlug(tripId), 'intake-0123456789ab');
assert.equal(sharedTripWebsiteUrl('intake-0123456789ab', env), 'https://vacation-staging.timesyncher.com/shared/intake-0123456789ab/');
assert.equal(sharedTripWebsiteUrl('las-vegas-vacation-3', env), 'https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/');
assert.equal(publicTripUrl({ metadata: { publicSlug: 'las-vegas-vacation-3' } }, env), 'https://vacation-staging.timesyncher.com/shared/las-vegas-vacation-3/');
assert.match(webAccessAcceptUrl('token-abc', env), /\/api\/vacation-web-access\?action=accept&token=/);
assert.match(collaboratorEulaAcceptUrl({ id: 'inv-1' }, env), /\/accept\//);

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(payload) { this.body = String(payload || ''); },
  };
}

let upstreamUrl = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  upstreamUrl = String(url);
  return new Response(JSON.stringify({ ok: true, trip: { title: 'Upstream Trek' } }), { status: 200, headers: { 'content-type': 'application/json' } });
};

useSharedTripDatabase(() => []);
try {
  const res = mockRes();
  await sharedTripHandler({ method: 'GET', url: '/api/shared/las-vegas-vacation-3', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(upstreamUrl, /^https:\/\/trek-upstream\.example\.com\/api\/shared\/las-vegas-vacation-3/);

  upstreamUrl = '';
  const miss = mockRes();
  await sharedTripHandler({ method: 'GET', url: `/api/shared/${slugFn(tripId)}`, headers: {} }, miss);
  assert.equal(miss.statusCode, 404);
  assert.equal(upstreamUrl, '');
} finally {
  useSharedTripDatabase(null);
  globalThis.fetch = originalFetch;
}

console.log('shared trek link routing passed');
