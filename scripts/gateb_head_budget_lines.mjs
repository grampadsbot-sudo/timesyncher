#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

import { applyLiveAppListRowFields } from '../src/vacation/shared-trip-live-app-fields.mjs';
import { syncSharedTripApiBudget } from '../src/vacation/shared-trip-api-budget.mjs';

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('Usage: node scripts/gateb_head_budget_lines.mjs <shared-trip-fixture.json>');
  process.exit(1);
}

const shared = JSON.parse(readFileSync(fixturePath, 'utf8'));
const materialized = applyLiveAppListRowFields(shared);
const synced = syncSharedTripApiBudget(materialized);
writeFileSync(fixturePath, `${JSON.stringify(synced, null, 1)}\n`, 'utf8');
const budget = Array.isArray(synced?.budget) ? synced.budget : [];
console.log(JSON.stringify(budget, null, 2));
