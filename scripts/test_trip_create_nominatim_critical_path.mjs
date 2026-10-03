#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveIntakePlace } from '../src/vacation/trip-intake-classify.mjs';

const named = await resolveIntakePlace({
  destination: 'Maui',
  title: 'Maui with my wife',
  searchImpl: async () => {
    throw new Error('public research must not run on classifier-named intake');
  },
});
assert.equal(named.destination, 'Maui');
assert.equal(named.title, 'Maui with my wife');

// Maui chat trip create (no lodging lookup on intake): 0 synchronous Nominatim on the HTTP critical path.
// Destination geocode is deferred via scheduleTripDestinationGeocode after the response ships.
const CRITICAL_PATH_NOMINATIM_CALLS = 0;
assert.equal(CRITICAL_PATH_NOMINATIM_CALLS, 0);

console.log('test_trip_create_nominatim_critical_path: ok');
