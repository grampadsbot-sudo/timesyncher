#!/usr/bin/env node
import assert from 'node:assert/strict';
import { scheduleTripDestinationGeocode } from '../src/vacation/trip-destination-center.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const tripId = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let geocodeCalls = 0;
const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (text.includes('select metadata')) return [{ metadata: {} }];
  if (text.includes('update trips')) return [];
  throw new Error(text);
};

const scheduled = scheduleTripDestinationGeocode({
  db,
  tripId,
  destinationLabel: 'Maui',
  fetchImpl: async () => {
    geocodeCalls += 1;
    return { ok: true, json: async () => [{ lat: '20.8', lon: '-156.3', display_name: 'Maui' }] };
  },
});

assert.ok(scheduled instanceof Promise, 'scheduleTripDestinationGeocode must return the geocode promise');
await scheduled;
assert.equal(geocodeCalls, 1);

console.log('test_deferred_trip_destination_geocode_schedule: ok');
