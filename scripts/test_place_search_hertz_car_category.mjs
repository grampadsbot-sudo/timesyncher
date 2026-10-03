#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  braveAddress,
  braveLocalPlaceResult,
  bravePlaceSearchRows,
  bravePoint,
  braveProviderCategories,
  bravePlaceDisplayTitle,
} from '../src/vacation/brave-place-query.mjs';
import {
  braveResultHasCarRentalTag,
  osmTagsIndicateCarRental,
  placePersistCategory,
  isCarRentalProviderPlace,
} from '../src/vacation/intake-car-category.mjs';
import { mergePlaces, placeToTripThing, queryBravePlaceSearch } from '../src/vacation/place-search.mjs';
import { osmAppCategoryFromTags } from '../src/vacation/place-search-osm-tag-map.mjs';
import { HERTZ_KAHULUI_BRAVE } from './fixtures/place-search-brave-hertz-kahului.mjs';

const center = { lat: 20.8913266, lng: -156.4410129, label: 'Kahului, Maui' };
const env = { brave: 'brave-test-key' };

const { places } = await queryBravePlaceSearch(
  async () => ({ ok: true, json: async () => ({ results: HERTZ_KAHULUI_BRAVE }) }),
  env,
  { center, locationText: 'Kahului', compactLocality: 'Kahului', namedPlaceLookup: true },
  [{ category: 'store', q: 'Hertz Kahului, Kahului', limit: 5, place: true, targetKind: 'named_place', target: 'Hertz Kahului', intakeLodgingLookup: true }],
);

assert.equal(places.length, 1);
assert.equal(places[0].title, 'Hertz Car Rental - Kahului Airport');
assert.equal(bravePlaceDisplayTitle(HERTZ_KAHULUI_BRAVE[0]), 'Hertz Car Rental - Kahului Airport');
assert.equal(braveResultHasCarRentalTag(HERTZ_KAHULUI_BRAVE[0]), true);
assert.equal(HERTZ_KAHULUI_BRAVE[0].categories.length, 0);
assert.equal(osmTagsIndicateCarRental({ amenity: 'car_rental' }), true);
assert.equal(isCarRentalProviderPlace(places[0]), true);
assert.equal(places[0].category, 'car');
const merged = mergePlaces([places]);
assert.equal(merged.length, 1);
assert.equal(merged[0].category, 'car');
assert.equal(placePersistCategory({ category: 'store', source: 'brave', sourceRecord: HERTZ_KAHULUI_BRAVE[0] }), 'car');

const thing = placeToTripThing(places[0]);
assert.equal(thing.category, 'car');
assert.equal(thing.metadata.sourceRecord.icon_category, 'car_rental');

const row = bravePlaceSearchRows({ results: HERTZ_KAHULUI_BRAVE }, 'local')[0];
assert.ok(braveLocalPlaceResult(row));
assert.ok(braveProviderCategories(row).some((tag) => tag.toLowerCase() === 'car_rental'));
assert.match(braveAddress(row), /Kahului/i);

assert.equal(osmAppCategoryFromTags({ amenity: 'car_rental', name: 'Hertz' }), 'car');

console.log('test_place_search_hertz_car_category: ok');
