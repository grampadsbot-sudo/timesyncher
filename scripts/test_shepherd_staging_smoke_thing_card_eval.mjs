#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  apiThingTagsForTab,
  forbiddenSortControlsFromMatches,
  gradeThingCardSortButtons,
  gradeThingCardSortButtonsHarness,
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

assert.equal(thingCardFailOnSortControlsFromEnv({}), false);
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

const sortPresentDefault = gradeThingCardTabScan(sortScan, inkOk);
assert.equal(sortPresentDefault.pass, true);
assert.equal(sortPresentDefault.failures.some((f) => f.rule === 'sort_control'), false);

const failSortFlagOn = gradeThingCardTabScan(sortScan, inkOk, { failOnSortControls: true });
assert.equal(failSortFlagOn.pass, false);
assert.ok(failSortFlagOn.failures.some((f) => f.rule === 'sort_control'));

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
}, { 0: { inkPresent: true } });
assert.equal(failSummary.pass, false);

const failInk = gradeThingCardTabScan({
  tab: 'cars',
  viewport: '390',
  sortControls: [],
  sortControlMatches: [],
  rows: [{ index: 0, title: 'Hertz', summaryText: 'OGG pickup', requiresLogo: true }],
  expectedRows: 1,
}, { 0: { inkPresent: false, inkError: 'ink_below_min_mass' } });
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

const sortButtonsNotEnough = gradeThingCardSortButtons({
  tab: 'cars',
  viewport: '390',
  sortControlMatches: pillMatches,
  rows: [{ title: 'Hertz' }],
  orders: {},
});
assert.equal(sortButtonsNotEnough.status, 'not_enough_rows');
assert.equal(sortButtonsNotEnough.pass, true);
assert.equal(sortButtonsNotEnough.failures.length, 0);

const sortButtonsPass = gradeThingCardSortButtons({
  tab: 'cars',
  viewport: '1280',
  sortControlMatches: pillMatches,
  rows: [{ title: 'Alamo' }, { title: 'Hertz' }],
  orders: {
    nameAfterFirst: ['Alamo', 'Hertz'],
    nameAfterSecond: ['Hertz', 'Alamo'],
    nameActiveAfterFirst: 'Name ↑',
    priceAfter: ['Alamo $45', 'Hertz $55'],
    priceActiveAfterClick: 'Price ↑',
    priceDirection: 'asc',
  },
});
assert.equal(sortButtonsPass.pass, true);
assert.equal(sortButtonsPass.priceSortExercised, true);

const sortButtonsPriceNotExercised = gradeThingCardSortButtons({
  tab: 'hotels',
  viewport: '390',
  sortControlMatches: pillMatches,
  rows: [{ title: 'Westin' }, { title: 'Hyatt' }],
  orders: {
    nameAfterFirst: ['Hyatt', 'Westin'],
    nameAfterSecond: ['Westin', 'Hyatt'],
    nameActiveAfterFirst: 'Name ↑',
    priceAfter: ['Westin stay', 'Hyatt stay'],
    priceClicked: true,
    priceDirection: 'asc',
  },
});
assert.equal(sortButtonsPriceNotExercised.priceStatus, 'price_not_exercised');
assert.equal(sortButtonsPriceNotExercised.priceSortExercised, false);
assert.equal(sortButtonsPriceNotExercised.pass, true);

const sortButtonsFailName = gradeThingCardSortButtons({
  tab: 'cars',
  viewport: '390',
  sortControlMatches: pillMatches,
  rows: [{ title: 'Alamo' }, { title: 'Hertz' }],
  orders: {
    nameAfterFirst: ['Hertz', 'Alamo'],
    nameAfterSecond: ['Hertz', 'Alamo'],
    nameActiveAfterFirst: 'Name ↑',
    priceAfter: ['Alamo $45', 'Hertz $55'],
    priceActiveAfterClick: 'Price ↑',
    priceDirection: 'asc',
  },
});
assert.equal(sortButtonsFailName.pass, false);

const sortButtonsMissing = gradeThingCardSortButtons({
  tab: 'cars',
  viewport: '390',
  sortControlMatches: [],
  rows: [{ title: 'Alamo' }, { title: 'Hertz' }],
  orders: {},
});
assert.equal(sortButtonsMissing.pass, false);
assert.ok(sortButtonsMissing.failures.some((f) => f.detail.includes('missing Name')));

const sortButtonsColumnLabels = gradeThingCardSortButtons({
  tab: 'cars',
  viewport: '390',
  sortControlMatches: pillMatches,
  columnSortLabels: { name: { label: 'Name' }, price: { label: 'Price' } },
  rows: [{ title: 'Alamo' }, { title: 'Hertz' }],
  orders: {
    nameAfterFirst: ['Alamo', 'Hertz'],
    nameAfterSecond: ['Hertz', 'Alamo'],
    nameActiveAfterFirst: 'Name ↑',
    priceAfter: ['Alamo $45', 'Hertz $55'],
    priceActiveAfterClick: 'Price ↑',
    priceDirection: 'asc',
  },
});
assert.equal(sortButtonsColumnLabels.pass, false);

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
  sortButtons: { pass: true, status: 'not_enough_rows', failures: [] },
}, { 0: { inkPresent: true } });
assert.equal(hotelOneRowNoSortFail.failures.some((f) => f.rule === 'SORT-BUTTONS'), false);

const harnessCarsExercised = gradeThingCardHarnessResult({
  tabs: ['cars', 'hotels'],
  probes: [
    {
      tab: 'hotels',
      viewport: '390',
      rowCount: 1,
      pass: true,
      failures: [],
      sortButtonsGate: { status: 'not_enough_rows', rowCount: 1, rowSortExercised: false },
    },
    {
      tab: 'cars',
      viewport: '390',
      rowCount: 2,
      pass: true,
      failures: [],
      sortButtonsGate: carsSortGate,
    },
    {
      tab: 'hotels',
      viewport: '1280',
      rowCount: 1,
      pass: true,
      failures: [],
      sortButtonsGate: { status: 'not_enough_rows', rowCount: 1, rowSortExercised: false },
    },
    {
      tab: 'cars',
      viewport: '1280',
      rowCount: 2,
      pass: true,
      failures: [],
      sortButtonsGate: carsSortGate,
    },
  ],
});
assert.equal(
  harnessCarsExercised.failures.some((f) => f.rule === 'SORT-BUTTONS' && String(f.detail).includes('>=2 rows')),
  false,
);
assert.equal(
  harnessCarsExercised.failures.some((f) => f.rule === 'SORT-BUTTONS' && String(f.detail).includes('priced rows')),
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
      sortButtonsGate: { status: 'not_enough_rows', rowCount: 1, rowSortExercised: false },
    },
  ],
});
assert.ok(harnessAllUnderTwoRows.failures.some((f) => f.detail.includes('>=2 rows')));

const priceNotExercisedGate = {
  status: 'ok',
  rowCount: 2,
  rowSortExercised: true,
  priceSortExercised: false,
  priceStatus: 'price_not_exercised',
};
const harnessPriceNotExercised = gradeThingCardHarnessResult({
  tabs: ['cars', 'hotels'],
  probes: [
    {
      tab: 'hotels',
      viewport: '390',
      rowCount: 1,
      pass: true,
      failures: [],
      sortButtonsGate: { status: 'not_enough_rows', rowCount: 1, rowSortExercised: false },
    },
    {
      tab: 'cars',
      viewport: '390',
      rowCount: 2,
      pass: true,
      failures: [],
      sortButtonsGate: priceNotExercisedGate,
    },
    {
      tab: 'hotels',
      viewport: '1280',
      rowCount: 1,
      pass: true,
      failures: [],
      sortButtonsGate: { status: 'not_enough_rows', rowCount: 1, rowSortExercised: false },
    },
    {
      tab: 'cars',
      viewport: '1280',
      rowCount: 2,
      pass: true,
      failures: [],
      sortButtonsGate: priceNotExercisedGate,
    },
  ],
});
assert.equal(harnessPriceNotExercised.pass, false);
assert.ok(
  harnessPriceNotExercised.failures.some(
    (f) => f.rule === 'SORT-BUTTONS' && String(f.detail).includes('priced rows'),
  ),
);

assert.deepEqual(
  gradeThingCardSortButtonsHarness([
    { viewport: '390', rowCount: 2, sortButtonsGate: carsSortGate, pass: true, failures: [] },
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
}, { 0: { inkPresent: true } });
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
