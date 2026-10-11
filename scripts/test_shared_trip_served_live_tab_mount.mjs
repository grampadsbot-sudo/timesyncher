#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applySharedLiveTabBundlePatches } from '../src/vacation/trek-live-product-patches.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { execFileSync } from 'node:child_process';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:public/assets/upstream/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');

const rendered = renderServedTrekBundle(raw);
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must match renderServedTrekBundle');

assert.match(committed, /vi\(kn,"hotels"\)\.map\(\(G,Re\)=>Oe\(G,"hotel",Re===0\)\)/);
assert.match(committed, /vi\(bc,"cars"\)\.map\(G=>Oe\(G\)\)/);
assert.doesNotMatch(committed, /tsSharedLiveTabListMount|data-shared-live-tab-mount/);
assert.match(committed, /n\.jsx\(Wr,\{listKey:"flights"\}\)/);
assert.match(committed, /checked:Ds\(G\),onChange:zr=>lc\(G,zr\.target\.checked\)\}/);
assert.match(committed, /title:`Pickup: \$\{\(ha\(wn\)\.rentalCompany\|\|mr\(wn\)\)\}`/);
assert.match(committed, /tsCarDays=Yi\(wn\)\.map\(ua=>ve\(ua\)\)/);

const repatched = applySharedLiveTabBundlePatches(raw, { served: true });
assert.ok(
  !repatched.includes('GBrain') && !repatched.includes('Coming soon'),
  'served live-tab patch must strip internal Cars tab placeholder copy',
);
assert.match(
  repatched,
  /Rental car options you add will appear here for side-by-side comparison\./,
);

console.log('shared trip served live tab mount tests passed');
