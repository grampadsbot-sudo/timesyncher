#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { measureLogoComFromPngBuffer } from './shepherd-staging-smoke-logo-metrics.mjs';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
import { gradeLogoChipRow, gradeLogoTabResult } from './shepherd-staging-smoke-grader-lib.mjs';
import { centerOfMassFromRgba } from './lib/logo-chip-center-of-mass.mjs';
import { compareLogoMidlineRows } from './lib/itinerary-fresh-gate-metrics.mjs';
import {
  gradeCarsHeadingLogoInk,
  gradeLogoChipInkPresence,
  logoChipInkPresent,
  measureLogoInkComFromPngBuffer,
} from './lib/logo-pixel-ink-grade.mjs';

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

const centeredChip = measureLogoInkComFromPngBuffer(pngWithDot({ dotX: 11, dotY: 11 }));
assert.equal(centeredChip.error, undefined);
assert.equal(logoChipInkPresent(centeredChip), true);
assert.equal(gradeLogoChipRow({
  isListRowChip: true,
  isBrandImg: true,
  src: 'https://cdn.example/sizeless.svg',
  com: centeredChip,
}).pass, true);

const emojiChip = measureLogoInkComFromPngBuffer(pngWithDot({ dotX: 10, dotY: 11 }));
assert.equal(gradeLogoChipRow({
  isListRowChip: true,
  isBrandImg: false,
  src: '',
  com: emojiChip,
}).pass, true);

const emptyChip = measureLogoInkComFromPngBuffer(pngWithDot({ dotX: -1, dotY: -1 }));
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

function pngProductionStyledBlankChip() {
  const width = 22;
  const height = 22;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      png.data[i] = border ? 229 : 248;
      png.data[i + 1] = border ? 231 : 250;
      png.data[i + 2] = border ? 235 : 252;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const legacyBlankChip = await measureLogoComFromPngBuffer(pngProductionStyledBlankChip());
function logoChipInkPresentAtBase(com = {}) {
  if (!com || com.error) return false;
  const mass = Number(com.mass);
  return Number.isFinite(mass) && mass >= 4;
}
assert.equal(logoChipInkPresentAtBase(legacyBlankChip), true, '5dd95c1 full-chip metric false-passed on border chrome');
assert.equal(logoChipInkPresent(legacyBlankChip), false, 'border chrome alone must not count as logo ink');
const interiorBlankChip = measureLogoInkComFromPngBuffer(pngProductionStyledBlankChip());
assert.equal(interiorBlankChip.error, 'empty_mass');
assert.equal(logoChipInkPresent(interiorBlankChip), false);

function rgbaBufferWithDot({ chipW, chipH, dotX, dotY, dotRadius = 2 }) {
  const data = new Uint8ClampedArray(chipW * chipH * 4);
  for (let y = 0; y < chipH; y += 1) {
    for (let x = 0; x < chipW; x += 1) {
      const i = (y * chipW + x) * 4;
      const ink = Math.hypot(x - dotX, y - dotY) <= dotRadius;
      data[i] = ink ? 20 : 248;
      data[i + 1] = ink ? 40 : 250;
      data[i + 2] = ink ? 80 : 252;
      data[i + 3] = 255;
    }
  }
  return data;
}

const centeredLayout = centerOfMassFromRgba(rgbaBufferWithDot({ chipW: 30, chipH: 30, dotX: 15, dotY: 15 }), 30, 30);
const offCenterLayout = centerOfMassFromRgba(rgbaBufferWithDot({ chipW: 30, chipH: 30, dotX: 4, dotY: 4 }), 30, 30);
assert.ok(centeredLayout && Math.hypot(centeredLayout.absDx, centeredLayout.absDy) <= 1.5);
assert.ok(offCenterLayout && Math.hypot(offCenterLayout.absDx, offCenterLayout.absDy) > 1.5);

function compareLogoMidlineRowsLegacy(referenceRows, candidateRows, { maxAbs = 2, maxDrift = 1.5 } = {}) {
  const refByTitle = new Map((referenceRows || []).map((row) => [String(row.title || '').trim(), row]));
  const compared = (candidateRows || []).map((cand) => {
    const ref = refByTitle.get(String(cand.title || '').trim());
    const refDelta = ref?.midDeltaPx ?? null;
    const absCand = Math.abs(cand.midDeltaPx);
    const absRef = refDelta == null ? null : Math.abs(refDelta);
    const drift = refDelta == null ? null : Math.abs(cand.midDeltaPx - refDelta);
    const improvedVsTrek = absRef != null && absRef > maxAbs && absCand + 1 <= absRef;
    const pass = refDelta == null
      ? absCand <= maxAbs
      : improvedVsTrek
        ? true
        : absRef > maxAbs
          ? drift <= maxDrift
          : absCand <= maxAbs && drift <= maxDrift;
    return { pass, improvedVsTrek };
  });
  return { pass: compared.length > 0 && compared.every((row) => row.pass), rows: compared };
}

const badCandidate = [{ title: 'Harbor Hyatt', midDeltaPx: 99 }];
const badReference = [{ title: 'Harbor Hyatt', midDeltaPx: 100 }];
assert.equal(compareLogoMidlineRowsLegacy(badReference, badCandidate).pass, true);
assert.equal(compareLogoMidlineRows(badReference, badCandidate).pass, false);
assert.equal(
  compareLogoMidlineRows(
    [{ title: 'Summit Car Rental', midDeltaPx: 0.5 }],
    [{ title: 'Summit Car Rental', midDeltaPx: 0.5 }],
  ).pass,
  true,
);
assert.equal(
  compareLogoMidlineRows(
    [{ title: 'Summit Car Rental', midDeltaPx: 0.5 }],
    [],
  ).pass,
  false,
);

console.log('logo pixel ink grade tests passed');
