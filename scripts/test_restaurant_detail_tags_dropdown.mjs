import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});
const js = renderServedTrekBundle(raw.toString('utf8'));

assert.match(js, /data-ts-restaurant-tag-select/);
assert.match(js, /multiple:!0,value:or\(Dt\)/);
assert.match(js, /Xa\(Dt,"restaurantTags",zt\)/);
assert.match(js, /data-ts-restaurant-tag-chips/);
assert.match(js, /or\(Dt\)\.map\(G=>n\.jsx\("span",\{"data-ts-restaurant-tag-chip"/);
assert.doesNotMatch(js, /Restaurant tags \/ chips",n\.jsx\("input",\{value:_t\(Dt\)/);
assert.doesNotMatch(js, /Restaurant tags \/ chips[\s\S]{0,400}ot\.map\(G=>\{const Re=or\(Dt\)\.includes\(G\)/);
assert.ok(js.includes('data-ts-restaurant-tags-field'));

console.log('restaurant detail tags dropdown ok');
