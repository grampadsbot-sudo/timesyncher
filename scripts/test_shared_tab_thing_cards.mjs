#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { renderThingCardHtml, thingCardBundleExpr } from '../src/vacation/itinerary-print.mjs';
import { SHARED_LIVE_TAB_KEYS } from '../src/vacation/shared-trip-live-tab-lists.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const TIP = '054574b9f5597b4cf7035f2a2fb1e54d8e44e9ec';
const tipBundle = execFileSync('git', ['show', `${TIP}:public/assets/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
assert.match(tipBundle, /n\.jsx\(Wr,\{listKey:"cars"\}\)/);
assert.match(tipBundle, /n\.jsx\(Wr,\{listKey:"hotels"\}\)/);
assert.match(tipBundle, /n\.jsx\(Wr,\{listKey:"flights"\}\)/);
assert.doesNotMatch(tipBundle, /tsRenderThingCard=/);

const fixture = JSON.parse(readFileSync(new URL('./fixtures/intake-435a4d049b1d.json', import.meta.url), 'utf8'));
const payload = finalizeServedSharedTripPayload(fixture);
assert.deepEqual(Object.keys(payload.liveTabLists).sort(), [...SHARED_LIVE_TAB_KEYS].sort());

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.doesNotMatch(bundle, /n\.jsx\(Wr,\{listKey:"(?:flights|hotels|cars)"\}\)/);
assert.ok(bundle.includes(thingCardBundleExpr()));
assert.match(bundle, /return tsRenderThingCard\(/);
for (const tab of ['flights', 'hotels', 'cars', 'restaurants', 'stores', 'events']) {
  assert.match(bundle, new RegExp(`tsSharedLiveTabListMount\\("${tab}"\\)`));
}

const listSource = readFileSync(new URL('../src/vacation/shared-trip-live-tab-lists.mjs', import.meta.url), 'utf8');
const patchSource = readFileSync(new URL('../src/vacation/trek-live-product-patches.mjs', import.meta.url), 'utf8');
assert.match(listSource, /from '\.\/itinerary-print\.mjs'/);
assert.match(patchSource, /from '\.\/itinerary-print\.mjs'/);
assert.match(listSource, /renderThingCardHtml\(/);
const cardSource = renderThingCardHtml.toString();
assert.ok(bundle.includes(cardSource));
assert.match(cardSource, /data-thing-card="1"/);

let rows = 0;
for (const tab of SHARED_LIVE_TAB_KEYS) {
  const items = payload.liveTabLists[tab];
  assert.ok(Array.isArray(items), tab);
  for (const row of items) {
    rows += 1;
    assert.match(row, /data-thing-card="1"/, tab);
    assert.match(row, /data-ts-logo-chip="1"/, tab);
    const summary = row.match(/<p>([^<]+)<\/p>/);
    assert.ok(summary && summary[1].trim(), `${tab} summary`);
    if (row.includes('data-has-logo="0"')) {
      assert.doesNotMatch(row, /<img class="tiny-logo"/);
      assert.match(row, /data-ts-fallback-emoji="/);
      assert.match(row, /class="thing-emoji"/);
    } else {
      assert.match(row, /<img class="tiny-logo"/);
      assert.match(row, /width:18px;height:18px/);
    }
  }
}
assert.ok(rows > 0);
assert.equal(payload.liveTabLists.flights.length, 0);
assert.equal(payload.liveTabLists.cars.length, 1);
assert.match(payload.liveTabLists.cars[0], /Hertz Car Rental - Kahului Airport/);
assert.match(payload.liveTabLists.cars[0], /101 Airport Rd/);
assert.equal(payload.liveTabLists.hotels.length, 2);
assert.match(payload.liveTabLists.hotels.join('\n'), /data-has-logo="1"/);
const noLogo = Object.values(payload.liveTabLists).flat().filter((row) => row.includes('data-has-logo="0"'));
assert.ok(noLogo.length >= 1);

console.log('shared tab thing card tests passed');
