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

const positiveFixture = buildNycCraigKimDaybydayTripPositiveV1();
const budgetPlaces = placesForBudget(positiveFixture);
const timelineAssigned = assignedPlaceIds(positiveFixture);
const budgetIds = new Set(budgetPlaces.map((place) => Number(place.id)));
assert.equal(
  budgetPlaces.length,
  87,
  'Gate B NYC positive fixture budget inventory must include day-itinerary reservations',
);
assert.ok(
  budgetPlaces.length > timelineAssigned.size,
  'budget must list reservation itinerary rows beyond assignment-only timeline ids',
);
for (const name of [
  'Amelie Bistro',
  'Tiffany & Co.',
  "Macy's Herald Square",
  'Bodega 88',
]) {
  assert.ok(
    budgetPlaces.some((place) => String(place.name || '').includes(name)),
    `budget must include ${name}`,
  );
}
assert.equal(
  budgetIds.has(609),
  false,
  'list-only car 609 must stay off the budget tab',
);

const completeness = budgetCompletenessScore(positiveFixture);
for (const row of buildBudgetModel(positiveFixture).rows) {
  const check = completeness.checks.find((c) => c.name === `row_on_timeline_${row.place.id}`);
  assert.ok(check?.pass, `row_on_timeline_${row.place.id} must pass`);
}

console.log('budget timeline-only rows passed');
