#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import {
  buildGateBSearchPlaceForRow,
  buildPr336GateBRegenerateRows,
} from './fixtures/pr336-vk-search-trip-sources.mjs';
import { buildNycCraigKimDaybydayFixtureRows } from './fixtures/nyc-craig-kim-daybyday-rows.mjs';
import { resolveNycCcabKey } from './fixtures/nyc-vk-list-tab-rows.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const upstreamRaw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
const servedBundle = renderServedTrekBundle(upstreamRaw);

assert.match(
  servedBundle,
  /hasPrice:zt\(Xi\)>0\|\|/,
  'served budget rows must treat computed zt() amounts as priced',
);

assert.match(
  servedBundle,
  /typeof \(z=bi\(G\)\)==="number"&&Number\.isFinite\(z\)/,
  'flight eu() must format numeric bi() fares for list price column',
);

const romerRow = buildNycCraigKimDaybydayFixtureRows().find((row) => row.id === 629);
assert.ok(romerRow, "Romer Hell's Kitchen list row must stay on fixture id 629");
assert.equal(
  romerRow.ccabKey,
  resolveNycCcabKey("Romer Hell's Kitchen"),
  'list tab ccabKey must normalize apostrophes to ccab enrichment keys',
);
const romerPlace = buildGateBSearchPlaceForRow(romerRow);
assert.equal(romerPlace.externalId, romerRow.ccabKey);
assert.ok(Number(romerPlace.price) > 0, 'Romer ccab row must keep sourced nightly price');

for (const row of buildPr336GateBRegenerateRows().filter((entry) => entry.cat === 'flight').slice(0, 3)) {
  const place = buildGateBSearchPlaceForRow(row);
  assert.ok(Number(place.price) > 0, `flight row ${row.id} must carry price for list tab`);
}

const committed = readFileSync(
  fileURLToPath(new URL('../public/assets/index-BKun7ofk.js', import.meta.url)),
  'utf8',
);
assert.equal(committed, servedBundle, 'committed served bundle must match renderServedTrekBundle');

console.log('NYC VK budget/list price coverage tests passed');
