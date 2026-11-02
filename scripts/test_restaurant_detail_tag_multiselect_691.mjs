#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { patchUi691RestaurantTags } from '../src/vacation/trek-ui-691-restaurant-tags-patch.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rebaked, committed);

const tagIdx = committed.indexOf('Restaurant tags / chips');
assert.ok(tagIdx >= 0, 'restaurant tag section missing');
const restBlock = committed.slice(tagIdx, tagIdx + 2200);
const storeIdx = restBlock.indexOf('Store tags / chips');
const restaurantOnly = storeIdx >= 0 ? restBlock.slice(0, storeIdx) : restBlock;

assert.match(restaurantOnly, /"data-ts-restaurant-tag-multiselect":"1"/);
assert.match(restaurantOnly, /multiple:!0,value:or\(Dt\)/);
assert.match(restaurantOnly, /Xa\(Dt,"restaurantTags",\[\.\.\.G\.target\.selectedOptions\]/);
assert.doesNotMatch(restaurantOnly, /data-ts-tag-picker-options":"1"/);
assert.doesNotMatch(restaurantOnly, /onClick:\(\)=>jn\(Dt,G\)/);
assert.match(restaurantOnly, /data-ts-cuisine-chips":"1"/);
assert.match(restaurantOnly, /Ce\?n\.jsx\("select"/);
assert.match(restaurantOnly, /or\(Dt\)\.length\?n\.jsx\("div",\{"data-ts-cuisine-chips":"1"/);

const round691Only = patchUi691RestaurantTags(committed);
assert.equal(round691Only, committed);

console.log('restaurant detail tag multiselect #691 checks passed');
