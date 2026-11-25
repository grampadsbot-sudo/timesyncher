#!/usr/bin/env node
import assert from 'node:assert/strict';

import { placeToTripThing } from '../src/vacation/place-search.mjs';
import {
  preferVkUrlDuplicates,
  queryVkSearchPlaces,
  resolveVkSearchPlaceIdentity,
} from '../src/vacation/vk-search-place-identity.mjs';
import {
  KIHEI_CAFFE_BRAVE_HOTEL_TITLE_DUPE,
  KIHEI_CAFFE_BRAVE_LIVE,
} from './fixtures/place-search-brave-kihei-caffe.mjs';

const liveRow = KIHEI_CAFFE_BRAVE_LIVE[0];
const dupeRow = KIHEI_CAFFE_BRAVE_HOTEL_TITLE_DUPE[0];

const liveResolved = await resolveVkSearchPlaceIdentity(liveRow, { category: 'restaurant', env: {} });
const dupeResolved = await resolveVkSearchPlaceIdentity(dupeRow, { category: 'restaurant', env: {} });
assert.equal(liveResolved.place.title, 'Kihei Caffe');
assert.equal(dupeResolved.place.title, 'Kihei Caffe Maui Coast Hotel');
assert.equal(Object.hasOwn(liveRow, 'name'), false);

const deduped = preferVkUrlDuplicates([
  { source: 'vk-search', title: dupeRow.title, url: dupeRow.url, providerRank: 4, sourceRecord: dupeRow },
  { source: 'vk-search', title: liveRow.title, url: liveRow.url, providerRank: 0, sourceRecord: liveRow },
]);
assert.equal(deduped.length, 1);
assert.equal(deduped[0].title, 'Kihei Caffe');
assert.equal(deduped[0].providerRank, 0);

const center = { lat: 20.7312953, lng: -156.4517898, label: 'Kihei, Maui' };
const env = { VK_SEARCH_WAKE_URL: 'https://vk-search.example/wake' };
const combinedResults = [...KIHEI_CAFFE_BRAVE_LIVE, ...KIHEI_CAFFE_BRAVE_HOTEL_TITLE_DUPE];

const { places } = await queryVkSearchPlaces(
  async () => ({ ok: true, json: async () => ({ results: combinedResults }) }),
  env,
  { center, locationText: 'Kihei', compactLocality: 'Kihei' },
  [{ category: 'restaurant', q: 'coffee near Kihei', limit: 5, place: true }],
);

assert.equal(places.length, 1);
assert.equal(places[0].title, 'Kihei Caffe');
assert.equal(placeToTripThing(places[0]).title, 'Kihei Caffe');

console.log('test_place_search_kihei_caffe_title: ok');
