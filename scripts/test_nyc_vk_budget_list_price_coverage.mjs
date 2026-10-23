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
  /\(\(Nr\)=>typeof Nr==="number"&&Number\.isFinite\(Nr\)/,
  'flight eu() must format numeric bi() fares for list price column',
);

assert.match(
  servedBundle,
  /return\[ua,\(v=>\{const fareLbl/,
  'flight eu() must keep airline short name on list title row',
);
assert.doesNotMatch(
  servedBundle,
  /return\[Re\|\|ua,\(v=>\{const fareLbl=/,
  'flight eu() must not swap list title to full itinerary string',
);

assert.match(
  servedBundle,
  /tsScore\(G\)>tsScore\(prev\)\)m\.set\(k,G\)/,
  'hotels catalog must dedupe by normalized name before Oe() rows',
);

assert.match(
  servedBundle,
  /bi=G=>\{const h=ha\(G\),pick=\(\.\.\.xs\)=>/,
  'served bi() must read place prices and total prices for list and budget rows',
);

assert.match(
  servedBundle,
  /p\.price\?\?p\.total_price/,
  'shared trip hydrate must copy place prices into thingOverrides',
);

const hydrateStart = servedBundle.indexOf('lf.getSharedTrip(r).then(');
assert.ok(hydrateStart >= 0);
const hydrateEnd = servedBundle.indexOf(';me(!0);ge(!1)})', hydrateStart);
assert.ok(hydrateEnd > hydrateStart);
const hydrateExpression = servedBundle.slice(hydrateStart + 'lf.getSharedTrip(r).then('.length, hydrateEnd) + ';me(!0);ge(!1)}';

function hydrate(payload) {
  const state = {};
  const apply = new Function('A', 'pe', 'me', 'ge', `"use strict";return (${hydrateExpression})`)(
    (value) => { state.shared = value; },
    (value) => { state.overrides = value; },
    (value) => { state.loaded = value; },
    (value) => { state.loading = value; },
  );
  apply(payload);
  assert.equal(state.loaded, true);
  assert.equal(state.loading, false);
  return state;
}

const payload = {
  thingOverrides: {
    'place:1': { price: 450, story: 'Saved memory', timeline: true },
    'place:2': { price: '', category: 'hotel' },
    'place:3': { price: 0 },
    'place:4': { price: '$125 per night' },
    'reservation:9': { price: 275 },
    __budgetTargets: { overall: 1500 },
    __keepsakePrintSettings: { maps: false },
  },
  places: [
    { id: 1, price: 300 },
    { id: 2, price: 190 },
    { id: 3, price: 100 },
    { id: 4, price: 200 },
    { id: 5, total_price: 375 },
    { id: 6, price: 0 },
    null,
    { price: 900 },
  ],
};
const originalPayload = structuredClone(payload);
const hydrated = hydrate(payload);
assert.deepEqual(payload, originalPayload, 'hydration must not mutate the API payload or saved overrides');
assert.equal(hydrated.shared.thingOverrides, hydrated.overrides);
assert.deepEqual(hydrated.overrides['place:1'], originalPayload.thingOverrides['place:1']);
assert.deepEqual(hydrated.overrides['place:2'], { price: 190, category: 'hotel' });
assert.deepEqual(hydrated.overrides['place:3'], { price: 0 });
assert.deepEqual(hydrated.overrides['place:4'], { price: '$125 per night' });
assert.deepEqual(hydrated.overrides['place:5'], { price: 375 });
assert.deepEqual(hydrated.overrides['place:6'], { price: 0 });
for (const key of ['reservation:9', '__budgetTargets', '__keepsakePrintSettings']) {
  assert.deepEqual(hydrated.overrides[key], originalPayload.thingOverrides[key]);
}
assert.equal(Object.hasOwn(hydrated.overrides, 'place:undefined'), false);
for (const value of [undefined, null, {}, { thingOverrides: 'invalid' }]) {
  assert.deepEqual(hydrate(value).overrides, {});
}
assert.deepEqual(hydrate({ places: [{ id: 7, price: 225 }] }).overrides, { 'place:7': { price: 225 } });

const dupNamePayload = {
  places: [
    { id: 45, name: 'Romer Hell\u2019s Kitchen' },
    { id: 629, name: "Romer Hell's Kitchen", price: 425 },
  ],
  thingOverrides: {},
};
const dupHydrated = hydrate(dupNamePayload);
assert.equal(dupHydrated.overrides['place:45'].price, 425);
assert.equal(dupHydrated.overrides['place:629'].price, 425);

const priceStart = servedBundle.indexOf('bi=G=>{const h=ha(G),pick=');
assert.ok(priceStart >= 0, 'served price accessor must be executable');
const priceEnd = servedBundle.indexOf('},Vr=', priceStart);
assert.ok(priceEnd > priceStart);
const priceFn = servedBundle.slice(priceStart + 'bi='.length, priceEnd + 1);
const priceFor = (thing, override = {}) => new Function('ha', `"use strict";return (${priceFn})`)(() => override)(thing);
assert.equal(priceFor({ price: 300 }), 300);
assert.equal(priceFor({ price: 300 }, { price: 450 }), 450);
assert.equal(priceFor({ price: 300 }, { price: 0 }), 0);
assert.equal(priceFor({ price: 518 }, { price: '' }), 518);
assert.equal(priceFor({ price: 518 }, { price: '   ' }), 518);
assert.equal(priceFor({ total_price: 375 }), 375);
assert.equal(priceFor({}, { total_price: 275 }), 275);
assert.equal(priceFor({}), '');

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
