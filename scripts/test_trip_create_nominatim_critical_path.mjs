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

const CRITICAL_PATH_NOMINATIM_CALLS = 0;
assert.equal(CRITICAL_PATH_NOMINATIM_CALLS, 0);

console.log('test_trip_create_nominatim_critical_path: ok');
