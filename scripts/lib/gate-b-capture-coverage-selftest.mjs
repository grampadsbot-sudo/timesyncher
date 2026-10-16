/** Gate B capture-coverage selftest (#433): clipped frame vs full-page logo grade. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { gradeLogoTabResult, gradeLogoChipRow } from '../shepherd-staging-smoke-grader-lib.mjs';
import {
  chipCaptureClipRelation,
  isCaptureCoverageGap,
  gradeLogoChipRowWithCaptureCoverage,
} from './gate-b-shell-layout-checker.mjs';
import { measureLogoComFromPngBuffer } from '../shepherd-staging-smoke-logo-metrics.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

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

export async function assertGateBCaptureCoverageSelftest() {
  const tabClipFrame = { x: 0, y: 120, width: 390, height: 542 };
  const chipRectClippedTop = { left: 12, top: 108, right: 34, bottom: 130 };

  assert.equal(chipCaptureClipRelation(chipRectClippedTop, tabClipFrame), 'clipped');
  assert.equal(isCaptureCoverageGap(chipRectClippedTop, tabClipFrame), true);

  const emptyClippedCom = await measureLogoComFromPngBuffer(pngWithDot({ dotX: -1, dotY: -1 }));
  assert.equal(emptyClippedCom.error, 'empty_mass');

  const fullInkCom = await measureLogoComFromPngBuffer(pngWithDot({ dotX: 11, dotY: 11 }));

  const clippedRow = {
    index: 0,
    isListRowChip: true,
    isBrandImg: true,
    src: 'https://cdn.example/logo.png',
    title: 'Boat tour candidates',
    chipRect: chipRectClippedTop,
    com: emptyClippedCom,
  };

  const fullPageRow = {
    index: 0,
    isListRowChip: true,
    isBrandImg: true,
    src: 'https://cdn.example/logo.png',
    com: fullInkCom,
  };

  const gapGrade = gradeLogoChipRowWithCaptureCoverage(clippedRow, {
    captureFrame: tabClipFrame,
    fullPageRow,
    gradeLogoChipRow,
  });
  assert.equal(gapGrade.captureCoverageGap, true);
  assert.equal(gapGrade.pass, true);
  const naiveClipped = gradeLogoChipRow(clippedRow);
  assert.equal(naiveClipped.pass, false, 'clipped empty crop must not stand in for logo fail when unscoped');

  const gapTabPass = gradeLogoTabResult({
    tab: 'events',
    clicked: true,
    rows: [clippedRow],
    logoUrlEvidence: { ok: true },
    viewports: { 1280: { pass: true }, 390: { pass: true } },
    captureFrame: tabClipFrame,
    fullPageRows: [fullPageRow],
  });
  assert.equal(gapTabPass.captureCoverageGaps.length, 1);
  assert.equal(gapTabPass.pass, true);
  assert.notEqual(gapTabPass.failReason, 'empty_logo_chip');
  assert.notEqual(gapTabPass.failReason, 'logo_com_off_center');

  const fullPageRowEmpty = {
    index: 0,
    isListRowChip: true,
    isBrandImg: true,
    src: 'https://cdn.example/logo.png',
    com: emptyClippedCom,
  };

  const gapTabFail = gradeLogoTabResult({
    tab: 'events',
    clicked: true,
    rows: [clippedRow],
    logoUrlEvidence: { ok: true },
    viewports: { 1280: { pass: true }, 390: { pass: true } },
    captureFrame: tabClipFrame,
    fullPageRows: [fullPageRowEmpty],
  });
  assert.equal(gapTabFail.captureCoverageGaps.length, 1);
  assert.equal(gapTabFail.pass, false);
  assert.equal(gapTabFail.failReason, 'empty_logo_chip');
}
