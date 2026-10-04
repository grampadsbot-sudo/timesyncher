#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  gradeThingCardTabScan,
  gradeThingCardHarnessResult,
  populatedThingCardTabs,
  thingCardSortControlLabel,
  rowInkGradeFromCom,
} from './shepherd-staging-smoke-thing-card-eval.mjs';

assert.equal(thingCardSortControlLabel('Name'), 'Name');
assert.equal(thingCardSortControlLabel('Price ↑'), 'Price ↑');
assert.equal(thingCardSortControlLabel('Hertz'), null);

const sharedJson = {
  places: [
    { id: 1, name: 'Hertz', category_name: 'car' },
    { id: 2, name: 'Hyatt', category_name: 'hotel' },
  ],
  thingOverrides: {},
};
const tabs = populatedThingCardTabs(sharedJson);
assert.ok(tabs.includes('cars'));
assert.ok(tabs.includes('hotels'));

const failSort = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: ['Name', 'Price ↑'],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: true } });
assert.equal(failSort.pass, false);
assert.ok(failSort.failures.some((f) => f.rule === 'sort_control'));

const failSummary = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  rows: [{ index: 0, title: 'Hertz', summaryText: '', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: true } });
assert.equal(failSummary.pass, false);

const failInk = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: false, inkError: 'ink_below_min_mass' } });
assert.equal(failInk.pass, false);

const pass = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: true } });
assert.equal(pass.pass, true);

const harness = gradeThingCardHarnessResult({
  tabs: ['cars', 'hotels'],
  probes: [
    { tab: 'cars', viewport: '390', pass: true, failures: [] },
    { tab: 'hotels', viewport: '390', pass: false, failures: [{ rule: 'logo_ink', detail: 'x' }] },
  ],
});
assert.equal(harness.pass, false);

assert.equal(rowInkGradeFromCom({ mass: 10 }).inkPresent, true);
assert.equal(rowInkGradeFromCom({ mass: 1 }).inkPresent, false);

console.log('shepherd thing-card eval tests passed');
