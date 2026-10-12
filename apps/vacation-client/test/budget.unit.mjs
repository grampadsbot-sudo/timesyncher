import assert from 'node:assert/strict';

import {
  bucketTargetAmount,
  budgetLineAmount,
  budgetCompletenessScore,
  buildBudgetModel,
  placesForBudget,
  tripBudgetTargetTotal,
} from '../src/lib/budgetModel.mjs';
import {
  budgetLineDisplayName,
  catalogRowDisplayName,
  numericPrice,
} from '../src/lib/listTabModel.mjs';

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

const americanPlace = {
  id: 7,
  name: 'Flight option: American LAS-JFK 2026-06-23 12:37-20:59',
  category_name: 'Flight',
};
assert.equal(
  catalogRowDisplayName(americanPlace, { places: [americanPlace] }),
  'American LAS-JFK 2026-06-23 12:37-20:59',
);
assert.equal(
  budgetLineDisplayName(americanPlace, { places: [americanPlace] }),
  'Flight option: American LAS-JFK 2026-06-23 12:37-20:59',
);
const americanBudget = buildBudgetModel({
  trip: { currency: 'USD' },
  places: [americanPlace],
  thingOverrides: { 'place:7': { price: 312, category: 'flight' } },
});
const americanRow = americanBudget.buckets
  .find((b) => b.label === 'Flights')
  ?.rows.find((row) => row.place.id === 7);
assert.equal(
  americanRow?.name,
  'Flight option: American LAS-JFK 2026-06-23 12:37-20:59',
);

const timelineFlightTrip = {
  trip: { currency: 'USD' },
  days: [{ id: 1, day_number: 1, title: 'Day 1' }],
  places: [
    {
      id: 88,
      name: 'Flight option: Southwest LAS-LGA 2026-06-23 07:25-16:35',
      category_name: 'other',
    },
  ],
  assignments: { 1: [] },
  thingOverrides: { 'place:88': { timeline: false, price: 164, category: 'other' } },
};
const timelineBudget = buildBudgetModel(timelineFlightTrip);
assert.ok(
  timelineBudget.rows.some((row) => /Southwest LAS-LGA/i.test(row.name)),
  'catalog flights on day 1 timeline must appear on Budget',
);

console.log('vacation-client budget unit checks passed');
