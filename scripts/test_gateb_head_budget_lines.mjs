#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { trekBudgetAmount } from '../src/vacation/shared-trip-api-budget.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = join(root, 'scripts/gateb_head_budget_lines.mjs');

function runScript(fixturePath) {
  const out = execFileSync(process.execPath, [scriptPath, fixturePath], { encoding: 'utf8' });
  return JSON.parse(out);
}

const tripId = 63357430;
const pricedFixture = {
  trip: { id: tripId, title: 'Gate B head budget probe', start_date: '2026-06-10', end_date: '2026-06-17', currency: 'usd' },
  days: [],
  places: [
    { id: 5, name: 'Sample priced restaurant', category_name: 'Restaurant', category: { name: 'Restaurant', icon: '🍽️' } },
  ],
  assignments: {},
  thingOverrides: {
    'place:5': { price: 20, category: 'restaurant' },
  },
  permissions: { share_map: true, share_bookings: true, share_packing: false, share_budget: true, share_collab: false },
  budget: [],
};

const placeAmt = trekBudgetAmount(
  pricedFixture.places[0],
  pricedFixture.thingOverrides['place:5'],
  'restaurant',
);
assert.equal(placeAmt.amount, 40, 'fixture place 5 must plan as $40 (per-person doubling)');

const tmpDir = mkdtempSync(join(tmpdir(), 'gateb-head-budget-'));
const pricedPath = join(tmpDir, 'priced-place-5.json');
writeFileSync(pricedPath, JSON.stringify(pricedFixture));
const pricedBudget = runScript(pricedPath);
assert.equal(Array.isArray(pricedBudget), true);
assert.equal(pricedBudget.length > 0, true, 'script must print non-empty budget rows');
const pricedTotals = new Set(pricedBudget.map((line) => Number(line.total_price)));
assert.equal(pricedTotals.has(40), true, 'budget rows must include place 5 total_price 40');

const multiFixture = {
  ...pricedFixture,
  places: [
    pricedFixture.places[0],
    { id: 6, name: 'Hertz OGG', category_name: 'Car', category: { name: 'Car', icon: '🚗' } },
  ],
  thingOverrides: {
    'place:5': { price: 20, category: 'restaurant' },
    'place:6': { price: 45, category: 'car' },
  },
};
const multiPath = join(tmpDir, 'multi-priced.json');
writeFileSync(multiPath, JSON.stringify(multiFixture));
const multiBudget = runScript(multiPath);
const multiTotals = new Set(multiBudget.map((line) => Number(line.total_price)));
assert.equal(multiTotals.has(40), true);
assert.equal(multiTotals.has(45), true);
assert.equal(multiTotals.has(85), true, 'trip planned total must be on API budget');

console.log('gateb head budget lines script passed');
