#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { measureLogoComFromPngBuffer } from './shepherd-staging-smoke-logo-metrics.mjs';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
import { gradeLogoChipRow, gradeLogoTabResult } from './shepherd-staging-smoke-grader-lib.mjs';
import {
  gradeCarsHeadingLogoInk,
  gradeLogoChipInkPresence,
  logoChipInkPresent,
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

const centeredChip = await measureLogoComFromPngBuffer(pngWithDot({ dotX: 11, dotY: 11 }));
assert.equal(centeredChip.error, undefined);
assert.equal(logoChipInkPresent(centeredChip), true);
assert.equal(gradeLogoChipRow({
  isListRowChip: true,
  isBrandImg: true,
  src: 'https://cdn.example/sizeless.svg',
  com: centeredChip,
}).pass, true);

const emojiChip = await measureLogoComFromPngBuffer(pngWithDot({ dotX: 10, dotY: 11 }));
assert.equal(gradeLogoChipRow({
  isListRowChip: true,
  isBrandImg: false,
  src: '',
  com: emojiChip,
}).pass, true);

const emptyChip = await measureLogoComFromPngBuffer(pngWithDot({ dotX: -1, dotY: -1 }));
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
console.log('logo pixel ink grade tests passed');
