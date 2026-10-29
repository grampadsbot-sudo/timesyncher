#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isLegacyBudgetLine } from './ops/capture/budget-rows.mjs';

assert.equal(isLegacyBudgetLine({
  display: 'flex',
  justifyContent: 'space-between',
  hasButton: true,
  priceText: 'Add price',
  insideListRow: false,
  marked: false,
}), true);
assert.equal(isLegacyBudgetLine({
  display: 'flex',
  justifyContent: 'space-between',
  hasButton: true,
  priceText: '$240',
  insideListRow: false,
  marked: false,
}), true);
assert.equal(isLegacyBudgetLine({
  display: 'flex',
  justifyContent: 'space-between',
  hasButton: true,
  priceText: '$240',
  insideListRow: true,
  marked: false,
}), false, 'list rows are not budget lines');
assert.equal(isLegacyBudgetLine({
  display: 'block',
  justifyContent: 'normal',
  hasButton: false,
  priceText: '',
  insideListRow: false,
  marked: true,
}), true, 'marked budget divs count even without the legacy flex shape');

const capture = readFileSync(new URL('./ops/capture/capture.mjs', import.meta.url), 'utf8');
assert.match(capture, /collectBudgetEvidence/);
assert.match(capture, /budget_row_count/);
assert.match(capture, /budget_membership/);
assert.match(capture, /budget_text/);
assert.match(capture, /row_count = \(regions\[shot\]\.row_count \|\| 0\) \+ budget\.budget_row_count/);
assert.match(capture, /budget_row: true/);
assert.match(capture, /CHROME_PATH/);

console.log('budget row capture counts flex div lines, not only list li');
