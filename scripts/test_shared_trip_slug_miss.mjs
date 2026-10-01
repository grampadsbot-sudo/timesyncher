import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharedTripHandler, { intakeSharedResponse, useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';

const handlerSource = await readFile(new URL('../src/vacation/shared-trip-handler.mjs', import.meta.url), 'utf8');
assert.equal(handlerSource.includes('travel.timesyncher.com'), false);
assert.equal(handlerSource.includes('Invalid or expired link'), false);
assert.equal(handlerSource.includes('TREK_SHARED_API_BASE'), false);
assert.equal(handlerSource.includes('.catch(() => null)'), false);
assert.match(handlerSource, /select id, category, title, description, metadata, ratings, location, source/);

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

async function invoke(req) {
  const res = mockRes();
  await sharedTripHandler(req, res);
  let json = null;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = null;
  }
  return { status: res.statusCode, body: res.body, json };
}

const originalFetch = globalThis.fetch;
let fetches = 0;
globalThis.fetch = async () => {
  fetches += 1;
  throw new Error('upstream fetch');
};

const tripId = '01234567-89ab-4cde-8f01-23456789abcd';
const slug = intakeShareSlug(tripId);
assert.equal(slug, 'intake-0123456789ab');

try {
  const missingDb = () => [];
  useSharedTripDatabase(missingDb);
  const miss = await invoke({
    method: 'GET',
    url: `/api/shared/${slug}`,
    headers: {},
  });
  assert.equal(miss.status, 404);
  assert.equal(miss.json.code, 'shared_trip_slug_not_found');
  assert.match(miss.json.error, new RegExp(slug));
  assert.equal(miss.body.includes('travel.timesyncher.com'), false);
  assert.equal(miss.body.includes('Invalid or expired link'), false);
  assert.doesNotMatch(miss.body, /expired/i);
  assert.equal(fetches, 0);

  const columnDb = (strings) => {
    const text = strings.join(' ');
    if (text.includes('from trips')) {
      return [{
        id: tripId,
        title: 'TimeSyncher Vacation Setup',
        destination: null,
        start_date: null,
        end_date: null,
        metadata: { publicSlug: slug, intakeShare: true },
      }];
    }
    if (text.includes('from trip_things')) {
      const error = new Error('column "source" does not exist');
      error.code = '42703';
      throw error;
    }
    throw new Error(`unexpected sql: ${text}`);
  };
  useSharedTripDatabase(columnDb);
  const loud = await invoke({
    method: 'GET',
    url: `/api/shared/${slug}`,
    headers: {},
  });
  assert.equal(loud.status, 500);
  assert.equal(loud.json.code, 'shared_trip_lookup_failed');
  assert.match(loud.json.error, /column "source" does not exist/);
  assert.equal(loud.body.includes('Invalid or expired link'), false);
  assert.equal(loud.body.includes('travel.timesyncher.com'), false);
  assert.doesNotMatch(loud.body, /expired/i);
  assert.equal(fetches, 0);
  await assert.rejects(
    () => intakeSharedResponse(slug, columnDb),
    /column "source" does not exist/,
  );
} finally {
  useSharedTripDatabase(null);
  globalThis.fetch = originalFetch;
}

console.log('shared trip slug miss passed');
