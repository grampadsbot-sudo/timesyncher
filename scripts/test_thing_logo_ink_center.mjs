#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  inkBboxCenterYFromRgba,
  thingLogoInkCenterBundleSnippet,
  verticalNudgePxForInkCenter,
} from '../src/vacation/thing-logo-ink-center.mjs';
import { patchThingLogoChipAlignment } from '../src/vacation/trek-live-product-patches.mjs';

function rgbaWithInkBar({ width = 40, height = 40, barTop = 4, barHeight = 8 }) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const ink = y >= barTop && y < barTop + barHeight;
      data[i] = ink ? 20 : 248;
      data[i + 1] = ink ? 40 : 250;
      data[i + 2] = ink ? 80 : 252;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const topHeavy = rgbaWithInkBar({ barTop: 2, barHeight: 10 });
const inkCy = inkBboxCenterYFromRgba(topHeavy.data, topHeavy.width, topHeavy.height);
assert.ok(inkCy != null);
assert.ok(inkCy < topHeavy.height / 2);

const nudge = verticalNudgePxForInkCenter({
  inkCenterY: inkCy,
  naturalHeight: topHeavy.height,
  displayHeight: 28,
});
assert.ok(nudge > 0.5);

const centered = rgbaWithInkBar({ barTop: 10, barHeight: 21 });
const centeredCy = inkBboxCenterYFromRgba(centered.data, centered.width, centered.height);
const centeredNudge = verticalNudgePxForInkCenter({
  inkCenterY: centeredCy,
  naturalHeight: centered.height,
  displayHeight: 28,
});
assert.ok(Math.abs(centeredNudge) < 0.2);

const snippet = thingLogoInkCenterBundleSnippet();
assert.match(snippet, /^function tsCenterThingLogoInk\(/);
assert.match(snippet, /translateY/);

assert.throws(
  () => patchThingLogoChipAlignment('dc=({item:G})=>{}'),
  /missing upstream dc\(\) logo chain/,
);

console.log('thing logo ink center tests passed');
