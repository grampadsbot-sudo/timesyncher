#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildNycCraigKimDaybydayFixtureRows } from './fixtures/nyc-craig-kim-daybyday-rows.mjs';
import {
  buildPr336VkSearchPlacesByRowId,
  materializePr336GateBSnapshotPlaces,
} from './fixtures/pr336-vk-search-trip-sources.mjs';

const snapshotPath = fileURLToPath(new URL('./fixtures/pr336-vk-search-places.snapshot.json', import.meta.url));
const rows = buildNycCraigKimDaybydayFixtureRows();
const built = materializePr336GateBSnapshotPlaces(buildPr336VkSearchPlacesByRowId(rows));
writeFileSync(snapshotPath, `${JSON.stringify(built, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  snapshotPath,
  rowCount: rows.length,
  snapshotKeys: Object.keys(built).length,
}, null, 2));
