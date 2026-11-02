#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveThingLogoDisplayUrl, resolveThingLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import { logoUrlFromSearchPlace } from '../src/vacation/trip-thing-enrichment.mjs';
import {
  buildDeclaredLogoRepairFn,
  declaredIconFetchLooksBroken,
  repairExplicitLogoUrl,
} from '../src/vacation/thing-logo-fallback-url.mjs';

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

assert.match(
  logoUrlFromSearchPlace(
    { title: 'Jazz at Lincoln Center', url: 'https://jazz.org/' },
    { logoUrl: 'https://jazz.org/favicon.ico' },
  ),
  /duckduckgo\.com\/ip3\/jazz\.org\.ico/,
);
assert.match(
  logoUrlFromSearchPlace(
    { title: 'Hotel Belleclaire', url: 'https://www.hotelbelleclaire.com/' },
    { logoUrl: 'https://www.hotelbelleclaire.com/favicon.ico' },
  ),
  /duckduckgo\.com\/ip3\/hotelbelleclaire\.com\.ico/,
);

console.log('tsv470 declared-icon logo repair tests passed');
