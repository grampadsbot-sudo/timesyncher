import assert from 'node:assert/strict';

import sharedTripHandler, { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { collaboratorEulaAcceptUrl } from '../src/vacation/collaborators.mjs';
import { publicTripUrl, sharedTripWebsiteUrl, webAccessAcceptUrl } from '../src/vacation/web-access.mjs';
import { intakeShareSlug as slugFn } from '../src/vacation/intake-shared-trip.mjs';

const UPSTREAM_SLUG = 'sample-shared-slug-01';

const env = {
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com/',
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://trek-upstream.example.com/',
  TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://trek-upstream.example.com/',
};

const savedEnv = {};
for (const key of Object.keys(env)) {
  savedEnv[key] = process.env[key];
  process.env[key] = env[key];
}

const tripId = '01234567-89ab-4cde-8f01-23456789abcd';
assert.equal(intakeShareSlug(tripId), 'intake-0123456789ab');
assert.equal(sharedTripWebsiteUrl('intake-0123456789ab', env), 'https://vacation-staging.timesyncher.com/shared/intake-0123456789ab/');
assert.equal(sharedTripWebsiteUrl(UPSTREAM_SLUG, env), `https://vacation-staging.timesyncher.com/shared/${UPSTREAM_SLUG}/`);
assert.equal(publicTripUrl({ metadata: { publicSlug: UPSTREAM_SLUG } }, env), `https://vacation-staging.timesyncher.com/shared/${UPSTREAM_SLUG}/`);
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
  await sharedTripHandler({ method: 'GET', url: `/api/shared/${UPSTREAM_SLUG}`, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(upstreamUrl, new RegExp(`^https://trek-upstream\\.example\\.com/api/shared/${UPSTREAM_SLUG}`));

  upstreamUrl = '';
  const miss = mockRes();
  await sharedTripHandler({ method: 'GET', url: `/api/shared/${slugFn(tripId)}`, headers: {} }, miss);
  assert.equal(miss.statusCode, 404);
  assert.equal(upstreamUrl, '');
} finally {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  useSharedTripDatabase(null);
  globalThis.fetch = originalFetch;
}

console.log('shared trek link routing passed');
