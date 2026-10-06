import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { patchThingLogoChipAlignment } from '../src/vacation/trek-live-product-patches.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});

const rendered = renderServedTrekBundle(raw.toString('utf8'));
assert.match(rendered, /className:"tiny-logo",src:zt/);
assert.match(rendered, /display:"inline-grid",placeItems:"center"/);
assert.match(rendered, /i==="car"\?"🚗"/);
assert.match(rendered, /data-ts-logo-chip="1" style="width:30px;height:30px;display:grid;place-items:center/);
assert.match(rendered, /data-ts-logo-chip":"1","aria-hidden":"true",style:\{width:16,height:16,minWidth:16,minHeight:16,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1/);
assert.match(rendered, /data-ts-category-tab-icon":"1"/);
assert.doesNotMatch(rendered, /translateY\(-0\.5px\)/);

assert.throws(
  () => patchThingLogoChipAlignment('dc=({item:G,size:Re=28})=>{noop}'),
  /missing dc\(\) anchor/,
);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must include logo chip centering patch');

console.log('shared logo chip center bundle tests passed');
