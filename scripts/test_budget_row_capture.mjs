#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attachFixtureBudgetCounts, isLegacyBudgetLine, mergeBudgetEvidence } from './ops/capture/budget-rows.mjs';

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
assert.match(capture, /mergeBudgetEvidence/);
assert.match(capture, /CHROME_PATH/);
const rows = readFileSync(new URL('./ops/capture/budget-rows.mjs', import.meta.url), 'utf8');
assert.match(rows, /budget_row_count/);
assert.match(rows, /budget_membership/);
assert.match(rows, /budget_text/);
assert.match(rows, /budget_row: true/);
assert.match(capture, /startsWith\('budget'\)/);
assert.match(capture, /attachFixtureBudgetCounts/);
const staging = readFileSync(new URL('./ops/capture/capture-staging.sh', import.meta.url), 'utf8');
assert.match(staging, /budget_capture_evidence.py/);

const region = { struct: {}, items: [], row_count: 0 };
mergeBudgetEvidence(region, {
  budget_row_count: 1,
  budget_membership: [{ name: 'Hotel Belleclaire', place_id: '603', amount_text: '$10', box: [1, 2, 3, 4] }],
  budget_text: 'Overall trip budget',
}, 'li[data-list-row]');
attachFixtureBudgetCounts(region, {
  places: [{ id: 1 }, { id: 603 }],
  assignments: { '10': [{ place_id: 603 }] },
});
assert.equal(region.struct.budget_row_count, 1);
assert.equal(region.struct.budget_membership[0].box[2], 3);
assert.deepEqual(region.struct.budget_timeline_place_ids, ['603']);
assert.equal(region.budget_catalog_count, 2);

const dir = mkdtempSync(join(tmpdir(), 'budget-evidence-'));
const regionsPath = join(dir, 'capture-regions.json');
const fixturePath = join(dir, 'fixture.json');
writeFileSync(regionsPath, JSON.stringify({ 'budget-390.png': region, 'hotels-390.png': { ok: true } }));
writeFileSync(fixturePath, JSON.stringify({ places: [{ id: 1 }, { id: 603 }], assignments: { '10': [{ place_id: 603 }] } }));
const commentPath = join(dir, 'comment.txt');
const outPath = join(dir, 'budget-evidence.json');
const printed = execFileSync('python3', [
  new URL('./ops/capture/budget_capture_evidence.py', import.meta.url).pathname,
  '--regions', regionsPath,
  '--fixture', fixturePath,
  '--out', outPath,
  '--comment', commentPath,
], { encoding: 'utf8' });
assert.match(printed, /catalog_count=2 timeline_count=1/);
assert.match(printed, /budget-390.png: budget_row_count=1 geometry=COLLECTED/);
assert.match(printed, /place_id=603 name=Hotel Belleclaire amount=\$10 box=\[1, 2, 3, 4\]/);
assert.match(printed, /pixel acceptance thresholds unchanged/);
assert.doesNotMatch(printed, /hotels-390/);
const evidence = JSON.parse(readFileSync(outPath, 'utf8'));
assert.equal(evidence.pixel_thresholds_unchanged, true);
assert.deepEqual(evidence.shots[0].off_timeline, []);
assert.deepEqual(evidence.shots[0].missing_timeline, []);

console.log('budget row capture counts flex div lines, not only list li');
