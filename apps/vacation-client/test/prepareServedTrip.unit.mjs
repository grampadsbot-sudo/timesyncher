import assert from 'node:assert/strict';
import { prepareServedSharedTrip } from '../src/lib/prepareServedTrip.mjs';
import { finalizeServedSharedTripPayload } from '../../../src/vacation/shared-trip-served-page.mjs';

assert.equal(prepareServedSharedTrip, finalizeServedSharedTripPayload,
  'React uses the existing presentation finalizer');
const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = () => {
  requests += 1;
  throw new Error('payload presentation must not discover source data');
};
try {
  const payload = {
    trip: { id: 'source-only' },
    days: [{ id: 51, day_number: 1 }],
    places: [{ id: 1, name: 'Neighborhood cafe', category_name: 'Restaurant' }],
    assignments: { 51: [{ place_id: 1 }] },
    thingOverrides: { 'place:1': {
      category: 'restaurant', timeline: true,
      sourceRecord: {
        websiteFlavour: 'The kitchen serves seasonal lunches at the counter.',
        price: 25, lat: 41.2, lng: -72.4,
      },
    } },
  };
  const prepared = prepareServedSharedTrip(structuredClone(payload));
  assert.equal(prepared instanceof Promise, false);
  assert.deepEqual(prepared, finalizeServedSharedTripPayload(structuredClone(payload)));
  assert.equal(prepared.places.length, 1);
  assert.equal(prepared.places[0].id, 1);
  assert.equal(prepared.assignments[51][0].place_id, 1);
  assert.equal(prepared.thingOverrides['place:1'].sourceRecord.price, 25);
  assert.equal(requests, 0, 'serializing saved payloads is network-free');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('vacation-client served trip adapter unit checks passed');
