#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  budgetCompletenessScore,
  buildBudgetModel,
  placesForBudget,
} from '../apps/vacation-client/src/lib/budgetModel.mjs';
import { LIST_TAB_IDS, placesForCategoryTab } from '../apps/vacation-client/src/lib/listTabModel.mjs';
import { assignedPlaceIds } from '../src/vacation/itinerary-minimums.mjs';
import { buildNycCraigKimDaybydayTripPositiveV1 } from './fixtures/nyc-craig-kim-daybyday-positive-v1.mjs';

const unscheduledSavedTrip = {
  trip: { currency: 'USD' },
  days: [{ id: 50, day_number: 1 }],
  places: [
    { id: 30, name: 'Scheduled cafe', category_name: 'Restaurant' },
    { id: 31, name: 'Saved unscheduled bistro', category_name: 'Restaurant' },
  ],
  assignments: { 50: [{ place_id: 30, place: { id: 30, name: 'Scheduled cafe' } }] },
  thingOverrides: {
    'place:30': { price: 40, category: 'restaurant' },
    'place:31': { price: 55, category: 'restaurant', timeline: false },
  },
};

const unscheduledModel = buildBudgetModel(unscheduledSavedTrip);
assert.equal(unscheduledModel.rows.length, 1);
assert.equal(String(unscheduledModel.rows[0].place.id), '30');
assert.equal(
  unscheduledModel.rows.some((row) => String(row.place.id) === '31'),
  false,
  'saved unscheduled place must not become a budget row',
);
const listTabHits = LIST_TAB_IDS.flatMap((tab) => placesForCategoryTab(unscheduledSavedTrip, tab));
assert.equal(
  listTabHits.some((place) => String(place.id) === '31'),
  true,
  'unscheduled saved place may remain on list tabs',
);

assert.equal(unscheduledModel.tripPlanned, 80);
assert.equal(unscheduledModel.tripTimelinePlanned, 80);
assert.equal(unscheduledModel.buckets[0].planned, 80);
assert.equal(unscheduledModel.buckets[0].timelinePlanned, 80);

const flagsOnlyTrip = {
  ...unscheduledSavedTrip,
  thingOverrides: {
    ...unscheduledSavedTrip.thingOverrides,
    'place:30': { ...unscheduledSavedTrip.thingOverrides['place:30'], timeline: false },
    'place:31': { ...unscheduledSavedTrip.thingOverrides['place:31'], timeline: true, dayIds: [] },
  },
};
const flagsOnlyModel = buildBudgetModel(flagsOnlyTrip);
assert.deepEqual(flagsOnlyModel.rows.map((row) => row.place.id), [30]);
assert.equal(flagsOnlyModel.tripPlanned, 80);
assert.equal(flagsOnlyModel.tripTimelinePlanned, 80);
const flagsOnlyScore = budgetCompletenessScore(flagsOnlyTrip);
assert.equal(flagsOnlyScore.pass, flagsOnlyScore.total);

const repeatedAssignmentTrip = {
  ...flagsOnlyTrip,
  days: [...flagsOnlyTrip.days, { id: 51, day_number: 2 }],
  assignments: {
    ...flagsOnlyTrip.assignments,
    51: [{ place_id: '30', place: { id: 30, name: 'Scheduled cafe' } }],
  },
};
const repeatedModel = buildBudgetModel(repeatedAssignmentTrip);
assert.equal(repeatedModel.rows.length, assignedPlaceIds(repeatedAssignmentTrip).size);
assert.equal(repeatedModel.tripPlanned, 80);
assert.equal(repeatedModel.tripTimelinePlanned, 80);

const dayPlacementOnlyTrip = {
  ...unscheduledSavedTrip,
  thingOverrides: {
    ...unscheduledSavedTrip.thingOverrides,
    'place:31': { ...unscheduledSavedTrip.thingOverrides['place:31'], dayIds: [50] },
  },
};
const dayPlacementModel = buildBudgetModel(dayPlacementOnlyTrip);
assert.deepEqual(dayPlacementModel.rows.map((row) => row.place.id), [30, 31]);
assert.equal(dayPlacementModel.tripPlanned, 190);
assert.equal(dayPlacementModel.tripTimelinePlanned, 190);
assert.deepEqual(
  budgetCompletenessScore(dayPlacementOnlyTrip).checks.filter((check) => !check.pass),
  [{ name: 'row_on_timeline_31', pass: false }],
  'dayIds placement must not hide a missing timeline assignment from completeness checks',
);

const positiveFixture = buildNycCraigKimDaybydayTripPositiveV1();
const timelineIds = assignedPlaceIds(positiveFixture);
const budgetPlaces = placesForBudget(positiveFixture);
assert.equal(
  budgetPlaces.length,
  timelineIds.size,
  'Gate B NYC fixture budget inventory must match distinct timeline assignments',
);
for (const place of positiveFixture.places || []) {
  const id = Number(place.id);
  if (timelineIds.has(id)) continue;
  assert.equal(
    budgetPlaces.some((row) => Number(row.id) === id),
    false,
    `list-only place ${id} must stay off the budget tab`,
  );
}

const completeness = budgetCompletenessScore(positiveFixture);
for (const row of buildBudgetModel(positiveFixture).rows) {
  const check = completeness.checks.find((c) => c.name === `row_on_timeline_${row.place.id}`);
  assert.ok(check?.pass, `row_on_timeline_${row.place.id} must pass`);
}

console.log('budget timeline-only rows passed');
