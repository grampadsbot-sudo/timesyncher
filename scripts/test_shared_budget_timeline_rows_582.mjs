#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import {
  assignPlaceToTripDays,
} from '../src/vacation/shared-trip-live-app-fields.mjs';
import { prepareSharedTripForLiveApp } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import {
  liveBudgetPlacesFromShared,
  placeOnTripTimeline,
  timelineBudgetPlaceIds,
} from '../src/vacation/shared-budget-itinerary-membership.mjs';
import {
  budgetCompletenessChecks,
  expectedBudgetDomRowPlaceIds,
} from '../src/vacation/gate-b-budget-completeness.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

function buildFixtureWithUnscheduledSavedPlace() {
  const things = [
    {
      id: 'scheduled-flight',
      category: 'flight',
      title: 'Sample flight on timeline',
      metadata: { categoryName: 'flight', price: 200, sourceRecord: { price: 200, timeline: true } },
    },
    {
      id: 'saved-unscheduled-cafe',
      category: 'restaurant',
      title: 'Saved cafe not on a day',
      metadata: {
        categoryName: 'restaurant',
        price: 40,
        sourceRecord: { price: 40, timeline: false, summary: 'Saved but never scheduled.' },
      },
    },
  ].map((row) => thingRecordFromTripRow(row));

  let shared = sharedTripFromIntake({
    trip: {
      id: '582-budget-timeline-trip',
      title: 'Budget timeline scope',
      destination: 'Sample city',
      start_date: '2026-07-01',
      end_date: '2026-07-03',
    },
    things,
  });

  const flight = shared.places.find((p) => String(p.name).includes('Sample flight'));
  assert.ok(flight, 'fixture flight');
  shared = assignPlaceToTripDays(shared, flight.id, [1]);
  return prepareSharedTripForLiveApp(shared);
}

const shared = buildFixtureWithUnscheduledSavedPlace();
const unscheduled = shared.places.find((p) => String(p.name).includes('Saved cafe'));
const scheduled = shared.places.find((p) => String(p.name).includes('Sample flight'));
assert.ok(unscheduled);
assert.ok(scheduled);

assert.equal(placeOnTripTimeline(shared, scheduled), true);
assert.equal(placeOnTripTimeline(shared, unscheduled), false);

const budgetPlaces = liveBudgetPlacesFromShared(shared);
assert.equal(budgetPlaces.some((p) => p.id === unscheduled.id), false, 'unscheduled saved place must not be a budget row');
assert.equal(budgetPlaces.some((p) => p.id === scheduled.id), true);

const completeness = budgetCompletenessChecks(shared);
assert.equal(completeness.pass, true);
assert.equal(completeness.checks[`row_on_timeline_${scheduled.id}`]?.pass, true);
assert.equal(budgetPlaces.every((place) => completeness.checks[`row_on_timeline_${place.id}`]?.pass), true);

const domExpected = expectedBudgetDomRowPlaceIds(shared);
assert.equal(domExpected.size, timelineBudgetPlaceIds(shared).size);
assert.equal(domExpected.has(String(scheduled.id)), true);
assert.equal(domExpected.has(String(unscheduled.id)), false);

const rowCountCheck = budgetCompletenessChecks(shared, [String(scheduled.id)]);
assert.equal(rowCountCheck.checks.budget_row_count.pass, true);

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const upstream = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
});
const bundle = renderServedTrekBundle(upstream.toString('utf8'));
assert.match(bundle, /Mo=Array\.from\(new Map\(Qa\.flatMap\(di=>Ci\(di\)\)/);
assert.doesNotMatch(bundle, /\[\]\.concat\(rs,Po,bc,Oc,Fs,Cc\)/);
assert.match(bundle, /data-ts-budget-row":"1"/);

console.log('shared budget timeline rows #582 passed');
