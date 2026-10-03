#!/usr/bin/env node
import assert from 'node:assert/strict';

import { bravePlaceDisplayTitle } from '../src/vacation/brave-place-query.mjs';
import { placeToTripThing, queryBravePlaceSearch } from '../src/vacation/place-search.mjs';
import {
  KIHEI_CAFFE_BRAVE_CLEAN_TITLE,
  KIHEI_CAFFE_BRAVE_LONG_TITLE,
} from './fixtures/place-search-brave-kihei-caffe.mjs';

const center = { lat: 20.7482, lng: -156.4541, label: 'Kihei, Maui' };
const env = { brave: 'brave-test-key' };

assert.equal(bravePlaceDisplayTitle(KIHEI_CAFFE_BRAVE_LONG_TITLE[0]), 'Kihei Caffe');
assert.equal(bravePlaceDisplayTitle(KIHEI_CAFFE_BRAVE_CLEAN_TITLE[0]), 'Kihei Caffe');

const fetchImpl = async () => ({
  ok: true,
  json: async () => ({ results: KIHEI_CAFFE_BRAVE_LONG_TITLE }),
});

const { places } = await queryBravePlaceSearch(
  fetchImpl,
  env,
  { center, locationText: 'Kihei', compactLocality: 'Kihei' },
  [{ category: 'restaurant', q: 'coffee near Kihei', limit: 5, place: true, targetKind: 'category', target: 'coffee' }],
);

assert.equal(places.length, 1);
assert.equal(places[0].title, 'Kihei Caffe');
assert.equal(placeToTripThing(places[0]).title, 'Kihei Caffe');
assert.notEqual(places[0].title, KIHEI_CAFFE_BRAVE_LONG_TITLE[0].title);

const { places: cleanPlaces } = await queryBravePlaceSearch(
  async () => ({ ok: true, json: async () => ({ results: KIHEI_CAFFE_BRAVE_CLEAN_TITLE }) }),
  env,
  { center, locationText: 'Kihei', compactLocality: 'Kihei' },
  [{ category: 'restaurant', q: 'coffee near Kihei', limit: 5, place: true }],
);

assert.equal(cleanPlaces[0].title, 'Kihei Caffe');

console.log('test_place_search_kihei_caffe_title: ok');
