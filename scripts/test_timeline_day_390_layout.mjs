#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { applySharedLiveTabBundlePatches } from '../src/vacation/trek-live-product-patches.mjs';
import {
  collectTimelineDay390Layout,
  conflictLabelClipRisk,
  judgeConflictLabelElement,
  judgeTimeZoneSingleLine,
} from './lib/timeline-day-390-layout-checks.mjs';

const root = new URL('..', import.meta.url);
const served = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const vkLive = execFileSync('git', ['show', '5a0d72e5:public/assets/index-BKun7ofk.js'], { maxBuffer: 30 * 1024 * 1024 }).toString('utf8');

assert.equal(conflictLabelClipRisk({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }), true);
assert.equal(conflictLabelClipRisk({ whiteSpace: 'normal', overflow: 'visible' }), false);

const labelSlice = served.slice(served.indexOf('data-ts-conflict-label":"1"'), served.indexOf('data-ts-conflict-label":"1"') + 480);
assert.doesNotMatch(labelSlice, /whiteSpace:"nowrap"/);
assert.doesNotMatch(labelSlice, /textOverflow:"ellipsis"/);
assert.match(labelSlice, /flex:"1 1 0"/);

const vkSlice = vkLive.slice(vkLive.indexOf('data-ts-conflict-label":"1"'), vkLive.indexOf('data-ts-conflict-label":"1"') + 480);
assert.match(vkSlice, /whiteSpace:"nowrap"/);
assert.match(vkSlice, /overflow:"hidden"/);

const clipLabel = {
  scrollWidth: 297,
  clientWidth: 197,
  parentElement: { getBoundingClientRect: () => ({ right: 390 }) },
  getBoundingClientRect: () => ({ right: 250 }),
};
assert.equal(judgeConflictLabelElement(clipLabel, () => ({
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
})).ok, false);

const wrapLabel = {
  scrollWidth: 190,
  clientWidth: 197,
  parentElement: { getBoundingClientRect: () => ({ right: 390 }) },
  getBoundingClientRect: () => ({ right: 240 }),
};
assert.equal(judgeConflictLabelElement(wrapLabel, () => ({ whiteSpace: 'normal', overflow: 'visible' })).ok, true);

const rangeTwoLines = () => ({
  selectNodeContents() {},
  getClientRects: () => [{ top: 10, height: 12 }, { top: 24, height: 12 }],
  detach() {},
});
assert.equal(judgeTimeZoneSingleLine({ textContent: '12:37 pm PT' }, rangeTwoLines).ok, false);

const rangeOneLine = () => ({
  selectNodeContents() {},
  getClientRects: () => [{ top: 10, height: 12 }],
  detach() {},
});
assert.equal(judgeTimeZoneSingleLine({ textContent: '12:37 pm PT' }, rangeOneLine).ok, true);

assert.match(served, /ua\.time&&!ua\.endTime\?n\.jsx\("div",\{"data-ts-timeline-time":"1"/);
assert.doesNotMatch(served, /ua\.time&&!ua\.endTime&&!ua\.isConflict\?n\.jsx\("div",\{"data-ts-timeline-time":"1"/);
assert.match(served, /gridTemplateColumns:"minmax\(68px,76px\) 22px minmax\(0,1fr\)"/);
assert.doesNotMatch(vkLive, /gridTemplateColumns:"minmax\(68px,76px\) 22px minmax\(0,1fr\)"/);

const upstream = execFileSync(
  'git',
  ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'],
  { maxBuffer: 25 * 1024 * 1024 },
).toString('utf8');
const patched = applySharedLiveTabBundlePatches(upstream, { served: true });
assert.doesNotMatch(
  patched.slice(patched.indexOf('data-ts-conflict-label":"1"'), patched.indexOf('data-ts-conflict-label":"1"') + 480),
  /whiteSpace:"nowrap"/,
);

const mockScope = {
  querySelectorAll(sel) {
    if (sel === '[data-ts-conflict-label="1"]') {
      return [{
        textContent: 'Conflict with American Airlines LAS → JFK',
        scrollWidth: 180,
        clientWidth: 200,
        parentElement: { getBoundingClientRect: () => ({ right: 360 }) },
        getBoundingClientRect: () => ({ right: 340 }),
      }];
    }
    if (sel === '[data-ts-timeline-time="1"]') {
      return [{ textContent: '12:37 pm PT' }];
    }
  },
  ownerDocument: {
    createRange: rangeOneLine,
    defaultView: { getComputedStyle: () => ({ whiteSpace: 'normal', overflow: 'visible' }) },
  },
};
const layout = collectTimelineDay390Layout(mockScope, {
  getComputedStyle: () => ({ whiteSpace: 'normal', overflow: 'visible' }),
  createRange: rangeOneLine,
});
assert.equal(layout.layoutPass, true);

console.log('timeline day 390 layout checks passed');
