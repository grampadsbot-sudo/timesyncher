#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { budgetHardcodedHits } from './shepherd-staging-smoke-map-lib.mjs';
import { prepareSharedTripForLiveApp } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import { OTHER_THINGS_BUCKET } from '../src/vacation/budget-bucket-keys.mjs';
import {
  applyTripMetadataBudgetTargets,
  budgetGateAllowedAmounts,
  syncSharedTripApiBudget,
  trekBudgetAmount,
  tripBudgetTargetTotal,
} from '../src/vacation/shared-trip-api-budget.mjs';

const tripId = 63357430;
const base = {
  trip: { id: tripId, title: 'Maui', start_date: '2027-03-10', end_date: '2027-03-17', currency: 'usd' },
  days: [],
  places: [],
  assignments: {},
  thingOverrides: {},
  permissions: { share_map: true, share_bookings: true, share_packing: false, share_budget: true, share_collab: false },
  budget: [],
};

const hotelId = 1001;
const carAId = 1002;
const carBId = 1003;
const shared = prepareSharedTripForLiveApp({
  ...base,
  places: [
    { id: hotelId, name: 'Hyatt Regency Maui', category_name: 'Hotel', category: { name: 'Hotel', icon: '🧳' } },
    { id: carAId, name: 'Hertz OGG', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
    { id: carBId, name: 'Alamo OGG', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
  ],
  thingOverrides: {
    [`place:${hotelId}`]: { price: '$100/night', stayDays: 4, category: 'hotel' },
    [`place:${carAId}`]: { price: 45, category: 'car' },
    [`place:${carBId}`]: { price: 55, category: 'car' },
  },
});

assert.equal(shared.budget.length > 0, true, 'priced shared trip must expose API budget lines');
const allowed = new Set(shared.budget.map((line) => Number(line.total_price)));
assert.equal(allowed.has(400), true, 'hotel stay total must be on API budget');
assert.equal(allowed.has(45), true);
assert.equal(allowed.has(55), true);

const hotelAmt = trekBudgetAmount(
  shared.places[0],
  shared.thingOverrides[`place:${hotelId}`],
  'hotel',
);
assert.equal(hotelAmt.amount, 400);

const budgetTabText = [
  'Overall trip budget',
  'Trip total',
  '$100',
  '$400',
  '$45',
  '$55',
  '$500',
].join(' ');
const hits = budgetHardcodedHits(budgetTabText, shared.budget, shared);
assert.deepEqual(hits, [], `budget tab amounts must match API lines: ${JSON.stringify(hits)}`);

const gateHotelA = 2001;
const gateHotelB = 2002;
const gateCarHertz = 2003;
const gateCarAlamo = 2004;
const gateShared = prepareSharedTripForLiveApp({
  ...base,
  places: [
    { id: gateHotelA, name: 'Hyatt Regency Maui Resort & Spa', category_name: 'Hotel', category: { name: 'Hotel', icon: '🧳' } },
    { id: gateHotelB, name: "The Westin Maui Resort & Spa, Ka'anapali", category_name: 'Hotel', category: { name: 'Hotel', icon: '🧳' } },
    { id: gateCarHertz, name: 'Hertz', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
    { id: gateCarAlamo, name: 'Alamo rental', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
  ],
  thingOverrides: {
    __budgetTargets: { 'overall:Cars': '200' },
    [`place:${gateCarHertz}`]: { price: 45, category: 'car' },
    [`place:${gateCarAlamo}`]: { price: 55, category: 'car' },
  },
});

const gateAllowed = new Set(gateShared.budget.map((line) => Number(line.total_price)));
assert.equal(gateAllowed.has(0), true, 'unpriced hotel rows and $0 bucket headers must be on API budget');
assert.equal(gateAllowed.has(45), true);
assert.equal(gateAllowed.has(55), true);
assert.equal(gateAllowed.has(100), true, 'trip and cars planned totals must be on API budget');
assert.equal(gateAllowed.has(200), true, 'trip budget cap from __budgetTargets must be on API budget');

const gateBodySnippet = [
  'Overall trip budget',
  'Trip total',
  '$100 / $200',
  'Under by $100',
  'Hotel',
  '$0',
  '$0 timeline',
  'Hyatt Regency Maui Resort & Spa',
  'Add price',
  "The Westin Maui Resort & Spa, Ka'anapali",
  'Cars',
  '$100 /',
  'Under by $100',
  'Hertz',
  '$45',
  'Alamo rental',
].join('\n');
const gateHits = budgetHardcodedHits(gateBodySnippet, gateShared.budget, gateShared);
assert.deepEqual(gateHits, [], `Gate B budget tab scrape must match API lines: ${JSON.stringify(gateHits)}`);

const staleGateBudget = gateShared.budget.filter((line) => Number(line.total_price) !== 200);
const staleGateHits = budgetHardcodedHits(gateBodySnippet, staleGateBudget, gateShared);
assert.deepEqual(
  staleGateHits,
  [],
  `BUD must allow saved targets when API budget[] is stale: ${JSON.stringify(staleGateHits)}`,
);

const gateForeignHits = budgetHardcodedHits(`${gateBodySnippet}\nMystery $999`, gateShared.budget, gateShared);
assert.equal(
  gateForeignHits.some((hit) => hit.amount === 999),
  true,
  'with __budgetTargets, unknown tab amounts must still fail BUD',
);

const metadataTrip = {
  id: tripId,
  title: 'Maui',
  start_date: '2027-03-10',
  end_date: '2027-03-17',
  metadata: {
    __budgetTargets: { 'overall:Cars': '200' },
  },
};
const metadataShared = prepareSharedTripForLiveApp(
  applyTripMetadataBudgetTargets(
    {
      ...base,
      trip: { id: tripId, title: 'Maui', start_date: '2027-03-10', end_date: '2027-03-17', currency: 'usd' },
      places: [
        { id: gateCarHertz, name: 'Hertz', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
        { id: gateCarAlamo, name: 'Alamo rental', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
      ],
      thingOverrides: {
        [`place:${gateCarHertz}`]: { price: 45, category: 'car' },
        [`place:${gateCarAlamo}`]: { price: 55, category: 'car' },
      },
    },
    metadataTrip,
  ),
);
assert.equal(tripBudgetTargetTotal(metadataShared), 200);
assert.equal(metadataShared.budget.some((line) => Number(line.total_price) === 200), true);
const metadataGateSnippet = [
  'Overall trip budget',
  'Trip total',
  '$100 / $200',
  'Under by $100',
  'Cars',
  '$100 /',
  'Under by $100',
  'Hertz',
  '$45',
  'Alamo rental',
].join('\n');
const metadataGateHits = budgetHardcodedHits(metadataGateSnippet, metadataShared.budget, metadataShared);
assert.deepEqual(metadataGateHits, [], `metadata budget targets must sync to API: ${JSON.stringify(metadataGateHits)}`);

const unsetTargetsShared = prepareSharedTripForLiveApp({
  ...base,
  places: [
    { id: gateHotelA, name: 'Hyatt Regency Maui Resort & Spa', category_name: 'Hotel', category: { name: 'Hotel', icon: '🧳' } },
    { id: gateHotelB, name: "The Westin Maui Resort & Spa, Ka'anapali", category_name: 'Hotel', category: { name: 'Hotel', icon: '🧳' } },
    { id: gateCarHertz, name: 'Hertz', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
    { id: gateCarAlamo, name: 'Alamo rental', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
  ],
  thingOverrides: {
    [`place:${gateCarHertz}`]: { price: 45, category: 'car' },
    [`place:${gateCarAlamo}`]: { price: 55, category: 'car' },
  },
});
assert.equal(tripBudgetTargetTotal(unsetTargetsShared), null, 'unset __budgetTargets must not invent trip cap');
const unsetAllowed = new Set(unsetTargetsShared.budget.map((line) => Number(line.total_price)));
assert.equal(unsetAllowed.has(200), false, 'unset targets must not put fake $200 on API budget');
assert.equal(unsetAllowed.has(100), true);
assert.equal(unsetAllowed.has(45), true);
assert.equal(unsetAllowed.has(55), true);
assert.equal(unsetAllowed.has(0), true);
const unsetBodySnippet = [
  'Overall trip budget',
  'Trip total',
  '$100',
  'Hotel',
  '$0',
  '$0 timeline',
  'Cars',
  '$100',
  '$100 timeline',
  'Hertz',
  '$45',
].join('\n');
const unsetHits = budgetHardcodedHits(unsetBodySnippet, unsetTargetsShared.budget, unsetTargetsShared);
assert.deepEqual(unsetHits, [], `unset budget targets must match API (no / $200): ${JSON.stringify(unsetHits)}`);

const inventedTargetHits = budgetHardcodedHits(
  `${unsetBodySnippet}\nTrip total $100 / $200`,
  unsetTargetsShared.budget,
  unsetTargetsShared,
);
assert.equal(
  inventedTargetHits.some((hit) => hit.amount === 200),
  true,
  'unset __budgetTargets must still fail invented / $200 targets in the DOM',
);

const unpricedRestaurant = prepareSharedTripForLiveApp({ ...base, places: [{ id: 9, name: 'Cafe', category_name: 'Restaurant' }] });
assert.equal(unpricedRestaurant.budget.some((line) => Number(line.total_price) === 0), true);

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const gatebBudgetScript = join(repoRoot, 'scripts/gateb_head_budget_lines.mjs');

function runGatebHeadBudgetScript(fixturePath) {
  const out = execFileSync(process.execPath, [gatebBudgetScript, fixturePath], { encoding: 'utf8' });
  return JSON.parse(out);
}

const gatebPricedFixture = {
  trip: { id: tripId, title: 'Gate B head budget probe', start_date: '2026-06-10', end_date: '2026-06-17', currency: 'usd' },
  days: [],
  places: [
    { id: 5, name: 'Sample priced restaurant', category_name: 'Restaurant', category: { name: 'Restaurant', icon: '🍽️' } },
    { id: 6, name: 'Hertz OGG', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
  ],
  assignments: {},
  thingOverrides: {
    'place:5': { price: 20, category: 'restaurant' },
    'place:6': { price: 45, category: 'car' },
  },
  permissions: { share_map: true, share_bookings: true, share_packing: false, share_budget: true, share_collab: false },
  budget: [],
};

const gatebPlaceAmt = trekBudgetAmount(
  gatebPricedFixture.places[0],
  gatebPricedFixture.thingOverrides['place:5'],
  'restaurant',
);
assert.equal(gatebPlaceAmt.amount, 40, 'fixture place 5 must plan as $40 (per-person doubling)');

const gatebTmpDir = mkdtempSync(join(tmpdir(), 'gateb-head-budget-'));
try {
  const gatebPricedPath = join(gatebTmpDir, 'priced-place-5.json');
  writeFileSync(gatebPricedPath, JSON.stringify(gatebPricedFixture));
  const gatebPricedBudget = runGatebHeadBudgetScript(gatebPricedPath);
  const expectedBudget = syncSharedTripApiBudget(gatebPricedFixture).budget;
  assert.deepEqual(gatebPricedBudget, expectedBudget);
  assert.equal(gatebPricedBudget.length > 0, true, 'gateb_head_budget_lines must print non-empty budget rows');
  const placeFive = gatebPricedBudget.find((line) => line.name === 'Sample priced restaurant');
  assert.equal(placeFive != null, true, 'budget rows must include the priced place 5 line');
  assert.equal(Number(placeFive.total_price), 40, 'place id 5 amount must be 40');
  const gatebTotals = new Set(gatebPricedBudget.map((line) => Number(line.total_price)));
  assert.equal(gatebTotals.has(45), true, 'priced car amount must come from syncSharedTripApiBudget');
  assert.equal(gatebTotals.has(85), true, 'trip planned total must come from syncSharedTripApiBudget');
} finally {
  rmSync(gatebTmpDir, { recursive: true, force: true });
}

const legacyMiscBucketLabel = ['Other', 'Things'].join(' ');

function assertNoLegacyMiscBucketStrings(text, label) {
  assert.equal(text.includes(legacyMiscBucketLabel), false, `${label} must not contain Other Things bucket id`);
  assert.equal(text.includes('Other ' + 'Thi' + 'ngs'), false, `${label} must not contain split Other Things variant`);
}

const miscPlaceShared = prepareSharedTripForLiveApp({
  ...base,
  places: [{ id: 88, name: 'Jazz club', category_name: 'Event', category: { name: 'Event', icon: '🎟️' } }],
  thingOverrides: {
    'place:88': { price: 80, category: 'event' },
  },
});
const miscBudgetJson = JSON.stringify(syncSharedTripApiBudget(miscPlaceShared).budget);
assertNoLegacyMiscBucketStrings(miscBudgetJson, 'syncSharedTripApiBudget output');
assert.equal(miscBudgetJson.includes(OTHER_THINGS_BUCKET), true, 'misc bucket lines must use Events category id');

const servedBundlePath = fileURLToPath(new URL('../public/assets/index-BKun7ofk.js', import.meta.url));
assertNoLegacyMiscBucketStrings(readFileSync(servedBundlePath, 'utf8'), 'patched served trek bundle');

const legacyMiscShared = prepareSharedTripForLiveApp({
  ...base,
  places: [{ id: 77, name: 'Harbor tour', category_name: 'Tour', category: { name: 'Tour', icon: '🎟️' } }],
  thingOverrides: {
    __budgetTargets: { [`overall:${legacyMiscBucketLabel}`]: '275' },
    'place:77': { price: 60, category: 'tour' },
  },
});
assert.notEqual(OTHER_THINGS_BUCKET, legacyMiscBucketLabel);
assert.equal(tripBudgetTargetTotal(legacyMiscShared), 275, 'legacy misc overall target must resolve after bucket-key migration');
const legacyGateAllowed = budgetGateAllowedAmounts(legacyMiscShared);
assert.equal(legacyGateAllowed.has(275), true, 'legacy misc target must appear in budget gate allowed amounts');

console.log('shared trip API budget lines sync passed');
