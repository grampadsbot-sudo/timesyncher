#!/usr/bin/env node
import assert from 'node:assert/strict';

import { insertTripThing } from '../src/vacation/trip-things.mjs';

const tripId = '716d3a1f-60be-4bca-8993-dbe8bcb3196a';
let assignCalls = 0;

const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (/from trip_things/i.test(text) && /source in/i.test(text)) return [];
  if (/insert into trip_things/i.test(text)) return [{ id: 'thing-1' }];
  if (/count\(\*\)/i.test(text) && /trip_things/i.test(text)) return [{ n: 1 }];
  if (/update trips/i.test(text)) {
    assignCalls += 1;
    const patch = values.find((v) => v?.publicSlug);
    assert.ok(patch?.publicUrl, 'assignTripSiteUrl stores publicUrl');
    return [{ public_slug: patch.publicSlug }];
  }
  if (/select metadata\s/i.test(text) && !/->>'publicSlug'/i.test(text)) return [{ metadata: {} }];
  if (/select metadata->>'publicSlug'/i.test(text)) return [{ public_slug: '' }];
  throw new Error(`unexpected ${text.slice(0, 120)}`);
};

const env = { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' };
const written = await insertTripThing(db, {
  tripId,
  requestId: 'req-1',
  thing: { title: 'Museum', category: 'activity', source: 'brave', location: { lat: 1, lng: 2 } },
  env,
});
assert.equal(written?.id, 'thing-1');
assert.equal(assignCalls, 1);

console.log('trip things site url hook passed');
