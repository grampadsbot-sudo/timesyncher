#!/usr/bin/env node
import assert from 'node:assert/strict';
import { thingCardFailOnSortControlsFromEnv, gradeThingCardTabScan } from './shepherd-staging-smoke-thing-card-eval.mjs';
import {
  gradeLayoutNycReferenceMissing,
  gradeLayoutNycStagingDom,
  layoutNycReferenceDefects,
  reconcileLayoutNycJudgeVerdict,
  LAYOUT_NYC_TAB_ORDER,
} from './shepherd-staging-smoke-layout-nyc.mjs';

assert.equal(thingCardFailOnSortControlsFromEnv({}), true);
assert.equal(gradeThingCardTabScan({
  tab: 'cars', viewport: '390', sortControls: ['Name'], sortControlMatches: [{ label: 'Name' }],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'x', requiresLogo: true }], expectedRows: 1,
}, { 0: { inkPresent: true } }).pass, false);

const stagingOk = {
  tabOrder: LAYOUT_NYC_TAB_ORDER,
  sortPills: [],
  columnSortLabels: { name: { label: 'Name' }, price: { label: 'Price' } },
  rowCount: 2,
  rowsNameLeft: true,
  header: { present: true },
  horizontalOverflow: false,
  scrollWidth: 390,
  innerWidth: 390,
};
assert.equal(gradeLayoutNycStagingDom(stagingOk, { tab: 'hotels', viewport: '390' }).pass, true);
assert.equal(gradeLayoutNycStagingDom({ ...stagingOk, sortPills: ['Name'] }, { tab: 'hotels', viewport: '390' }).pass, false);
assert.equal(gradeLayoutNycStagingDom({ ...stagingOk, columnSortLabels: {} }, { tab: 'flights', viewport: '1280' }).pass, false);
assert.equal(gradeLayoutNycStagingDom({ ...stagingOk, horizontalOverflow: true, scrollWidth: 420 }, { tab: 'hotels', viewport: '390' }).pass, false);

assert.deepEqual(layoutNycReferenceDefects('hotels', '390')[0].code, 'horizontal_overflow');
assert.equal(reconcileLayoutNycJudgeVerdict(
  { pass: false, failures: [{ reason: 'NYC left shows sort pills' }] },
  { tab: 'hotels', viewport: '390', stagingDom: stagingOk },
).pass, true);
assert.equal(reconcileLayoutNycJudgeVerdict(
  { pass: true, failures: [] },
  { tab: 'hotels', viewport: '390', stagingDom: { ...stagingOk, sortPills: ['Name'] } },
).pass, false);
assert.equal(gradeLayoutNycReferenceMissing(null).failures[0].code, 'reference_missing');

console.log('shepherd layout-nyc tests passed');
