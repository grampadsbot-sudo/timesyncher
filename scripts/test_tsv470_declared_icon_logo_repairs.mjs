#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { resolveThingLogoDisplayUrl, resolveThingLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import {
  buildDeclaredLogoRepairFn,
  declaredIconFetchLooksBroken,
  repairExplicitLogoUrl,
} from '../src/vacation/thing-logo-fallback-url.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

assert.equal(declaredIconFetchLooksBroken(403, 'image/x-icon', 100), true);
assert.equal(declaredIconFetchLooksBroken(429, 'image/png', 100), true);
assert.equal(declaredIconFetchLooksBroken(200, 'image/x-icon', 0), true);
assert.equal(declaredIconFetchLooksBroken(200, 'image/png', 512), false);

for (const favicon of [
  'https://www.aa.com/favicon.ico',
  'https://www.southwest.com/favicon.ico',
  'https://www.jetblue.com/favicon.ico',
  'https://jazz.org/favicon.ico',
]) {
  assert.match(repairExplicitLogoUrl(favicon), /duckduckgo\.com\/ip3\//, favicon);
}

const flightPlace = {
  id: 601,
  name: 'American Airlines LAS → JFK',
  category_name: 'Flight',
  sourceRecord: { logoUrl: 'https://www.aa.com/favicon.ico' },
};
const flightOverride = { logoUrl: 'https://www.aa.com/favicon.ico' };
assert.equal(resolveThingLogoUrl(flightPlace, flightOverride), 'https://www.aa.com/favicon.ico');
assert.match(
  resolveThingLogoDisplayUrl(flightPlace, flightOverride),
  /duckduckgo\.com\/ip3\/aa\.com\.ico/,
);

const repairFn = buildDeclaredLogoRepairFn();
assert.match(repairFn, /function tsRepairDeclaredLogo/);
assert.match(repairFn, /aa\.com\.ico/);

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const upstreamRaw = execFileSync('git', [`show`, `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 20 * 1024 * 1024,
}).toString('utf8');
const served = renderServedTrekBundle(upstreamRaw);
assert.match(served, /function tsRepairDeclaredLogo\(/);
assert.match(served, /src:tsRepairDeclaredLogo\(Xr\)\|\|Xr/);

console.log('tsv470 declared-icon logo repair tests passed');
