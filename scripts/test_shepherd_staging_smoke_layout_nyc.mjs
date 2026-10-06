#!/usr/bin/env node
import assert from 'node:assert/strict';
import { thingCardFailOnSortControlsFromEnv, gradeThingCardTabScan } from './shepherd-staging-smoke-thing-card-eval.mjs';
import {
  defaultLayoutNycReferenceDir,
  gradeLayoutNycReferenceMissing,
  gradeLayoutNycStagingDom,
  layoutNycReferenceDefects,
  layoutNycReferenceDir,
  reconcileLayoutNycJudgeVerdict,
  LAYOUT_NYC_TAB_ORDER,
} from './shepherd-staging-smoke-layout-nyc.mjs';
import {
  layoutNycSharedHeaderPresentFromProbe,
  layoutNycSharedHeaderVisible,
} from './shepherd-staging-smoke-layout-nyc-header.mjs';

assert.equal(thingCardFailOnSortControlsFromEnv({}), false);
assert.equal(gradeThingCardTabScan({
  tab: 'cars', viewport: '390', sortControls: ['Name'], sortControlMatches: [{ label: 'Name' }],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'x', requiresLogo: true }], expectedRows: 1,
}, { 0: { inkPresent: true } }).pass, true);

const stagingOk = {
  tabOrder: LAYOUT_NYC_TAB_ORDER,
  sortPills: ['Name', 'Price'],
  columnSortLabels: {},
  rowCount: 2,
  rowsNameLeft: true,
  header: { present: true },
  horizontalOverflow: false,
  scrollWidth: 390,
  innerWidth: 390,
};
assert.ok(stagingOk.sortPills.includes('Name') && stagingOk.sortPills.includes('Price'));
assert.equal(Object.keys(stagingOk.columnSortLabels).length, 0);
assert.equal(stagingOk.horizontalOverflow, false);

assert.deepEqual(layoutNycReferenceDefects('hotels', '390')[0].code, 'horizontal_overflow');
const stagingColumns = {
  ...stagingOk,
  sortPills: [],
  columnSortLabels: { name: true, price: true },
};
assert.equal(reconcileLayoutNycJudgeVerdict(
  { pass: false, failures: [{ reason: 'NYC left shows sort pills' }] },
  { tab: 'hotels', viewport: '390', stagingDom: stagingOk },
).pass, true);
assert.equal(gradeLayoutNycStagingDom({ ...stagingColumns, columnSortLabels: {} }, { tab: 'hotels', viewport: '390' }).pass, false);
assert.equal(gradeLayoutNycReferenceMissing(null).failures[0].code, 'reference_missing');
assert.equal(gradeLayoutNycStagingDom(stagingOk, { tab: 'hotels', viewport: '390' }).pass, true);
assert.equal(gradeLayoutNycStagingDom(stagingColumns, { tab: 'hotels', viewport: '390' }).pass, false);
assert.equal(layoutNycReferenceDir({ NYC_REFERENCE_DIR: '', TSV_NYC_REFERENCE_DIR: '' }), defaultLayoutNycReferenceDir());

const mockStyle = (display = 'block', visibility = 'visible', opacity = '1') => ({
  display, visibility, opacity,
});
const tripHeaderEl = {
  offsetHeight: 120,
  offsetWidth: 360,
  textContent: 'TIMESYNCHER VACATION Maui March 10-17 2027',
  querySelector: () => null,
};
assert.equal(layoutNycSharedHeaderVisible(tripHeaderEl, () => mockStyle()), true);
assert.equal(
  layoutNycSharedHeaderVisible({ ...tripHeaderEl, offsetHeight: 0 }, () => mockStyle()),
  false,
);
assert.equal(
  layoutNycSharedHeaderVisible(tripHeaderEl, () => mockStyle('none')),
  false,
);
const dayByDayDom = {
  ...stagingOk,
  tabOrder: LAYOUT_NYC_TAB_ORDER,
  header: { present: layoutNycSharedHeaderPresentFromProbe({ present: true }) },
};
assert.equal(gradeLayoutNycStagingDom(dayByDayDom, { tab: 'day-by-day', viewport: '390' }).pass, true);
assert.equal(
  gradeLayoutNycStagingDom({ ...stagingOk, header: { present: false } }, { tab: 'day-by-day', viewport: '390' }).pass,
  false,
);

console.log('shepherd layout-nyc tests passed');
