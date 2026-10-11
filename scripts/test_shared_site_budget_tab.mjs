#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { budgetPriceFromThing, sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';
import { applyLiveProductPatches } from '../src/vacation/trek-live-product-patches.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tripId = '324312aa-2cb6-4d8a-9f0a-123456789abc';

const shared = sharedTripFromIntake({
  trip: {
    id: tripId,
    title: 'Maui March 10-17 2027',
    destination: 'Maui',
    start_date: '2027-03-10',
    end_date: '2027-03-17',
  },
  things: [
    { id: 'place-1', category: 'restaurant', title: 'Harbor Cafe' },
    { id: 'place-2', category: 'activity', title: 'Snorkel', cost_estimate_cents: 4500 },
  ],
});

assert.equal(shared.permissions.share_budget, true, 'intake trips with Things must expose the Budget tab');
assert.equal(shared.budget.length, 1);
assert.equal(shared.budget[0].total_price, 45);
assert.equal(budgetPriceFromThing({ cost_estimate_cents: 1200 }), 12);

const rawBundle = await readFile(`${root}/public/assets/index-BKun7ofk.js`, 'utf8');
const bundle = applyLiveProductPatches(rawBundle);
assert.match(bundle, /share_budget\?\[\{id:"budget"/, 'TREK bundle must render Budget tab when share_budget is on');

console.log('shared site budget tab passed');
