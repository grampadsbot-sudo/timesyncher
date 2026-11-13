#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { patchVk980TotalPrice } from '../src/vacation/trek-vk-980-total-price-patch.mjs';
import { thingTravelTotalPrice, tripNightCount } from '../src/vacation/thing-travel-total-price.mjs';
import { syncSharedTripApiBudget, trekBudgetAmount } from '../src/vacation/shared-trip-api-budget.mjs';

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/demo-nyc-99-hotel-car-total-price-20261110.json', import.meta.url)), 'utf8'),
);

const served = syncSharedTripApiBudget(snapshot);

assert.equal(tripNightCount({ start_date: '2026-06-23', end_date: '2026-06-30' }), 7);

const park = served.places.find((p) => p.id === 627);
const belle = served.places.find((p) => p.id === 603);
assert.ok(park && belle);

const parkOv = served.thingOverrides['place:627'] || {};
const belleOv = served.thingOverrides['place:603'] || {};

assert.equal(thingTravelTotalPrice(park, parkOv, 'hotel', served).label, '$1,210 est. total');
assert.equal(thingTravelTotalPrice(belle, belleOv, 'hotel', served).label, '$3,626 total');

for (const [id, total] of [[609, 306], [710, 366], [711, 395], [712, 398], [713, 395], [714, 399], [715, 402]]) {
  const car = served.places.find((p) => p.id === id);
  const ov = served.thingOverrides[`place:${id}`] || {};
  const price = thingTravelTotalPrice(car, ov, 'car', served);
  assert.equal(price.label, `$${total} total`, `car ${id}`);
  assert.equal(price.estimated, false);
}

const edited = thingTravelTotalPrice(
  park,
  { ...parkOv, price: 1500, priceIsTotal: true },
  'hotel',
  served,
);
assert.equal(edited.label, '$1,500 total');
assert.equal(edited.estimated, false);

assert.equal(trekBudgetAmount(park, parkOv, 'hotel', served).amount, 1210);
assert.equal(trekBudgetAmount(belle, belleOv, 'hotel', served).amount, 3626);
assert.equal(trekBudgetAmount({}, { price: 366 }, 'car', served).amount, 366);

const bundle = patchVk980TotalPrice(readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8'));
assert.match(bundle, /tsThingTravelTotalLabel/);
assert.doesNotMatch(bundle, /Zi\(G\)\?" \/ night"/);

console.log('test_thing_travel_total_price: ok');
