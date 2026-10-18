import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareItinerarySharedTrip } from '../src/lib/prepareServedTrip.mjs';
import { buildBudgetModel } from '../src/lib/budgetModel.mjs';
import { finalizeServedSharedTripPayload } from '../../../src/vacation/shared-trip-served-page.mjs';
import { prepareSharedTripForLiveApp } from '../../../src/vacation/shared-trip-live-tab-lists.mjs';
import { buildNycPr225SharedTrip } from '../../../scripts/fixtures/nyc-pr225-shared-trip.mjs';
import { budgetHardcodedHits } from '../../../scripts/shepherd-staging-smoke-map-lib.mjs';

const amounts = trip => new Set(trip.budget.map(line => Number(line.total_price)));
const base = () => ({
  trip: { id: 'membership-regression', currency: 'USD' },
  days: [{ id: 50, day_number: 1 }], assignments: {},
  permissions: { share_budget: true }, places: [], thingOverrides: {}, budget: [],
});

test('NYC client entry replaces legacy 2224 with itinerary 2052', () => {
  const legacy = finalizeServedSharedTripPayload(buildNycPr225SharedTrip());
  assert.equal(amounts(legacy).has(2224), true);
  const trip = prepareItinerarySharedTrip(legacy);
  assert.equal(buildBudgetModel(trip).tripPlanned, 2052);
  assert.equal(amounts(trip).has(2052), true);
  assert.equal(amounts(trip).has(2224), false);
  assert.equal(amounts(trip).has(172), false, 'assigned cars remain excluded');
  assert.deepEqual(budgetHardcodedHits('$2052 / $0', trip.budget, trip), []);
  assert.deepEqual(prepareItinerarySharedTrip(trip), trip, 'client preparation is idempotent');
  assert.deepEqual(prepareSharedTripForLiveApp(trip), trip, 'repeat presentation retains explicit membership');
});

test('catalog-only priced Thing and unmatched imported lines never create API rows', () => {
  const input = base();
  input.places = [
    { id: 1, name: 'Included', category_name: 'Restaurant', price: 20 },
    { id: 2, name: 'Unassigned', category_name: 'Store', price: 613 },
  ];
  input.assignments = { 50: [{ place_id: 1, place: { id: 1 } }] };
  input.budget = [{ name: 'Unassigned', total_price: 999 }, { place_id: 99, name: 'Included', total_price: 888 }];
  const trip = prepareItinerarySharedTrip(finalizeServedSharedTripPayload(input));
  assert.equal(buildBudgetModel(trip).tripPlanned, 40);
  assert.equal(trip.budget.some(line => line.name === 'Unassigned'), false);
  for (const amount of [1226, 1266, 999, 888]) assert.equal(amounts(trip).has(amount), false);
  assert.equal(amounts(trip).has(40), true);
});

test('timeline flag without itinerary produces empty client and no catalog API rows', () => {
  const input = base();
  input.days = [];
  input.places = [{ id: 1, name: 'Unassigned', category_name: 'Store', price: 613 }];
  input.thingOverrides = { 'place:1': { timeline: true } };
  const trip = prepareItinerarySharedTrip(finalizeServedSharedTripPayload(input));
  assert.equal(buildBudgetModel(trip).isEmpty, true);
  assert.equal(trip.budget.some(line => line.name === 'Unassigned'), false);
  assert.deepEqual([...amounts(trip)], [0]);
});

test('identity-bound imported total supplies missing price without multiplication', () => {
  const input = base();
  input.places = [{ id: 1, name: 'Included', category_name: 'Restaurant' }];
  input.assignments = { 50: [{ place_id: 1 }] };
  input.budget = [{ place_id: 1, name: 'Old name', total_price: 37 }];
  const trip = prepareItinerarySharedTrip(finalizeServedSharedTripPayload(input));
  assert.equal(buildBudgetModel(trip).tripPlanned, 37);
  assert.equal(amounts(trip).has(37), true);
  assert.equal(trip.budget.some(line => String(line.place_id) === '1' && line.total_price === 37), true);
});

test('imported name matching and parsed price precedence follow client model', () => {
  for (const price of [undefined, 21]) {
    const input = base();
    input.places = [{ id: 1, name: 'Included', category_name: 'Restaurant', price }];
    input.thingOverrides = { 'place:1': { dayIds: [50] } };
    input.budget = [{ name: 'Included', total_price: 37 }];
    const trip = prepareItinerarySharedTrip(input);
    assert.equal(buildBudgetModel(trip).tripPlanned, price === undefined ? 37 : 42);
    assert.equal(amounts(trip).has(price === undefined ? 37 : 42), true);
  }
});

test('generated legacy row cannot become a missing-price imported fallback', () => {
  const input = base();
  input.places = [{ id: 1, name: 'Included', category_name: 'Restaurant', price: 20 }];
  input.assignments = { 50: [{ place_id: 1 }] };
  const legacy = finalizeServedSharedTripPayload(input);
  delete legacy.places[0].price;
  delete legacy.thingOverrides['place:1']?.price;
  const trip = prepareItinerarySharedTrip(legacy);
  assert.equal(buildBudgetModel(trip).tripPlanned, 0);
  assert.equal(buildBudgetModel(trip).rows[0].hasPrice, false);
  assert.equal(amounts(trip).has(40), false);
});

test('new client retains dayIds, nested identity, deduplication and targets', () => {
  const input = base();
  input.places = [{ id: 1, name: 'Included', category_name: 'Hotel', price: 100 }];
  input.assignments = { 50: [{ place: { id: 1 } }, { place_id: 1 }] };
  input.thingOverrides = { 'place:1': { dayIds: [50], stayDays: 2 }, __budgetTargets: { 'overall:Hotel': 300 } };
  const trip = prepareItinerarySharedTrip(input);
  const model = buildBudgetModel(trip);
  assert.equal(model.rows.length, 1);
  assert.equal(model.tripPlanned, 200);
  for (const amount of [100, 200, 300]) assert.equal(amounts(trip).has(amount), true);
});

test('legacy default remains catalog-based and includes cars without itinerary', () => {
  const input = base();
  input.days = [];
  input.places = [{ id: 1, name: 'Car', category_name: 'Car', price: 172 }];
  assert.equal(amounts(finalizeServedSharedTripPayload(input)).has(172), true);
});
