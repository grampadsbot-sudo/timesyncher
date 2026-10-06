#!/usr/bin/env node
import assert from 'node:assert/strict';

import { budgetHardcodedHits } from './shepherd-staging-smoke-map-lib.mjs';
import { prepareSharedTripForLiveApp } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import { trekBudgetAmount } from '../src/vacation/shared-trip-api-budget.mjs';

const tripId = 63357430;
const base = {
  trip: { id: tripId, title: 'Maui', start_date: '2027-03-10', end_date: '2027-03-17', currency: 'usd' },
  days: [],
  places: [],
  assignments: {},
  thingOverrides: {},
  permissions: { share_map: true, share_bookings: true, share_packing: false, share_budget: true, share_collab: false },
  budget: [],
};

const hotelId = 1001;
const carAId = 1002;
const carBId = 1003;
const shared = prepareSharedTripForLiveApp({
  ...base,
  places: [
    { id: hotelId, name: 'Hyatt Regency Maui', category_name: 'Hotel', category: { name: 'Hotel', icon: '🧳' } },
    { id: carAId, name: 'Hertz OGG', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
    { id: carBId, name: 'Alamo OGG', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
  ],
  thingOverrides: {
    [`place:${hotelId}`]: { price: '$100/night', stayDays: 4, category: 'hotel' },
    [`place:${carAId}`]: { price: 45, category: 'car' },
    [`place:${carBId}`]: { price: 55, category: 'car' },
  },
});

assert.equal(shared.budget.length > 0, true, 'priced shared trip must expose API budget lines');
const allowed = new Set(shared.budget.map((line) => Number(line.total_price)));
assert.equal(allowed.has(400), true, 'hotel stay total must be on API budget');
assert.equal(allowed.has(45), true);
assert.equal(allowed.has(55), true);

const hotelAmt = trekBudgetAmount(
  shared.places[0],
  shared.thingOverrides[`place:${hotelId}`],
  'hotel',
);
assert.equal(hotelAmt.amount, 400);

const budgetTabText = [
  'Overall trip budget',
  'Trip total',
  '$100',
  '$400',
  '$45',
  '$55',
  '$500',
].join(' ');
const hits = budgetHardcodedHits(budgetTabText, shared.budget);
assert.deepEqual(hits, [], `budget tab amounts must match API lines: ${JSON.stringify(hits)}`);

const emptyBudget = prepareSharedTripForLiveApp({ ...base, places: [{ id: 9, name: 'Cafe', category_name: 'Restaurant' }] });
assert.deepEqual(emptyBudget.budget, []);

console.log('shared trip API budget lines sync passed');
