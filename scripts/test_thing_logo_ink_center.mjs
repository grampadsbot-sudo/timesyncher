#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  inkBboxCenterYFromRgba,
  inkCenterYNaturalFromTable,
  inkScreenCenterY,
  normalizeThingLogoUrl,
  objectFitContainContentRect,
  thingLogoInkCenterBundleSnippet,
  verticalNudgePxForInkCenter,
  verticalNudgePxForInkToScreenTarget,
  verticalNudgePxForEmojiFallback,
  listRowFirstNameLineCenterY,
  emojiInkCenterCssY,
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

const imgRect = { top: 100, left: 50, width: 28, height: 28 };
const content = objectFitContainContentRect(imgRect, topHeavy.width, topHeavy.height);
const inkY = inkScreenCenterY({ inkCenterY: inkCy, naturalHeight: topHeavy.height, contentRect: content });
assert.ok(inkY != null && inkY < imgRect.top + imgRect.height / 2);
const toName = verticalNudgePxForInkToScreenTarget({
  inkCenterY: inkCy,
  naturalWidth: topHeavy.width,
  naturalHeight: topHeavy.height,
  imgRect,
  targetScreenY: imgRect.top + 14,
});
assert.ok(toName > 0.5);

const table = {
  'https://www.apple.com/favicon.ico': { inkCy: 8, nh: 32 },
};
const fromTable = inkCenterYNaturalFromTable(
  table,
  'https://www.apple.com/favicon.ico',
  32,
);
assert.equal(fromTable, 8);
assert.equal(
  inkCenterYNaturalFromTable(table, 'https://www.apple.com/favicon.ico#x', 64),
  16,
);
assert.equal(normalizeThingLogoUrl('https://x/y.ico#frag'), 'https://x/y.ico');

const snippet = thingLogoInkCenterBundleSnippet(table);
assert.match(snippet, /const TS_LOGO_INK_CY=/);
assert.match(snippet, /TS_LOGO_INK_CY\[key\]/);
assert.match(snippet, /data-ts-list-row-name/);
assert.match(snippet, /createTreeWalker/);
assert.match(snippet, /function tsCenterThingLogoInk\(/);
assert.match(snippet, /function tsCenterThingLogoFallback\(/);
assert.match(snippet, /function tsCenterListLogoFallbackDom\(/);
assert.match(snippet, /translateY/);
assert.doesNotMatch(
  snippet.match(/function tsCenterThingLogoInk\([^)]*\)\{[\s\S]*?\} function tsCenterThingLogoFallback/)?.[0] || '',
  /getImageData/,
);

const emojiNudge = verticalNudgePxForEmojiFallback({
  chipRect: { top: 100, height: 22 },
  emoji: '🍽️',
  font: '800 14px system-ui',
  targetScreenY: 109,
  cssSize: 22,
});
assert.ok(Math.abs(emojiNudge) < 12);
assert.equal(listRowFirstNameLineCenterY(null), null);
assert.equal(emojiInkCenterCssY({ emoji: '', font: '14px sans', cssSize: 22 }), null);

assert.throws(
  () => patchThingLogoChipAlignment('dc=({item:G})=>{}'),
  /missing upstream dc\(\) logo chain/,
);

console.log('thing logo ink center tests passed');
