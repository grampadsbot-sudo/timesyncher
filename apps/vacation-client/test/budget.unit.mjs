import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

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
import { findLegacyMiscBucketLabelInVacationSource } from '../../../src/vacation/budget-legacy-label-source-scan.mjs';
import { extractUpstreamMiscBucketLabel } from '../../../src/vacation/trek-budget-upstream-misc-patch.mjs';

const hotelTrip = {
  trip: { currency: 'USD' },
  places: [{ id: 1, name: 'Midtown sample hotel', category_name: 'Hotel' }],
  thingOverrides: {
    'place:1': { price: 389, stayDays: 4, category: 'hotel', dayIds: [50] },
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
assert.equal(carsBucket?.planned, 0);
assert.deepEqual(carsBucket?.rows, [], 'cars remain excluded from Budget');
assert.equal(carsBucket?.target, 200);
assert.equal(carsBucket?.variance, 'Under by $200');

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
assert.deepEqual(budgetPlaces.map((place) => place.id), [20]);
assert.equal(numericPrice(budgetPlaces[0], unionTrip), 100);
assert.equal(buildBudgetModel(unionTrip).rows.some((row) => row.place.id === 21), false,
  'a catalog Thing not on the itinerary is absent');

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

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const upstreamBundleJs = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const legacyCustomerBucketLabel = extractUpstreamMiscBucketLabel(upstreamBundleJs);
assert.ok(legacyCustomerBucketLabel, 'upstream trek bundle must expose misc bucket label');
assert.notEqual(OTHER_THINGS_BUCKET, legacyCustomerBucketLabel);
assert.deepEqual(
  findLegacyMiscBucketLabelInVacationSource(legacyCustomerBucketLabel, { assertScanProbes: true }),
  [],
  'budget legacy label sources must not rebuild the upstream misc bucket label',
);
assert.equal(bucketDisplayLabel(OTHER_THINGS_BUCKET), 'The Rest');
assert.equal(bucketDisplayLabel('Flights'), 'Flights');

const legacyMiscTargetKey = `overall:${legacyCustomerBucketLabel}`;
const legacyTargetsTrip = {
  trip: { currency: 'USD' },
  places: [{ id: 40, name: 'Broadway show', category_name: 'Event' }],
  thingOverrides: {
    __budgetTargets: { [legacyMiscTargetKey]: '500' },
    'place:40': { price: 120, category: 'event', dayIds: [50] },
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
assert.equal(rendered.includes(legacyCustomerBucketLabel), false);
assert.equal(
  bucketTargetAmount(legacyTargetsTrip, legacyCustomerBucketLabel),
  500,
  'lookup by legacy bucket name in key must resolve',
);
const legacyScore = budgetCompletenessScore(legacyTargetsTrip);
assert.equal(
  legacyScore.checks.some((c) => c.name === `saved_target_${legacyCustomerBucketLabel}` && c.pass),
  true,
);

function unmatchedBudgetLineAddsNoRow() {
  const trip = {
    days: [{ id: 41, day_number: 1 }],
    places: [{ id: 91, name: 'Itinerary museum', category_name: 'Event' }],
    assignments: { 41: [{ place_id: 91 }] },
    budget: [
      { name: 'Itinerary museum', total_price: 75 },
      { name: 'Unmatched imported reservation', total_price: 900 },
      { name: 'Unmatched flight', category: 'Flights', total_price: 350 },
    ],
  };
  const model = buildBudgetModel(trip);
  assert.deepEqual(model.rows.map((row) => row.place.id), [91]);
  assert.equal(model.rows[0].amount, 75, 'matching total is already a total, without a per-person multiplier');
  assert.equal(model.rows[0].hasPrice, true);
  assert.equal(model.tripPlanned, 75);
  assert.equal(model.buckets.some((bucket) => bucket.label === 'Flights'), false);
  assert.equal(model.rows.some((row) => /Unmatched/.test(row.name)), false);
  assert.equal(buildBudgetModel({ ...trip, places: [], assignments: {} }).isEmpty, true);
}
unmatchedBudgetLineAddsNoRow();

const noItinerary = {
  places: [{ id: 92, name: 'Saved restaurant', category_name: 'Restaurant', price: 25 }],
  thingOverrides: { 'place:92': { timeline: true } },
  budget: [{ name: 'Saved restaurant', total_price: 50 }],
};
assert.deepEqual(placesForBudget(noItinerary), [], 'no catalog fallback without an itinerary');
assert.equal(buildBudgetModel(noItinerary).isEmpty, true);
assert.equal(buildBudgetModel({ ...noItinerary, days: [{ id: 41, day_number: 1 }] }).isEmpty, true,
  'a timeline flag without a day assignment does not schedule a catalog Thing');

const sourcePriceTrip = {
  ...noItinerary,
  assignments: { 41: [{ place_id: 92 }] },
  budget: [{ name: 'Saved restaurant', total_price: 800 }],
};
assert.equal(buildBudgetModel(sourcePriceTrip).rows[0].amount, 50, 'parsed Thing price takes precedence');
const missingPricePlace = { id: 93, name: 'Missing price', category_name: 'Store' };
for (const value of [null, '', ' ', false, 'unknown']) {
  const missingTrip = {
    places: [missingPricePlace],
    assignments: { 41: [{ place_id: 93 }] },
    budget: [{ name: 'Missing price', total_price: value }],
  };
  assert.equal(buildBudgetModel(missingTrip).rows[0].hasPrice, false);
}
const identifiedTrip = {
  places: [missingPricePlace],
  assignments: { 41: [{ place_id: 93, place: { id: 93 } }, { place_id: 93 }] },
  budget: [{ place_id: 93, title: 'Imported title', total_price: 0 }],
};
assert.equal(buildBudgetModel(identifiedTrip).rows.length, 1, 'itinerary membership dedupes by Thing id');
assert.equal(buildBudgetModel(identifiedTrip).rows[0].hasPrice, true, 'a sourced zero total is a price');
assert.equal(buildBudgetModel(identifiedTrip).rows[0].amount, 0);
const carItinerary = {
  ...targetsTrip,
  days: [{ id: 41, day_number: 1 }],
  assignments: { 41: targetsTrip.places.map((place) => ({ place_id: place.id })) },
  thingOverrides: {
    ...targetsTrip.thingOverrides,
    'place:10': { category: 'car', timeline: true, dayIds: [41], price: 45 },
  },
};
assert.deepEqual(placesForBudget(carItinerary), [], 'cars remain excluded even when assigned and on Timeline');

console.log('vacation-client budget unit checks passed');
