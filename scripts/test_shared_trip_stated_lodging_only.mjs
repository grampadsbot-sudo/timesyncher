#!/usr/bin/env node
import assert from 'node:assert/strict';
import { sharedTripFromIntake, customerStatedLodgingThing } from '../src/vacation/intake-shared-trip.mjs';

assert.equal(customerStatedLodgingThing({ category: 'activity', title: 'Snorkel' }), true);
assert.equal(customerStatedLodgingThing({
  category: 'hotel',
  title: 'Hyatt Regency Maui',
  source: 'prior_db',
}), false);
assert.equal(customerStatedLodgingThing({
  category: 'hotel',
  title: 'Kihei Kai Nani',
  metadata: { customerStatedLodging: true },
}), true);
assert.equal(customerStatedLodgingThing({
  category: 'hotel',
  title: 'Resolved lodging',
  source: 'brave',
  location: { lat: 20.91, lng: -156.69 },
}), true);

const shared = sharedTripFromIntake({
  trip: { id: 'trip-1', title: 'Maui', destination: 'Maui', start_date: '2026-03-07', end_date: '2026-03-13' },
  things: [
    { id: 'a', title: 'Kihei Kai Nani', category: 'hotel', metadata: { customerStatedLodging: true }, notes: [] },
    { id: 'b', title: 'Hyatt Regency Maui', category: 'hotel', metadata: { source: 'prior_db' }, notes: [] },
    { id: 'd', title: 'Brave Hyatt', category: 'hotel', source: 'brave', location: { lat: 20.91, lng: -156.69 }, notes: [] },
    { id: 'c', title: 'Snorkel tour', category: 'activity', metadata: {}, notes: [] },
  ],
});
const hotelNames = shared.places.map((place) => place.name);
assert.equal(hotelNames.includes('Kihei Kai Nani'), true);
assert.equal(hotelNames.includes('Hyatt Regency Maui'), false);
assert.equal(hotelNames.includes('Brave Hyatt'), true);
assert.equal(hotelNames.includes('Snorkel tour'), true);

console.log('test_shared_trip_stated_lodging_only: ok');
