#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { patchUi754 } from '../src/vacation/trek-ui-754-patch.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const bundlePath = new URL('../public/assets/index-BKun7ofk.js', import.meta.url);
const committed = await readFile(bundlePath, 'utf8');
assert.equal(rebaked, committed);

assert.match(committed, /return js\.filter\(wn=>\{const tp=String\(wn\.type\|\|""\);if\(!xn\("flights"\)&&\(tp==="flight"\|\|bn\(wn\.item\)/);
assert.match(committed, /!xn\("cars"\)&&\(Mi\(wn\.item\)\|\|\/\^\(Pickup\|Drop-off\):\/i\.test\(String\(wn\.title\|\|""\)\)\)/);
assert.match(committed, /\(!Zi\(ua\.item\)\|\|String\(ua\.type\|\|""\)==="hotel-event"\)&&tsItinLine\(ua\.item\)/);
assert.match(committed, /!ua\.endTime&&!ua\.isConflict\?n\.jsx\("div",\{"data-ts-timeline-time":"1"/);
assert.match(committed, /children:ua\.time\?Yo\(ua\.time\):"TBD"/);
assert.match(committed, /"data-ts-tag-picker":"1"/);
assert.match(committed, /\["flights","hotels","cars"\]\.map/);
assert.match(committed, /timesyncher-section-visibility:\$\{r\}/);
assert.match(committed, /Nt=\(G,Re\)=>\{Ce&&ge\(!0\);const tsVis=/);
assert.match(committed, /"data-trip-view-root":!0/);
assert.match(committed, /tsItinLine\(_i\.item\)&&\(!Zi\(_i\.item\)\|\|String\(_i\.type\|\|""\)==="hotel-event"\)/);

const round754Only = patchUi754(committed);
assert.equal(round754Only, committed);

console.log('ui #754 punchlist checks passed');
