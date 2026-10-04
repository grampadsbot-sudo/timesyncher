#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  apiThingTagsForTab,
  forbiddenSortControlsFromMatches,
  gradeThingCardSortByLabel,
  gradeThingCardSortByLabelHarness,
  gradeThingCardTabScan,
  gradeThingCardHarnessResult,
  gradeThingCardTagFilterParity,
  isAscendingNameOrder,
  isDescendingNameOrder,
  populatedThingCardTabs,
  priceOrderOk,
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

assert.equal(thingCardFailOnSortControlsFromEnv({}), true);
assert.equal(thingCardFailOnSortControlsFromEnv({ THING_CARD_FAIL_ON_SORT_CONTROLS: '0' }), false);
assert.equal(thingCardFailOnSortControlsFromEnv({ THING_CARD_FAIL_ON_SORT_CONTROLS: 'true' }), true);

const pillMatches = [{ label: 'Name', kind: 'pill' }, { label: 'Price ↑', kind: 'pill' }];
assert.deepEqual(forbiddenSortControlsFromMatches(pillMatches), ['Name', 'Price ↑']);
assert.deepEqual(forbiddenSortControlsFromMatches([]), []);

const sortScan = {
  tab: 'cars',
  viewport: '390',
  sortControls: ['Name', 'Price ↑'],
  sortControlMatches: pillMatches,
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
};
const inkOk = { 0: { inkPresent: true } };

const sortPresentFlagOff = gradeThingCardTabScan(sortScan, inkOk, { failOnSortControls: false });
assert.equal(sortPresentFlagOff.pass, true);
assert.equal(sortPresentFlagOff.failures.some((f) => f.rule === 'sort_control'), false);

const failSortDefault = gradeThingCardTabScan(sortScan, inkOk);
assert.equal(failSortDefault.pass, false);
assert.ok(failSortDefault.failures.some((f) => f.rule === 'sort_control'));

const columnOnlyGrade = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  sortControlMatches: [],
  columnSortLabels: { name: { label: 'Name ↑' }, price: { label: 'Price' } },
  rows: [
    { index: 0, title: 'Alamo', summaryText: 'pickup', requiresLogo: true },
    { index: 1, title: 'Hertz', summaryText: 'pickup', requiresLogo: true },
  ],
  expectedRows: 2,
}, { 0: { inkPresent: true }, 1: { inkPresent: true } });
assert.equal(columnOnlyGrade.failures.some((f) => f.rule === 'sort_control'), false);

const failSummary = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  sortControlMatches: [],
  rows: [{ index: 0, title: 'Hertz', summaryText: '', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: true } }, { failOnSortControls: false });
assert.equal(failSummary.pass, false);

const failInk = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  sortControlMatches: [],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: false, inkError: 'ink_below_min_mass' } }, { failOnSortControls: false });
assert.equal(failInk.pass, false);

const pass = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  sortControlMatches: [],
  filterTags: [],
  thingTags: [],
  apiThingTags: [],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: true } });
assert.equal(pass.pass, true);

assert.equal(isAscendingNameOrder(['Alamo', 'Hertz']), true);
assert.equal(isDescendingNameOrder(['Hertz', 'Alamo']), true);

assert.equal(priceOrderOk([45, 55], 'asc'), true);
assert.equal(priceOrderOk([55, 45], 'asc'), false);
assert.equal(priceOrderOk([null, 45, 55], 'asc'), true);
assert.equal(priceOrderOk([45, null, 55], 'asc'), false);

const sortLabelNotEnough = gradeThingCardSortByLabel({
  tab: 'cars',
  viewport: '390',
  columnSortLabels: { name: { label: 'Name' }, price: { label: 'Price' } },
  rows: [{ title: 'Hertz' }],
  orders: {},
});
assert.equal(sortLabelNotEnough.status, 'not_enough_rows');
assert.equal(sortLabelNotEnough.pass, true);
assert.equal(sortLabelNotEnough.failures.length, 0);

const sortLabelPass = gradeThingCardSortByLabel({
  tab: 'cars',
  viewport: '1280',
  columnSortLabels: { name: { label: 'Name' }, price: { label: 'Price' } },
  rows: [{ title: 'Alamo' }, { title: 'Hertz' }],
  orders: {
    nameAfterFirst: ['Alamo', 'Hertz'],
    nameAfterSecond: ['Hertz', 'Alamo'],
    priceAfter: ['Alamo $45', 'Hertz $55'],
    priceDirection: 'asc',
  },
});
assert.equal(sortLabelPass.pass, true);
assert.equal(sortLabelPass.priceSortExercised, true);

const sortLabelPriceNotExercised = gradeThingCardSortByLabel({
  tab: 'hotels',
  viewport: '390',
  columnSortLabels: { name: { label: 'Name' }, price: { label: 'Price' } },
  rows: [{ title: 'Westin' }, { title: 'Hyatt' }],
  orders: {
    nameAfterFirst: ['Hyatt', 'Westin'],
    nameAfterSecond: ['Westin', 'Hyatt'],
    priceAfter: ['Westin stay', 'Hyatt stay'],
    priceClicked: true,
    priceDirection: 'asc',
  },
});
assert.equal(sortLabelPriceNotExercised.priceStatus, 'price_not_exercised');
assert.equal(sortLabelPriceNotExercised.priceSortExercised, false);
assert.equal(sortLabelPriceNotExercised.pass, true);

const sortLabelFailName = gradeThingCardSortByLabel({
  tab: 'cars',
  viewport: '390',
  columnSortLabels: { name: { label: 'Name' }, price: { label: 'Price' } },
  rows: [{ title: 'Alamo' }, { title: 'Hertz' }],
  orders: {
    nameAfterFirst: ['Hertz', 'Alamo'],
    nameAfterSecond: ['Hertz', 'Alamo'],
    priceAfter: ['Alamo $45', 'Hertz $55'],
    priceDirection: 'asc',
  },
});
assert.equal(sortLabelFailName.pass, false);

const sortLabelMissing = gradeThingCardSortByLabel({
  tab: 'cars',
  viewport: '390',
  columnSortLabels: { name: null, price: null },
  rows: [{ title: 'Alamo' }, { title: 'Hertz' }],
  orders: {},
});
assert.equal(sortLabelMissing.pass, false);
assert.ok(sortLabelMissing.failures.some((f) => f.detail.includes('missing Name')));

const carsSortGate = {
  status: 'ok',
  rowCount: 2,
  rowSortExercised: true,
  priceSortExercised: true,
  priceStatus: 'ok',
};

const hotelOneRowNoSortFail = gradeThingCardTabScan({
  tab: 'hotels',
  viewport: '390',
  sortControls: [],
  sortControlMatches: [],
  rows: [{ index: 0, title: 'Westin', summaryText: 'stay', requiresLogo: true }],
  expectedRows: 1,
  sortByLabel: { pass: true, status: 'not_enough_rows', failures: [] },
}, { 0: { inkPresent: true } }, { failOnSortControls: false });
assert.equal(hotelOneRowNoSortFail.failures.some((f) => f.rule === 'SORT-BY-LABEL'), false);

const harnessCarsExercised = gradeThingCardHarnessResult({
  tabs: ['cars', 'hotels'],
  probes: [
    {
      tab: 'hotels',
      viewport: '390',
      rowCount: 1,
      pass: true,
      failures: [],
      sortByLabelGate: { status: 'not_enough_rows', rowCount: 1, rowSortExercised: false },
    },
    {
      tab: 'cars',
      viewport: '390',
      rowCount: 2,
      pass: true,
      failures: [],
      sortByLabelGate: carsSortGate,
    },
    {
      tab: 'hotels',
      viewport: '1280',
      rowCount: 1,
      pass: true,
      failures: [],
      sortByLabelGate: { status: 'not_enough_rows', rowCount: 1, rowSortExercised: false },
    },
    {
      tab: 'cars',
      viewport: '1280',
      rowCount: 2,
      pass: true,
      failures: [],
      sortByLabelGate: carsSortGate,
    },
  ],
});
assert.equal(
  harnessCarsExercised.failures.some((f) => f.rule === 'SORT-BY-LABEL' && String(f.detail).includes('>=2 rows')),
  false,
);
assert.equal(
  harnessCarsExercised.failures.some((f) => f.rule === 'SORT-BY-LABEL' && String(f.detail).includes('priced rows')),
  false,
);

const harnessAllUnderTwoRows = gradeThingCardHarnessResult({
  tabs: ['hotels'],
  probes: [
    {
      tab: 'hotels',
      viewport: '390',
      rowCount: 1,
      pass: true,
      failures: [],
      sortByLabelGate: { status: 'not_enough_rows', rowCount: 1, rowSortExercised: false },
    },
  ],
});
assert.ok(harnessAllUnderTwoRows.failures.some((f) => f.detail.includes('>=2 rows')));

assert.deepEqual(
  gradeThingCardSortByLabelHarness([
    { viewport: '390', rowCount: 2, sortByLabelGate: carsSortGate, pass: true, failures: [] },
  ]),
  [],
);

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
  sortControlMatches: [],
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
