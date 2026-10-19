#!/usr/bin/env node
import assert from 'node:assert/strict';

import { buildNycPr225SharedTrip } from './fixtures/nyc-pr225-shared-trip.mjs';
import { prepareSharedTripForLiveApp } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import {
  budgetGateAllowedAmounts,
  trekBudgetAmount,
} from '../src/vacation/shared-trip-api-budget.mjs';
import {
  liveBudgetPlacesFromShared,
  placeIncludedInLiveBudgetRows,
  tripHasExplicitTimelineBudgetMembership,
} from '../src/vacation/shared-budget-itinerary-membership.mjs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { budgetHardcodedHits } from './shepherd-staging-smoke-map-lib.mjs';

const nyc = prepareSharedTripForLiveApp(buildNycPr225SharedTrip());
assert.equal(tripHasExplicitTimelineBudgetMembership(nyc), true);

const itineraryPlaces = liveBudgetPlacesFromShared(nyc);
const itineraryNames = itineraryPlaces.map((p) => String(p.name || ''));
assert.equal(itineraryNames.some((n) => n.includes('JetBlue')), true);
assert.equal(itineraryNames.some((n) => n.includes('Midtown sample')), true);
assert.equal(itineraryNames.some((n) => n.includes('Priceline opaque')), false, 'cars stay off budget');
assert.equal(itineraryNames.some((n) => n.includes('Sample NYC restaurant')), false);
assert.equal(itineraryNames.some((n) => n.includes('Sample NYC store')), false);

let itineraryPlanned = 0;
for (const place of itineraryPlaces) {
  const override = nyc.thingOverrides[`place:${place.id}`] || {};
  const category = productThingCategory(place, override);
  itineraryPlanned += trekBudgetAmount(place, override, category).amount;
}
assert.equal(itineraryPlanned, 2052, 'JetBlue 496 + hotel 1556 itinerary total');

const allowed = budgetGateAllowedAmounts(nyc);
assert.equal(allowed.has(2052), true, 'API-visible set must include itinerary trip total');
assert.equal(allowed.has(2224), false, 'catalog-wide total must not appear when itinerary flags exist');
assert.equal(allowed.has(172), false, 'timeline car price must not leak into API budget');

const offItinerary = (nyc.places || []).find((p) => String(p.name || '').includes('Sample NYC restaurant'));
assert.ok(offItinerary);
assert.equal(
  placeIncludedInLiveBudgetRows(nyc, offItinerary, nyc.thingOverrides[`place:${offItinerary.id}`]),
  false,
);

const budgetTabSnippet = [
  'Overall trip budget',
  'Trip total',
  '$2,052',
  'Flights',
  '$496',
  'Hotel',
  '$1,556',
].join('\n');
const hits = budgetHardcodedHits(budgetTabSnippet, nyc.budget, nyc);
assert.deepEqual(hits, [], `itinerary budget tab scrape must match API: ${JSON.stringify(hits)}`);

const tripId = 63357430;
const legacyShared = prepareSharedTripForLiveApp({
  trip: { id: tripId, title: 'Maui', start_date: '2027-03-10', end_date: '2027-03-17', currency: 'usd' },
  days: [],
  places: [
    { id: 1001, name: 'Hyatt Regency Maui', category_name: 'Hotel' },
    { id: 1002, name: 'Hertz OGG', category_name: 'Car' },
    { id: 1003, name: 'Alamo OGG', category_name: 'Car' },
  ],
  assignments: {},
  thingOverrides: {
    'place:1001': { price: '$100/night', stayDays: 4, category: 'hotel' },
    'place:1002': { price: 45, category: 'car' },
    'place:1003': { price: 55, category: 'car' },
  },
  permissions: { share_budget: true },
  budget: [],
});
assert.equal(tripHasExplicitTimelineBudgetMembership(legacyShared), false);
assert.equal(liveBudgetPlacesFromShared(legacyShared).length, 3, 'legacy trips keep full catalog membership');
const legacyAllowed = new Set(legacyShared.budget.map((line) => Number(line.total_price)));
assert.equal(legacyAllowed.has(45), true);
assert.equal(legacyAllowed.has(55), true);

console.log('shared trip API budget itinerary membership passed');
