#!/usr/bin/env node
import assert from 'node:assert/strict';

import { budgetHardcodedHits } from './shepherd-staging-smoke-map-lib.mjs';
import { prepareSharedTripForLiveApp } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import {
  applyTripMetadataBudgetTargets,
  trekBudgetAmount,
  tripBudgetTargetTotal,
} from '../src/vacation/shared-trip-api-budget.mjs';

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

const gateHotelA = 2001;
const gateHotelB = 2002;
const gateCarHertz = 2003;
const gateCarAlamo = 2004;
const gateShared = prepareSharedTripForLiveApp({
  ...base,
  places: [
    { id: gateHotelA, name: 'Hyatt Regency Maui Resort & Spa', category_name: 'Hotel', category: { name: 'Hotel', icon: '🧳' } },
    { id: gateHotelB, name: "The Westin Maui Resort & Spa, Ka'anapali", category_name: 'Hotel', category: { name: 'Hotel', icon: '🧳' } },
    { id: gateCarHertz, name: 'Hertz', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
    { id: gateCarAlamo, name: 'Alamo rental', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
  ],
  thingOverrides: {
    __budgetTargets: { 'overall:Cars': '200' },
    [`place:${gateCarHertz}`]: { price: 45, category: 'car' },
    [`place:${gateCarAlamo}`]: { price: 55, category: 'car' },
  },
});

const gateAllowed = new Set(gateShared.budget.map((line) => Number(line.total_price)));
assert.equal(gateAllowed.has(0), true, 'unpriced hotel rows and $0 bucket headers must be on API budget');
assert.equal(gateAllowed.has(45), true);
assert.equal(gateAllowed.has(55), true);
assert.equal(gateAllowed.has(100), true, 'trip and cars planned totals must be on API budget');
assert.equal(gateAllowed.has(200), true, 'trip budget cap from __budgetTargets must be on API budget');

const gateBodySnippet = [
  'Overall trip budget',
  'Trip total',
  '$100 / $200',
  'Under by $100',
  'Hotel',
  '$0 /',
  '$0 timeline',
  'Hyatt Regency Maui Resort & Spa',
  'Add price',
  "The Westin Maui Resort & Spa, Ka'anapali",
  'Cars',
  '$100 /',
  'Under by $100',
  'Hertz',
  '$45',
  'Alamo rental',
].join('\n');
const gateHits = budgetHardcodedHits(gateBodySnippet, gateShared.budget);
assert.deepEqual(gateHits, [], `Gate B budget tab scrape must match API lines: ${JSON.stringify(gateHits)}`);

const metadataTrip = {
  id: tripId,
  title: 'Maui',
  start_date: '2027-03-10',
  end_date: '2027-03-17',
  metadata: {
    __budgetTargets: { 'overall:Cars': '200' },
  },
};
const metadataShared = prepareSharedTripForLiveApp(
  applyTripMetadataBudgetTargets(
    {
      ...base,
      trip: { id: tripId, title: 'Maui', start_date: '2027-03-10', end_date: '2027-03-17', currency: 'usd' },
      places: [
        { id: gateCarHertz, name: 'Hertz', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
        { id: gateCarAlamo, name: 'Alamo rental', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
      ],
      thingOverrides: {
        [`place:${gateCarHertz}`]: { price: 45, category: 'car' },
        [`place:${gateCarAlamo}`]: { price: 55, category: 'car' },
      },
    },
    metadataTrip,
  ),
);
assert.equal(tripBudgetTargetTotal(metadataShared), 200);
assert.equal(metadataShared.budget.some((line) => Number(line.total_price) === 200), true);
const metadataGateHits = budgetHardcodedHits(gateBodySnippet, metadataShared.budget);
assert.deepEqual(metadataGateHits, [], `metadata budget targets must sync to API: ${JSON.stringify(metadataGateHits)}`);

const unpricedRestaurant = prepareSharedTripForLiveApp({ ...base, places: [{ id: 9, name: 'Cafe', category_name: 'Restaurant' }] });
assert.equal(unpricedRestaurant.budget.some((line) => Number(line.total_price) === 0), true);

console.log('shared trip API budget lines sync passed');
