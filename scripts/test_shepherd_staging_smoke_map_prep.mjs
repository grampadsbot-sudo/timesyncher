#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mapLogoSharePollSatisfied,
  mapLogoShareReady,
  sharedTabPlaceCount,
  thingCardSortTabsReady,
  THING_CARD_SORT_MIN_TAB_ROWS,
} from './shepherd-staging-smoke-map-prep-lib.mjs';

const oneCar = {
  places: [{ id: 1, name: 'Hertz OGG', category_name: 'Car' }],
  thingOverrides: { 'place:1': { price: 45, category: 'car', logoUrl: 'https://example.com/hertz.png' } },
};
const twoCars = {
  places: [
    { id: 1, name: 'Hertz OGG', category_name: 'Car' },
    { id: 2, name: 'Alamo OGG', category_name: 'Car' },
  ],
  thingOverrides: {
    'place:1': { price: 45, category: 'car', logoUrl: 'https://example.com/hertz.png' },
    'place:2': { price: 55, category: 'car', logoUrl: 'https://example.com/alamo.png' },
  },
};

assert.equal(sharedTabPlaceCount(oneCar, 'cars'), 1);
assert.equal(sharedTabPlaceCount(twoCars, 'cars'), 2);
assert.equal(thingCardSortTabsReady(oneCar), false);
assert.equal(thingCardSortTabsReady(twoCars), true);
assert.equal(mapLogoShareReady({ places: [] }), false);
assert.equal(mapLogoShareReady(oneCar), true);
assert.equal(mapLogoSharePollSatisfied(oneCar), false);
assert.equal(mapLogoSharePollSatisfied(twoCars), true);
assert.equal(THING_CARD_SORT_MIN_TAB_ROWS, 2);

console.log('shepherd staging smoke map prep passed');
