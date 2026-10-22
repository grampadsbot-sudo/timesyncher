#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildPr336GateBRegenerateRows,
  buildPr336VkSearchPlacesByRowId,
  pr336SnapshotRowIdKey,
} from './fixtures/pr336-vk-search-trip-sources.mjs';

const snapshotPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

const badSnapshotKeys = Object.keys(snapshot).filter((key) => {
  try {
    pr336SnapshotRowIdKey(key);
    return false;
  } catch {
    return true;
  }
});
assert.equal(badSnapshotKeys.length, 0, `invalid pr336 snapshot keys: ${badSnapshotKeys.join(', ')}`);

const built = buildPr336VkSearchPlacesByRowId(buildPr336GateBRegenerateRows());
const badBuiltKeys = Object.keys(built).filter((key) => {
  try {
    pr336SnapshotRowIdKey(key);
    return false;
  } catch {
    return true;
  }
});
assert.equal(badBuiltKeys.length, 0, `invalid generated snapshot keys: ${badBuiltKeys.join(', ')}`);

console.log(JSON.stringify({
  ok: true,
  snapshotRows: Object.keys(snapshot).length,
  builtRows: Object.keys(built).length,
}, null, 2));
