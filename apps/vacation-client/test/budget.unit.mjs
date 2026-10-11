import assert from 'node:assert/strict';

import {
  bucketTargetAmount,
  budgetLineAmount,
  budgetCompletenessScore,
  buildBudgetModel,
  placesForBudget,
  tripBudgetTargetTotal,
} from '../src/lib/budgetModel.mjs';
import { numericPrice } from '../src/lib/listTabModel.mjs';

const hotelTrip = {
  trip: { currency: 'USD' },
  places: [{ id: 1, name: 'Midtown sample hotel', category_name: 'Hotel' }],
  thingOverrides: {
    'place:1': { price: 389, stayDays: 4, category: 'hotel' },
  },
};

const hotelAmt = budgetLineAmount(hotelTrip.places[0], hotelTrip);
assert.equal(hotelAmt.amount, 1556);
assert.equal(hotelAmt.nightly, 389);

const flightTrip = {
  trip: { currency: 'USD' },
  places: [{ id: 2, name: 'JetBlue BOS → JFK', category_name: 'Flight' }],
  thingOverrides: {
    'place:2': { price: 248, fareDirection: 'one-way', category: 'flight' },
  },
};
assert.equal(budgetLineAmount(flightTrip.places[0], flightTrip).amount, 496);

const model = buildBudgetModel(hotelTrip);
assert.equal(model.buckets.find((b) => b.label === 'Hotel')?.planned, 1556);
assert.equal(model.tripPlanned, 1556);

const targetsTrip = {
  trip: { currency: 'USD' },
  places: [
    { id: 10, name: 'Hertz', category_name: 'Car' },
    { id: 11, name: 'Alamo', category_name: 'Car' },
  ],
  thingOverrides: {
    __budgetTargets: { 'overall:Cars': '200' },
    'place:10': { price: 45, category: 'car' },
    'place:11': { price: 55, category: 'car' },
  },
};
assert.equal(bucketTargetAmount(targetsTrip, 'Cars'), 200);
assert.equal(tripBudgetTargetTotal(targetsTrip), 200);
const carsBucket = buildBudgetModel(targetsTrip).buckets.find((b) => b.label === 'Cars');
assert.equal(carsBucket?.planned, 100);
assert.equal(carsBucket?.variance, 'Under by $100');

const metaTargetsTrip = {
  trip: {
    currency: 'USD',
    metadata: { __budgetTargets: { 'overall:Flights': '900' } },
  },
  places: [{ id: 3, name: 'Southwest LAS-LGA', category_name: 'Flight' }],
  thingOverrides: { 'place:3': { price: '$164', category: 'flight' } },
};
assert.equal(bucketTargetAmount(metaTargetsTrip, 'Flights'), 900);

const unionTrip = {
  trip: { currency: 'USD' },
  days: [{ id: 50, day_number: 1 }],
  places: [
    { id: 20, name: 'On day flight', category_name: 'Flight' },
    { id: 21, name: 'List-only hotel', category_name: 'Hotel' },
  ],
  assignments: { 50: [{ place_id: 20, place: { id: 20, name: 'On day flight' } }] },
  thingOverrides: {
    'place:20': { dayIds: [50], category: 'flight', price: 100 },
    'place:21': { category: 'hotel', price: 50 },
  },
};
const budgetPlaces = placesForBudget(unionTrip);
assert.equal(budgetPlaces.length, 2);
assert.equal(numericPrice(budgetPlaces[1], unionTrip), 50);

const score = budgetCompletenessScore(unionTrip);
assert.equal(score.pass, score.total);
assert.ok(score.total >= 4);

console.log('vacation-client budget unit checks passed');
