#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildPr336GateBRegenerateRows,
  buildPr336VkSearchPlacesByRowId,
  materializePr336GateBSnapshotPlaces,
} from './fixtures/pr336-vk-search-trip-sources.mjs';

const snapshotPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const rows = buildPr336GateBRegenerateRows();
const built = materializePr336GateBSnapshotPlaces(buildPr336VkSearchPlacesByRowId(rows));

assert.equal(Object.keys(snapshot).length, Object.keys(built).length, 'checked-in snapshot must match regenerate row count');

const pricedCategories = new Set(['flight', 'hotel', 'car']);
const failures = [];
for (const row of rows) {
  if (!pricedCategories.has(row.cat)) continue;
  const place = snapshot[String(row.id)];
  if (!place) {
    failures.push(`missing snapshot row ${row.id} (${row.name})`);
    continue;
  }
  const price = place.price ?? place.sourceRecord?.price;
  if (price == null || price === '' || price === 0) {
    failures.push(`row ${row.id} ${row.cat} ${row.name} missing price`);
  }
}

assert.equal(failures.length, 0, failures.join('; '));

console.log(JSON.stringify({
  ok: true,
  snapshotRows: Object.keys(snapshot).length,
  pricedTravelRows: rows.filter((row) => pricedCategories.has(row.cat)).length,
}, null, 2));
