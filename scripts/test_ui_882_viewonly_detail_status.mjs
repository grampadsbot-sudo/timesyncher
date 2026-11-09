#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { patchThingDetailViewonlyStatus } from '../src/vacation/trek-thing-detail-viewonly-status-patch.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rebaked, committed, 'committed served bundle must match renderServedTrekBundle');

assert.doesNotMatch(committed, /View-only — editing requires an approved email invite/);
assert.match(
  committed,
  /\(He\|\|Ce\?n\.jsx\("div",\{style:\{marginTop:6,fontSize:10,fontWeight:800,color:Ce\?ke==="error"\?"#dc2626":ke==="saving"\?"#d97706":"#0f766e":"#6b7280"\},children:He\?"Checking edit access…":ke==="saving"\?"Saving…":ke==="error"\?"Could not save — check your connection and try again":"Saved to itinerary"\}\):null\)/,
);

const viewonlyOnly = patchThingDetailViewonlyStatus(committed);
assert.equal(viewonlyOnly, committed);

console.log('ui #882 view-only detail status hide checks passed');
