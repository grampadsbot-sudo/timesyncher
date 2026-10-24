#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  GATE_B_NYC_REQUIRED_PLACE_COUNT,
  GATE_B_NYC_SMITH_LINCOLN_SQUARE_ROW_ID,
} from './fixtures/gate-b-nyc-place-count.mjs';
import { buildNycCraigKimDaybydayFixtureRows } from './fixtures/nyc-craig-kim-daybyday-rows.mjs';

const rows = buildNycCraigKimDaybydayFixtureRows();
assert.equal(
  rows.length,
  GATE_B_NYC_REQUIRED_PLACE_COUNT,
  `Gate B NYC fixture row count must match GATE_B_NYC_REQUIRED_PLACE_COUNT (${GATE_B_NYC_REQUIRED_PLACE_COUNT}). ` +
    'Update scripts/fixtures/gate-b-nyc-place-count.mjs and regenerate pr336-vk-search-places.snapshot.json in the same commit.',
);

const smith = rows.find((row) => row.id === GATE_B_NYC_SMITH_LINCOLN_SQUARE_ROW_ID);
assert.ok(smith, `missing Smith row at id ${GATE_B_NYC_SMITH_LINCOLN_SQUARE_ROW_ID}`);
assert.match(smith.name, /The Smith - Lincoln Square/);

const snapshotPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
assert.equal(Object.keys(snapshot).length, GATE_B_NYC_REQUIRED_PLACE_COUNT);
assert.ok(snapshot[String(GATE_B_NYC_SMITH_LINCOLN_SQUARE_ROW_ID)], 'snapshot must include The Smith - Lincoln Square');

console.log(JSON.stringify({ ok: true, rows: rows.length, snapshotKeys: Object.keys(snapshot).length }, null, 2));
