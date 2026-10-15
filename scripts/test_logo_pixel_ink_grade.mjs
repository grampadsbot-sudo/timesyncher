#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
import { gradeLogoChipRow, gradeLogoTabResult } from './shepherd-staging-smoke-grader-lib.mjs';
import { compareLogoMidlineRows } from './lib/itinerary-fresh-gate-metrics.mjs';
import {
  analyzeLogoChipPngBuffer,
  chipInteriorBackgroundRgb,
  gradeCarsHeadingLogoInk,
  gradeLogoChipInkPresence,
  logoChipInkPresent,
} from './lib/logo-pixel-ink-grade.mjs';

const ISSUE_BASE_SHA = '5dd95c1f0b64965b03b2c829d525c3a7fe5d17e9';

function pngWithDot({ width = 22, height = 22, dotX = 11, dotY = 11 }) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const ink = x === dotX && y === dotY;
      png.data[i] = ink ? 20 : 248;
      png.data[i + 1] = ink ? 40 : 250;
      png.data[i + 2] = ink ? 80 : 252;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const centeredChip = analyzeLogoChipPngBuffer(pngWithDot({ dotX: 11, dotY: 11 }));
assert.equal(centeredChip.error, undefined);
assert.equal(logoChipInkPresent(centeredChip), true);
assert.equal(gradeLogoChipRow({
  isListRowChip: true,
  isBrandImg: true,
  src: 'https://cdn.example/sizeless.svg',
  com: centeredChip,
}).pass, true);

const emojiChip = analyzeLogoChipPngBuffer(pngWithDot({ dotX: 10, dotY: 11 }));
assert.equal(gradeLogoChipRow({
  isListRowChip: true,
  isBrandImg: false,
  src: '',
  com: emojiChip,
}).pass, true);

const emptyChip = analyzeLogoChipPngBuffer(pngWithDot({ dotX: -1, dotY: -1 }));
assert.equal(emptyChip.error, 'empty_mass');
assert.equal(gradeLogoChipInkPresence(emptyChip).inkPresent, false);
assert.equal(gradeLogoChipRow({
  isListRowChip: true,
  isBrandImg: true,
  src: 'https://cdn.example/logo.png',
  com: emptyChip,
}).pass, false);

const tabNoInk = gradeLogoTabResult({
  tab: 'hotels',
  clicked: true,
  rows: [{
    isListRowChip: true,
    isBrandImg: true,
    src: 'https://cdn.example/logo.png',
    com: emptyChip,
  }],
  logoUrlEvidence: { ok: true },
  viewports: { 1280: { pass: true }, 390: { pass: true } },
});
assert.equal(tabNoInk.pass, false);
assert.equal(tabNoInk.failReason, 'empty_logo_chip');

assert.equal(
  gradeCarsHeadingLogoInk({ tab: 'Cars', labelVisible: true, iconVsLabelPx: 2, chipMass: 40 }).pass,
  false,
);
assert.equal(
  gradeCarsHeadingLogoInk({ tab: 'Cars', labelVisible: true, iconVsLabelPx: 0.4, chipMass: 40 }).pass,
  true,
);
function pngChip({ width = 22, height = 22, paint }) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const rgb = paint ? paint(x, y, onBorder) : (onBorder ? [229, 231, 235] : [248, 250, 252]);
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function legacyCornerInkMass(buf) {
  const png = PNG.sync.read(buf);
  const { width: w, height: h, data } = png;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  });
  const bg = corners.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
    .map((v) => v / corners.length);
  let mass = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(data[i] - bg[0]);
      const dg = Math.abs(data[i + 1] - bg[1]);
      const db = Math.abs(data[i + 2] - bg[2]);
      if (dr + dg + db < 18) continue;
      mass += dr + dg + db;
    }
  }
  return mass;
}

function legacyComparePass(refDelta, candDelta, maxAbs = 2, maxDrift = 1.5) {
  const absCand = Math.abs(candDelta);
  const absRef = Math.abs(refDelta);
  const drift = Math.abs(candDelta - refDelta);
  const improvedVsTrek = absRef > maxAbs && absCand + 1 <= absRef;
  return improvedVsTrek ? true : absRef > maxAbs ? drift <= maxDrift : absCand <= maxAbs && drift <= maxDrift;
}

const chromeOnly = pngChip({ paint: (x, y, onBorder) => (onBorder ? [229, 231, 235] : [248, 250, 252]) });
assert.ok(legacyCornerInkMass(chromeOnly) >= 4, `legacy corner mass false-pass at ${ISSUE_BASE_SHA}`);
const fixedChrome = analyzeLogoChipPngBuffer(chromeOnly);
assert.equal(logoChipInkPresent(fixedChrome), false);
const asymmetricLogo = pngChip({
  paint: (x, y, onBorder) => (x === 3 && y === 3 ? [20, 40, 80] : (onBorder ? [229, 231, 235] : [248, 250, 252])),
});
const fixedOffset = analyzeLogoChipPngBuffer(asymmetricLogo);
assert.ok(fixedOffset.dxPx > 3 && fixedOffset.dyPx > 2);
assert.equal(legacyComparePass(100, 99), true);
assert.equal(compareLogoMidlineRows(
  [{ title: 'Harbor Hyatt', midDeltaPx: 100 }],
  [{ title: 'Harbor Hyatt', midDeltaPx: 99 }],
).pass, false);
assert.equal(compareLogoMidlineRows(
  [{ title: 'Summit Car Rental', midDeltaPx: 0.5 }],
  [{ title: 'Summit Car Rental', midDeltaPx: 0.8 }],
).pass, true);
assert.ok(chipInteriorBackgroundRgb(PNG.sync.read(asymmetricLogo).data, 22, 22)[0] > 240);

console.log('logo pixel ink grade tests passed');
