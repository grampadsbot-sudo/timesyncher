#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import { buildSharedLiveTabLists } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import { applyProductKeepsakeOverrides } from '../src/vacation/keepsake-product-overrides.mjs';
import { resolveThingLogoUrl, NAMED_THING_LOGOS } from '../src/vacation/thing-logo-capture.mjs';
import { patchSharedTripOeListRows } from '../src/vacation/shared-trip-oe-list-row-patch.mjs';
import { LIST_LOGO_PATCH } from '../src/vacation/trek-live-product-patches.mjs';

assert.match(LIST_LOGO_PATCH, /new URL\(pg\)/);
assert.match(LIST_LOGO_PATCH, /favicon\.ico/);
assert.equal(typeof patchSharedTripOeListRows, 'function');

const storeCarPlace = {
  id: 1,
  name: 'Hertz Car Rental - Kahului Airport',
  category_name: 'Store',
  providerCategories: ['Store', 'Car rental'],
  url: 'https://hertz.com/',
};
assert.equal(productThingCategory(storeCarPlace, { category: 'store' }), 'car');

const carLogo = resolveThingLogoUrl(
  { name: 'Hertz', category_name: 'Car', url: 'https://hertz.com/' },
  { category: 'car' },
);
assert.equal(carLogo, NAMED_THING_LOGOS.hertz);

const shared = applyProductKeepsakeOverrides({
  places: [{
    id: 9001,
    name: 'Hertz Car Rental - Kahului Airport',
    category_name: 'Store',
    providerCategories: ['Store', 'Car rental'],
    url: 'https://hertz.com/',
    sourceRecord: { url: 'https://hertz.com/', source: 'brave' },
  }],
  thingOverrides: {
    'place:9001': { category: 'store', source: 'brave' },
  },
});
const lists = buildSharedLiveTabLists(shared);
assert.equal(lists.cars.length, 1);
assert.match(lists.cars[0], /data-ts-logo-chip="1"/);
assert.match(lists.cars[0], /data-list-row="1"/);
assert.match(lists.cars[0], /tiny-logo/);

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.match(bundle, /"data-ts-tab":G\.id,"data-tab":G\.id/);
assert.match(
  bundle,
  /_l=G=>\{if\(qr\(G\)\)return pDe;const Re=ha\(G\);return Re\.logoUrl\|\|Re\.iconUrl\|\|G\.logoUrl\|\|oi\(cc\(G\)\)\}/,
  'served bundle keeps TREK _l logo chain; favicon backfill is via resolveThingLogoUrl',
);
assert.match(bundle, /"data-list-row":"1","data-has-logo":tsRowHasLogo/);
assert.match(bundle, /"data-list-summary":"1","data-summary-src":"thing"/);
assert.match(bundle, /data-shared-live-tab":"hotels"/);
assert.match(bundle, /data-shared-live-tab":"cars"/);
assert.match(bundle, /data-shared-live-tab":"flights"/);
assert.match(bundle, /return tsRowList\?n\.jsxs\("li",\{"data-list-row":"1"/);
assert.match(bundle, /"data-ts-logo-chip":"1","aria-hidden":"true",style:\{width:Re,height:Re/);

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/intake-435a4d049b1d.json', import.meta.url), 'utf8'),
);
const gateBPlaces = (fixture.places || []).length;
assert.ok(gateBPlaces > 0, 'Gate B fixture must include places');
const gateBHotels = buildSharedLiveTabLists(
  applyProductKeepsakeOverrides({ places: fixture.places, thingOverrides: fixture.thingOverrides || {} }),
).hotels;
const gateBCars = buildSharedLiveTabLists(
  applyProductKeepsakeOverrides({ places: fixture.places, thingOverrides: fixture.thingOverrides || {} }),
).cars;
assert.ok(gateBHotels.length > 0, 'Gate B fixture must produce hotel list rows offline');
assert.ok(gateBCars.length > 0, 'Gate B fixture must produce car list rows offline');
for (const row of [...gateBHotels, ...gateBCars]) {
  assert.match(row, /data-list-row="1"/);
  assert.match(row, /data-ts-logo-chip="1"/);
}

console.log('gate b live tab logo row tests passed');
