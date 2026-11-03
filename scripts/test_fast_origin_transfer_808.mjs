import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import { responseHeader, SHARED_TRIP_JSON_CACHE_CONTROL, sendJson, sendSharedTripJson } from '../src/vacation/http.mjs';
import {
  readCachedUpstreamShared,
  resetSharedUpstreamCacheForTests,
  sharedUpstreamCacheKey,
  writeCachedUpstreamShared,
} from '../src/vacation/shared-trip-upstream-cache.mjs';
import trekStyle2BundleHandler from '../src/vacation/trek-style2-bundle.mjs';
import versionHandler, { buildSha } from '../routes/version.mjs';
import { GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    end(payload) {
      this.body = payload ?? '';
    },
  };
}

resetSharedUpstreamCacheForTests();
const cacheKey = sharedUpstreamCacheKey('demo-slug', 'foo=1');
writeCachedUpstreamShared(cacheKey, { status: 200, body: Buffer.from('{}'), json: {}, contentType: 'application/json' });
assert.equal(readCachedUpstreamShared(cacheKey)?.status, 200);
resetSharedUpstreamCacheForTests();

const sharedRes = mockRes();
sendSharedTripJson(sharedRes, 200, { ok: true, places: [] });
assert.equal(sharedRes.headers['cache-control'], SHARED_TRIP_JSON_CACHE_CONTROL);
assert.doesNotMatch(sharedRes.body, /\n  "/);

const offlineRes = mockRes();
await sharedTripHandler({ method: 'GET', url: `/api/shared/${GATE_B_APPROVED_SHARED_SLUG}/`, headers: {} }, offlineRes);
assert.equal(offlineRes.statusCode, 200);
assert.equal(offlineRes.headers['cache-control'], SHARED_TRIP_JSON_CACHE_CONTROL);
assert.doesNotMatch(String(offlineRes.body), /\n  "places"/);

const bundleRes = mockRes();
await trekStyle2BundleHandler({ method: 'GET', url: '/api/vacation-itinerary?trekBundle=1', headers: {} }, bundleRes);
assert.equal(bundleRes.statusCode, 307);
assert.equal(bundleRes.headers.location, '/assets/index-BKun7ofk.js');
assert.match(bundleRes.headers['cache-control'], /immutable/);

const requestJs = await readFile(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
assert.match(requestJs, /progressOnly: '1'/);
assert.match(requestJs, /delayMs = 15000/);
assert.match(requestJs, /setTimeout\(runPoll/);
assert.doesNotMatch(requestJs, /setInterval\(poll, 1000\)/);

const itinerarySrc = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(itinerarySrc, /progressOnly/);

process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
const sha = buildSha();
const versionRes = mockRes();
await versionHandler({
  method: 'GET',
  url: '/api/version?poll=1',
  headers: { 'if-none-match': `"${sha}"` },
}, versionRes);
assert.equal(versionRes.statusCode, 304);
assert.equal(versionRes.body, '');

const minimalRes = { statusCode: 0, headers: {}, setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; }, end() {} };
assert.equal(responseHeader(minimalRes, 'cache-control'), undefined);
sendJson(minimalRes, 200, { ok: true });
assert.equal(minimalRes.headers['cache-control'], 'no-store');

const versionBodyRes = mockRes();
await versionHandler({ method: 'GET', url: '/api/version?poll=1', headers: {} }, versionBodyRes);
const versionPayload = JSON.parse(versionBodyRes.body);
assert.equal(versionPayload.ok, true);
assert.equal(versionPayload.sha, sha);
assert.equal(Object.keys(versionPayload).length, 2);

console.log('fast origin transfer 808 checks passed');
