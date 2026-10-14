import assert from 'node:assert/strict';

import {
  OTHER_THINGS_BUCKET,
  bucketDisplayLabel,
  bucketTargetAmount,
  budgetBucketForPlace,
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

const partialAssignmentTrip = {
  trip: { currency: 'USD' },
  days: [{ id: 50, day_number: 1 }],
  places: [{ id: 1, name: 'Known hotel', category_name: 'Hotel', price: 100 }],
  assignments: { 50: [{ place_id: 1, place: { id: 1 } }] },
};
const partialRow = buildBudgetModel(partialAssignmentTrip).rows.find(
  (row) => String(row.place.id) === '1',
);
assert.ok(partialRow, 'partial assignment place appears on budget');
assert.equal(partialRow.name, 'Known hotel');
assert.equal(partialRow.bucket, 'Hotel');
assert.equal(partialRow.amount, 700);
assert.equal(partialRow.hasPrice, true);
assert.equal(budgetBucketForPlace(placesForBudget(partialAssignmentTrip)[0], partialAssignmentTrip), 'Hotel');

const partialScore = budgetCompletenessScore(partialAssignmentTrip);
assert.equal(partialScore.pass, partialScore.total);

const forbiddenCustomerBucketLabel = ['Other', 'Things'].join(' ');
assert.notEqual(OTHER_THINGS_BUCKET, forbiddenCustomerBucketLabel);
assert.equal(bucketDisplayLabel(OTHER_THINGS_BUCKET), 'The Rest');
assert.equal(bucketDisplayLabel('Flights'), 'Flights');

const legacyMiscTargetKey = `overall:${forbiddenCustomerBucketLabel}`;
const legacyTargetsTrip = {
  trip: { currency: 'USD' },
  places: [{ id: 40, name: 'Broadway show', category_name: 'Event' }],
  thingOverrides: {
    __budgetTargets: { [legacyMiscTargetKey]: '500' },
    'place:40': { price: 120, category: 'event' },
  },
};
assert.equal(bucketTargetAmount(legacyTargetsTrip, OTHER_THINGS_BUCKET), 500);
assert.equal(tripBudgetTargetTotal(legacyTargetsTrip), 500);
const legacyModel = buildBudgetModel(legacyTargetsTrip);
const legacyBucket = legacyModel.buckets.find((b) => b.label === OTHER_THINGS_BUCKET);
assert.ok(legacyBucket, 'legacy misc target resolves to Events bucket');
assert.equal(legacyBucket.displayLabel, 'The Rest');
assert.equal(legacyBucket.target, 500);
const rendered = JSON.stringify(legacyModel);
assert.equal(rendered.includes(forbiddenCustomerBucketLabel), false);
assert.equal(
  bucketTargetAmount(legacyTargetsTrip, forbiddenCustomerBucketLabel),
  500,
  'lookup by legacy bucket name in key must resolve',
);
const legacyScore = budgetCompletenessScore(legacyTargetsTrip);
assert.equal(
  legacyScore.checks.some((c) => c.name === `saved_target_${forbiddenCustomerBucketLabel}` && c.pass),
  true,
);

console.log('vacation-client budget unit checks passed');
