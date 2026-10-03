#!/usr/bin/env node
import assert from 'node:assert/strict';
import { geocodeAndPersistTripDestinationCenter } from '../src/vacation/trip-destination-center.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const tripId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let updates = 0;
const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (text.includes('select metadata')) return [{ metadata: {} }];
  if (text.includes('update trips')) {
    updates += 1;
    return [];
  }
  throw new Error(text);
};

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const center = await geocodeAndPersistTripDestinationCenter(db, tripId, 'Maui', async (url) => {
  if (String(url).includes(NOMINATIM_HOST)) {
    return {
      ok: true,
      json: async () => [{ lat: '20.8', lon: '-156.3', display_name: 'Maui, Hawaii' }],
    };
  }
  throw new Error(url);
});

assert.equal(center?.lat, 20.8);
assert.equal(updates, 1);

console.log('test_trip_destination_center_geocode: ok');
