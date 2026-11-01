#!/usr/bin/env node
import assert from 'node:assert/strict';

import { budgetCompletenessChecks } from '../apps/vacation-client/src/lib/budgetModel.mjs';
import { gateBBudgetPriceCompleteness } from '../src/vacation/gate-b-budget-price-completeness.mjs';
import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import {
  carPriceDisplay,
  flightPriceDisplay,
  hotelPriceDisplay,
} from '../apps/vacation-client/src/lib/listTabModel.mjs';

function miniTrip(places, overrides = {}) {
  const dayId = 50;
  const assignments = {
    [dayId]: places.map((place) => ({
      place_id: place.id,
      place: { id: place.id, name: place.name },
    })),
  };
  return {
    trip: { currency: 'USD' },
    days: [{ id: dayId, day_number: 1 }],
    places,
    assignments,
    thingOverrides: overrides,
  };
}

const missingFlightTrip = miniTrip(
  [
    { id: 1, name: 'Southwest LAS-JFK', category_name: 'Flight' },
    { id: 2, name: 'Hertz JFK', category_name: 'Car' },
    { id: 3, name: 'Midtown hotel', category_name: 'Hotel' },
  ],
  {
    'place:2': { price: 72, category: 'car' },
    'place:3': { price: '$250-$350/night', category: 'hotel', stayDays: 3 },
  },
);

const missingFlightGate = gateBBudgetPriceCompleteness(missingFlightTrip);
assert.equal(
  missingFlightGate.pass,
  true,
  'flight without explicit price must use VK category estimate for Gate B budget completeness',
);
const missingFlightChecks = budgetCompletenessChecks(missingFlightTrip);
assert.equal(
  missingFlightChecks.find((check) => check.name === 'required_travel_budget_prices')?.pass,
  true,
);

const optionalOnlyTrip = miniTrip(
  [
    { id: 10, name: 'Southwest LAS-JFK', category_name: 'Flight' },
    { id: 11, name: 'Hertz JFK', category_name: 'Car' },
    { id: 12, name: 'Carbone', category_name: 'Restaurant' },
    { id: 13, name: 'Jazz club', category_name: 'Event' },
  ],
  {
    'place:10': { price: 348, category: 'flight' },
    'place:11': { price: 72, category: 'car' },
  },
);

const optionalGate = gateBBudgetPriceCompleteness(optionalOnlyTrip);
assert.equal(optionalGate.pass, true, 'missing restaurant/event prices must not fail required travel rule');
assert.equal(optionalGate.optionalMissingPriceCount, 2);
const optionalReport = budgetCompletenessChecks(optionalOnlyTrip).find(
  (check) => check.name.startsWith('report_optional_budget_missing_prices_'),
);
assert.equal(optionalReport?.name, 'report_optional_budget_missing_prices_2');
assert.equal(optionalReport?.pass, true);

const dayId = 50;
const estimatedTravelTrip = applyLiveAppListRowFields({
  trip: { currency: 'USD' },
  days: [{ id: dayId, day_number: 1 }],
  places: [
    { id: 1, name: 'American Airlines JFK to LAS', category_name: 'Flight' },
    { id: 2, name: 'Arthouse Hotel', category_name: 'Hotel' },
    { id: 3, name: 'Dollar JFK', category_name: 'Car' },
  ],
  assignments: {
    [dayId]: [
      { place_id: 1, place: { id: 1, name: 'American Airlines JFK to LAS' } },
      { place_id: 2, place: { id: 2, name: 'Arthouse Hotel' } },
      { place_id: 3, place: { id: 3, name: 'Dollar JFK' } },
    ],
  },
  thingOverrides: {
    'place:1': { category: 'flight' },
    'place:2': { category: 'hotel' },
    'place:3': { category: 'car' },
  },
});
assert.match(flightPriceDisplay(estimatedTravelTrip.places[0], estimatedTravelTrip), /^\$/);
assert.match(hotelPriceDisplay(estimatedTravelTrip.places[1], estimatedTravelTrip), /^\$/);
assert.match(carPriceDisplay(estimatedTravelTrip.places[2], estimatedTravelTrip), /^\$/);
assert.equal(gateBBudgetPriceCompleteness(estimatedTravelTrip).pass, true);

console.log('budget required price completeness tests passed');
