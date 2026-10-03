#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  bravePlaceDisplayTitle,
  preferBraveUrlDuplicates,
} from '../src/vacation/brave-place-query.mjs';
import { placeToTripThing, queryBravePlaceSearch } from '../src/vacation/place-search.mjs';
import {
  KIHEI_CAFFE_BRAVE_HOTEL_TITLE_DUPE,
  KIHEI_CAFFE_BRAVE_LIVE,
} from './fixtures/place-search-brave-kihei-caffe.mjs';

const liveRow = KIHEI_CAFFE_BRAVE_LIVE[0];
const dupeRow = KIHEI_CAFFE_BRAVE_HOTEL_TITLE_DUPE[0];

assert.equal(bravePlaceDisplayTitle(liveRow), 'Kihei Caffe');
assert.equal(bravePlaceDisplayTitle(dupeRow), 'Kihei Caffe Maui Coast Hotel');
assert.equal(Object.hasOwn(liveRow, 'name'), false);

const deduped = preferBraveUrlDuplicates([
  { source: 'brave', title: dupeRow.title, url: dupeRow.url, providerRank: 4, sourceRecord: dupeRow },
  { source: 'brave', title: liveRow.title, url: liveRow.url, providerRank: 0, sourceRecord: liveRow },
]);
assert.equal(deduped.length, 1);
assert.equal(deduped[0].title, 'Kihei Caffe');
assert.equal(deduped[0].providerRank, 0);

const center = { lat: 20.7312953, lng: -156.4517898, label: 'Kihei, Maui' };
const env = { brave: 'brave-test-key' };
const combinedResults = [...KIHEI_CAFFE_BRAVE_LIVE, ...KIHEI_CAFFE_BRAVE_HOTEL_TITLE_DUPE];

const { places } = await queryBravePlaceSearch(
  async () => ({ ok: true, json: async () => ({ results: combinedResults }) }),
  env,
  { center, locationText: 'Kihei', compactLocality: 'Kihei' },
  [{ category: 'restaurant', q: 'coffee near Kihei', limit: 5, place: true }],
);

assert.equal(places.length, 1);
assert.equal(places[0].title, 'Kihei Caffe');
assert.equal(placeToTripThing(places[0]).title, 'Kihei Caffe');

console.log('test_place_search_kihei_caffe_title: ok');
