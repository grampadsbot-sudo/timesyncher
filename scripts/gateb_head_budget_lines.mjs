#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { syncSharedTripApiBudget } from '../src/vacation/shared-trip-api-budget.mjs';

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('Usage: node scripts/gateb_head_budget_lines.mjs <shared-trip-fixture.json>');
  process.exit(1);
}

const shared = JSON.parse(readFileSync(fixturePath, 'utf8'));
const synced = syncSharedTripApiBudget(shared);
console.log(JSON.stringify(synced.budget ?? [], null, 2));
