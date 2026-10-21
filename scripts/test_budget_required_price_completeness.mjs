#!/usr/bin/env node
import assert from 'node:assert/strict';

import { budgetCompletenessChecks } from '../apps/vacation-client/src/lib/budgetModel.mjs';
import { gateBBudgetPriceCompleteness } from '../src/vacation/gate-b-budget-price-completeness.mjs';

function miniTrip(places, overrides = {}) {
  return {
    trip: { currency: 'USD' },
    places,
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
assert.equal(missingFlightGate.pass, false, 'missing flight price must fail Gate B budget price completeness');
const missingFlightChecks = budgetCompletenessChecks(missingFlightTrip);
assert.equal(
  missingFlightChecks.find((check) => check.name === 'required_travel_budget_prices')?.pass,
  false,
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

console.log('budget required price completeness tests passed');
