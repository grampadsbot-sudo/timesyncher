#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { compareLogoMidlineRows } from './lib/itinerary-fresh-gate-metrics.mjs';
import {
  analyzeLogoChipPngBuffer,
  chipInteriorBackgroundRgb,
  gradeLogoChipInkPresence,
  logoChipInkPresent,
} from './lib/logo-pixel-ink-grade.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ISSUE_BASE_SHA = '5dd95c1f0b64965b03b2c829d525c3a7fe5d17e9';

function pngChip({ width = 22, height = 22, paint }) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const rgb = paint
        ? paint(x, y, onBorder)
        : (onBorder ? [229, 231, 235] : [248, 250, 252]);
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
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
  ].map(([x, y]) => {
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
  return improvedVsTrek
    ? true
    : absRef > maxAbs
      ? drift <= maxDrift
      : absCand <= maxAbs && drift <= maxDrift;
}

function legacyCenteredRedrawOffset(boxW, boxH, naturalW, naturalH) {
  const scale = Math.min(boxW / naturalW, boxH / naturalH);
  const dw = naturalW * scale;
  const dh = naturalH * scale;
  const dx = (boxW - dw) / 2;
  const dy = (boxH - dh) / 2;
  const cx = dx + dw / 2;
  const cy = dy + dh / 2;
  return Math.hypot(cx - (boxW - 1) / 2, cy - (boxH - 1) / 2);
}

const chromeOnly = pngChip({ paint: (x, y, onBorder) => (onBorder ? [229, 231, 235] : [248, 250, 252]) });
const legacyChromeMass = legacyCornerInkMass(chromeOnly);
const fixedChrome = analyzeLogoChipPngBuffer(chromeOnly);
assert.ok(legacyChromeMass >= 4, `legacy corner mass should false-pass chrome at ${ISSUE_BASE_SHA}`);
assert.equal(logoChipInkPresent(fixedChrome), false, 'fixed analyzer rejects border-only chrome');
assert.equal(gradeLogoChipInkPresence(fixedChrome).inkPresent, false);

const asymmetricLogo = pngChip({
  paint: (x, y, onBorder) => {
    if (x === 3 && y === 3) return [20, 40, 80];
    return onBorder ? [229, 231, 235] : [248, 250, 252];
  },
});
const fixedOffset = analyzeLogoChipPngBuffer(asymmetricLogo);
assert.ok(fixedOffset.dxPx > 3, 'asymmetric logo fixture must read as off-center');
const legacyRedrawErr = legacyCenteredRedrawOffset(22, 22, 4, 4);
assert.ok(legacyRedrawErr < 1.5, 'legacy centered redraw ignores rendered placement');
assert.ok(fixedOffset.dyPx > 2, 'fixed metric reads asymmetric vertical offset');

assert.equal(legacyComparePass(100, 99), true, 'legacy comparator false-pass at issue base');
const wideMiss = compareLogoMidlineRows(
  [{ title: 'Harbor Hyatt', midDeltaPx: 100 }],
  [{ title: 'Harbor Hyatt', midDeltaPx: 99 }],
);
assert.equal(wideMiss.pass, false, 'fixed comparator rejects over-threshold deltas');
const centered = compareLogoMidlineRows(
  [{ title: 'Summit Car Rental', midDeltaPx: 0.5 }],
  [{ title: 'Summit Car Rental', midDeltaPx: 0.8 }],
);
assert.equal(centered.pass, true, 'genuine centered rows still pass');

const interiorBg = chipInteriorBackgroundRgb(PNG.sync.read(asymmetricLogo).data, 22, 22);
assert.ok(interiorBg[0] > 240, 'interior background sampling ignores border gray');

console.log(`tsv414 layout failure suppression tests passed (base ${ISSUE_BASE_SHA.slice(0, 7)})`);
