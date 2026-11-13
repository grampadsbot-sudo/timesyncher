#!/usr/bin/env node
import assert from 'node:assert/strict';

import { judgeBoxAlign } from './lib/acceptance-box-align-judge.mjs';

const offset = { x: 0, y: 0 };
const top = { vw: 390, vh: 844 };
const box = (left, topY, width, height) => ({
  left, top: topY, right: left + width, bottom: topY + height, width, height,
});

function measure({ rect, anchor, rendered = true, found = true }) {
  return {
    found, rendered, rect, anchor,
    text: '', lines: 1, textBox: rect,
    block: { tag: 'div', rect, clientWidth: rect.width, scrollWidth: rect.width, textOverflow: 'clip' },
  };
}

{
  const assertion = {
    type: 'box_align',
    anchor: { selector: '[data-ts-list-row-rating]', same_row: true, tol_px: 4 },
  };
  const m = measure({
    rect: box(200, 400, 120, 14),
    anchor: box(16, 400, 0, 0),
  });
  const r = judgeBoxAlign(assertion, m, offset, top);
  assert.equal(r.pass, false, 'zero-size star anchor must fail same_row');
  assert.equal(r.observed.checks.same_row.reason, 'zero_size_anchor');
}

{
  const assertion = {
    type: 'box_align',
    anchor: { selector: '[data-ts-list-row-rating]', same_row: true, tol_px: 4 },
  };
  const m = measure({
    rect: box(200, 400, 120, 14),
    anchor: box(16, 398, 72, 16),
  });
  const r = judgeBoxAlign(assertion, m, offset, top);
  assert.equal(r.pass, true, r);
}

console.log('test_acceptance_box_align_judge: ok');
