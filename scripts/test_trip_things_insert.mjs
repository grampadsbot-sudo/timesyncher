#!/usr/bin/env node
import assert from 'node:assert/strict';
import { insertTripThing, TripThingInsertError } from '../src/vacation/trip-things.mjs';

const thing = {
  title: 'Harbor Cafe',
  category: 'restaurant',
  source: 'brave',
  metadata: { sourceRef: { source: 'brave', id: 'brave-1' } },
};

await assert.rejects(
  () => insertTripThing(async () => [], { tripId: 'trip-1', requestId: 'req-1', thing }),
  (error) => error instanceof TripThingInsertError && /returned no row/i.test(error.message),
);

const written = await insertTripThing(
  async () => [{ id: 'trip-thing-42' }],
  { tripId: 'trip-1', requestId: 'req-1', thing },
);
assert.equal(written.id, 'trip-thing-42');
assert.equal(written.source, 'brave');

console.log(JSON.stringify({
  ok: true,
  checked: 'trip-things-insert',
  tests: ['insertTripThing_throws_when_no_returning_row'],
}));
