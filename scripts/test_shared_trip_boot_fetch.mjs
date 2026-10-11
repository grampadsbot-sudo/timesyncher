import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { publicApiRequest } from '../api/[...route].mjs';
import sharedTripHandler, { intakeSharedResponse, useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

function builderSrc(src) {
  return src.startsWith('^') ? src : `^${src}$`;
}

function firstRoute(pathname) {
  for (const route of vercel.routes) {
    const match = pathname.match(new RegExp(builderSrc(route.src)));
    if (match) return { route, match };
  }
  return null;
}

function destUrl(route, match) {
  const dest = route.dest.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? '');
  const url = new URL(dest, 'https://timesyncher.com');
  return `${url.pathname}${url.search}`;
}

const bootPath = '/api/shared/intake-0123456789ab/';
const routed = firstRoute(bootPath.split('?')[0]);
assert.ok(routed, 'vercel route for shared boot fetch');
const invoked = destUrl(routed.route, routed.match);
const described = publicApiRequest({
  method: 'GET',
  url: invoked,
  headers: {},
  query: Object.fromEntries(new URL(invoked, 'https://timesyncher.com').searchParams),
});
assert.equal(described.handler, 'shared');
assert.match(described.url, /trekPath=intake-0123456789ab/);

const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
assert.match(sharedApp, /\/api\/shared\/\$\{encodeURIComponent\(token\)\}\//);
assert.match(sharedApp, /data-shared-boot-error/);
assert.match(sharedApp, /showSharedBootError/);
assert.doesNotMatch(sharedApp, /appendSharedTrekBundle\(\);\s*\}\)\.catch/);

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    end(payload) {
      this.body = String(payload || '');
    },
  };
}

async function invokeSharedGet(url) {
  const res = mockRes();
  await sharedTripHandler({ method: 'GET', url, headers: {} }, res);
  return { status: res.statusCode, json: JSON.parse(res.body) };
}

const tripId = '01234567-89ab-4cde-8f01-23456789abcd';
const slug = intakeShareSlug(tripId);
assert.equal(slug, 'intake-0123456789ab');

const unpublishedDb = (strings) => {
  const text = strings.join(' ');
  if (text.includes('metadata->>\'publicSlug\'')) return [];
  if (text.includes('replace(id::text')) {
    return [{
      id: tripId,
      title: '',
      destination: '',
      start_date: null,
      end_date: null,
      status: 'onboarding',
      metadata: {},
    }];
  }
  if (text.includes('from trip_things')) return [];
  throw new Error(`unexpected sql: ${text}`);
};

useSharedTripDatabase(unpublishedDb);
const loaded = await intakeSharedResponse(slug, unpublishedDb);
assert.equal(Boolean(loaded?.trip), true, 'intake slug resolves before publicSlug is stored');
assert.deepEqual(loaded.places, []);

const miss = await invokeSharedGet(`/api/shared/${slug}/`);
assert.equal(miss.status, 200, miss.body);

const missingDb = () => [];
useSharedTripDatabase(missingDb);
const notFound = await invokeSharedGet(`/api/shared/${slug}/`);
assert.equal(notFound.status, 404);
assert.equal(notFound.json.code, 'shared_trip_slug_not_found');
assert.match(notFound.json.customerMessage, /vacation app/i);
assert.equal(String(notFound.json.customerMessage).includes('shared_trip_slug_not_found'), false);

useSharedTripDatabase(null);
const oldUpstream = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
delete process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
try {
  const offline = await invokeSharedGet(`/api/shared/${GATE_B_APPROVED_SHARED_SLUG}/`);
  assert.equal(offline.status, 200, offline.json);
  assert.ok(Array.isArray(offline.json.places) && offline.json.places.length > 0, 'offline gate b fixture places');
  const wrong = await invokeSharedGet('/api/shared/not-the-gate-b-slug/');
  assert.equal(wrong.status, 500);
} finally {
  if (oldUpstream) process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = oldUpstream;
  else delete process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
}

console.log('shared trip boot fetch tests passed');
