#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rebaked, committed);

const start = committed.indexOf('Restaurant tags / chips');
assert.ok(start >= 0, 'restaurant tag field');
const end = committed.indexOf('Store tags / chips', start);
assert.ok(end > start, 'store tag field follows restaurant block');
const restaurantBlock = committed.slice(start, end);

assert.match(restaurantBlock, /"data-ts-restaurant-tag-picker":"1"/);
assert.match(restaurantBlock, /"data-ts-tag-picker-options":"1"/);
assert.match(restaurantBlock, /children:ot\.map\(G=>\{const sel=or\(Dt\)\.includes\(G\)/);
assert.match(restaurantBlock, /"data-ts-cuisine-chips-selected":"1"/);
assert.match(restaurantBlock, /Ce\?n\.jsx\("input",\{value:_t\(Dt\),onChange:G=>Ua\(Dt,G\.target\.value\)/);
assert.match(restaurantBlock, /!Ce&&or\(Dt\)\.length\?n\.jsx\("div",\{"data-ts-cuisine-chips":"1","data-ts-cuisine-chips-viewer":"1"/);
assert.doesNotMatch(restaurantBlock, /children:ot\.map\(G=>\{const Re=or\(Dt\)\.includes\(G\)/);
assert.doesNotMatch(restaurantBlock, /!Ce&&or\(Dt\)\.length[\s\S]{0,400}onClick:\(\)=>jn\(Dt,G\)/);

console.log('ui #691 restaurant tag picker checks passed');
