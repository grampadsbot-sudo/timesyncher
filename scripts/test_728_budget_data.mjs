import assert from 'node:assert/strict';
import { syncSharedTripApiBudget, trekBudgetAmount } from '../src/vacation/shared-trip-api-budget.mjs';
import { budgetLineAmount, buildBudgetModel, formatBudgetTarget } from '../apps/vacation-client/src/lib/budgetModel.mjs';

const trip = {
  trip: { id: 7, metadata: { dialogParty: {
    primary: { name: 'Owner' }, collaborators: [{ name: 'Guest' }],
    preference_subjects: [{ name: 'Child' }, { name: 'Guest' }], viewers: [{ name: 'Viewer' }],
  } } },
  days: [{ id: 10 }],
  places: [
    { id: 1, name: 'Scheduled meal', category_name: 'Restaurant' },
    { id: 2, name: 'Unscheduled meal', category_name: 'Restaurant' },
    { id: 3, name: 'Day-selected ticket', category_name: 'Event' },
    { id: 4, name: 'Stale day selection', category_name: 'Store' },
    { id: 5, name: 'Selected unpriced visit', category_name: 'Event' },
  ],
  assignments: { 10: [{ place_id: 1 }, { place_id: 5 }] },
  thingOverrides: {
    'place:1': { category: 'restaurant', pricePerPerson: 12.25, price: 99 },
    'place:2': { category: 'restaurant', price: 60 },
    'place:3': { category: 'event', pricePerPerson: 25, people: 4, dayIds: [10] },
    'place:4': { category: 'store', price: 50, dayIds: [999] },
    'place:5': { category: 'event' },
  },
  permissions: { share_budget: true },
  budget: [
    { id: 21, place_id: 1, name: 'Scheduled meal', total_price: 999, note: 'Keep this note' },
    { id: 22, place_id: 2, name: 'Unscheduled meal', total_price: 120 },
    { id: 23, name: 'Trip budget total', total_price: 5000 },
  ],
};
const served = syncSharedTripApiBudget(trip);
const placeBudgetLines = served.budget.filter((line) => line.place_id != null);
assert.deepEqual(placeBudgetLines.map((line) => line.place_id), [1, 3, 5]);
assert.deepEqual(placeBudgetLines.map((line) => line.total_price), [37, 100, 0]);
assert.equal(placeBudgetLines[0].note, 'Keep this note');
assert.equal(served.thingOverrides['place:1'].pricePerPerson, 12.25);
assert.equal(served.thingOverrides['place:1'].people, 3);
assert.equal(served.thingOverrides['place:3'].people, 4);
assert.equal(served.thingOverrides['place:2'].people, undefined);
assert.equal(served.thingOverrides['place:5'].pricePerPerson, undefined);
assert.deepEqual(
  syncSharedTripApiBudget(served).budget.filter((line) => line.place_id != null),
  placeBudgetLines,
  'data shaping must be idempotent for place budget lines',
);
assert.deepEqual(trip.budget.map((line) => line.total_price), [999, 120, 5000], 'input stays intact');
const model = buildBudgetModel(served);
assert.deepEqual(model.rows.map((row) => Number(row.place.id)), [1, 5, 3]);
for (const row of model.rows) {
  const apiLine = served.budget.find((line) => line.place_id === row.place.id);
  assert.equal(row.amount, apiLine.total_price, 'API and client use identical quantity math');
}
assert.equal(budgetLineAmount(trip.places[0], trip).amount, 37);
assert.equal(trekBudgetAmount({}, { price: '$100/night', stayDays: 4 }, 'hotel', trip).amount, 400);
assert.equal(trekBudgetAmount({}, { price: 366 }, 'car', trip).amount, 366);
assert.equal(trekBudgetAmount({}, { pricePerPerson: 30, people: 1 }, 'restaurant', trip).amount, 30);
assert.equal(trekBudgetAmount({}, { price: 30 }, 'restaurant', trip).amount, 90);
assert.equal(trekBudgetAmount({}, {}, 'restaurant', trip).hasPrice, false);
assert.deepEqual(syncSharedTripApiBudget({ ...trip, assignments: {}, thingOverrides: {} }).budget, []);
const blocked = syncSharedTripApiBudget({
  ...trip,
  thingOverrides: { ...trip.thingOverrides, 'place:1': { category: 'restaurant', price: 99,
    provenanceBlocker: 'unverified source price', provenanceBlocked: ['price'] } },
});
assert.equal(blocked.thingOverrides['place:1'].pricePerPerson, undefined, 'quantity shaping must not promote a blocked price to a new field');
assert.equal(formatBudgetTarget(null), '', 'a missing budget target is not $0');
assert.equal(formatBudgetTarget(0), '$0');
assert.equal(formatBudgetTarget(12), '$12');
console.log('728 budget data tests passed');
