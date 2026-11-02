#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { patchUi734Round1 } from '../src/vacation/trek-ui-734-round1-patch.mjs';
import { patchUi734Round2 } from '../src/vacation/trek-ui-734-round2-patch.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rebaked, committed);

assert.match(committed, /En=G=>Sn\("",G\),Mn=G=>/);

assert.match(committed, /const hotel=It\(G\)==="hotel"\|\|Zi\(G\)/);
assert.match(committed, /if\(hotel\)\{const summary=String\(ha\(G\)\.summary/);
assert.match(committed, /"data-ts-list-desc":"1"/);

assert.match(committed, /data-ts-detail-info-box":"website"/);
assert.match(committed, /data-ts-detail-summary-readonly":"1"/);
assert.match(committed, /data-ts-detail-reviews-readonly":"1"/);
assert.match(committed, /data-ts-detail-reviews":"1"/);

assert.match(committed, /Ce\?n\.jsxs\("label",\{style:Hn,children:\["Summary",n\.jsx\("textarea"/);
assert.match(committed, /Ce\?n\.jsxs\("label",\{style:Hn,children:\["Details",n\.jsx\("textarea"/);

assert.match(committed, /"data-ts-tag-picker":"1"/);

assert.match(committed, /\["flights","hotels","cars"\]\.map/);
assert.match(committed, /"data-trip-view-root":!0/);

const round1Only = patchUi734Round1(committed);
const round2Only = patchUi734Round2(round1Only);
assert.equal(round2Only, committed);

console.log('ui #734 round2 punchlist checks passed');
