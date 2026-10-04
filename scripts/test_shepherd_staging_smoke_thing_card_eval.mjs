#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  apiThingTagsForTab,
  gradeThingCardTabScan,
  gradeThingCardHarnessResult,
  gradeThingCardTagFilterParity,
  populatedThingCardTabs,
  thingCardSortControlLabel,
  thingCardFailOnSortControlsFromEnv,
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

assert.equal(thingCardFailOnSortControlsFromEnv({}), false);
assert.equal(thingCardFailOnSortControlsFromEnv({ THING_CARD_FAIL_ON_SORT_CONTROLS: 'true' }), true);

const sortScan = {
  tab: 'cars',
  viewport: '390',
  sortControls: ['Name', 'Price ↑'],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
};
const inkOk = { 0: { inkPresent: true } };

const sortPresentFlagOff = gradeThingCardTabScan(sortScan, inkOk, { failOnSortControls: false });
assert.equal(sortPresentFlagOff.pass, true);
assert.equal(sortPresentFlagOff.failures.some((f) => f.rule === 'sort_control'), false);

const failSort = gradeThingCardTabScan(sortScan, inkOk, { failOnSortControls: true });
assert.equal(failSort.pass, false);
assert.ok(failSort.failures.some((f) => f.rule === 'sort_control'));

const failSummary = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: ['Name'],
  rows: [{ index: 0, title: 'Hertz', summaryText: '', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: true } }, { failOnSortControls: false });
assert.equal(failSummary.pass, false);

const failInk = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: ['Price ↑'],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: false, inkError: 'ink_below_min_mass' } }, { failOnSortControls: false });
assert.equal(failInk.pass, false);

const pass = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  filterTags: [],
  thingTags: [],
  apiThingTags: [],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: true } });
assert.equal(pass.pass, true);

const tagMatch = gradeThingCardTagFilterParity({
  tab: 'restaurants',
  viewport: '390',
  filterTags: ['Seafood', 'Italian'],
  thingTags: ['Italian', 'Seafood'],
  apiThingTags: ['Italian', 'Seafood'],
});
assert.equal(tagMatch.pass, true);

const tagMissing = gradeThingCardTagFilterParity({
  tab: 'restaurants',
  viewport: '1280',
  filterTags: ['Italian'],
  thingTags: ['Italian', 'Seafood'],
  apiThingTags: ['Italian', 'Seafood'],
});
assert.equal(tagMissing.pass, false);
assert.ok(tagMissing.failures.some((f) => f.rule === 'tag_filter_missing'));

const tagOrphan = gradeThingCardTagFilterParity({
  tab: 'stores',
  viewport: '390',
  filterTags: ['Boutique', 'Grocery / Market'],
  thingTags: ['Boutique'],
  apiThingTags: ['Boutique'],
});
assert.equal(tagOrphan.pass, false);
assert.ok(tagOrphan.failures.some((f) => f.rule === 'tag_filter_orphan'));

const apiTags = apiThingTagsForTab({
  places: [{ id: 9, name: 'Fish Hopper', category_name: 'restaurant' }],
  thingOverrides: { 'place:9': { restaurantTags: ['Seafood'] } },
}, 'restaurants');
assert.deepEqual(apiTags, ['Seafood']);

const tagScanPass = gradeThingCardTabScan({
  tab: 'restaurants',
  viewport: '390',
  sortControls: [],
  filterTags: ['Seafood'],
  thingTags: ['Seafood'],
  apiThingTags: ['Seafood'],
  rows: [{ index: 0, title: 'Fish Hopper', summaryText: 'dinner', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: true } }, { failOnSortControls: false });
assert.equal(tagScanPass.pass, true);

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
