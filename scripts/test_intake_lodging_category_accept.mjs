#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  braveAddress,
  braveCategoryName,
  braveLocalPlaceResult,
  bravePlaceSearchRows,
  bravePoint,
  braveProviderCategories,
  braveTitle,
} from '../src/vacation/brave-place-query.mjs';
import { isLodgingProviderPlace } from '../src/vacation/intake-lodging-category.mjs';
import { persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';
import { urlIsNominatim } from './intake-lodging-test-hosts.mjs';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/intake-lodging-brave/', import.meta.url));

function loadFixture(name) {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, 'utf8'));
}

function bravePlacesFromFixture(fixture, category = 'hotel') {
  const rows = [];
  const braveRows = bravePlaceSearchRows(fixture, 'local');
  for (let providerRank = 0; providerRank < braveRows.length; providerRank += 1) {
    const result = braveRows[providerRank];
    if (!braveLocalPlaceResult(result)) continue;
    const point = bravePoint(result);
    const title = braveTitle(result?.title || result?.name);
    const address = braveAddress(result);
    if (!title) continue;
    const providerCategories = braveProviderCategories(result);
    rows.push({
      source: 'brave',
      title,
      category,
      lat: point.lat,
      lng: point.lng,
      address,
      url: String(result?.url || ''),
      externalId: String(result?.id || result?.url || ''),
      categoryName: braveCategoryName(result),
      providerCategories,
      providerRank,
      sourceRecord: result,
    });
  }
  return rows;
}

function mockTripDb() {
  const tripThings = [];
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (sql.includes('delete from trip_things')) {
      const title = values.find((value) => typeof value === 'string' && value.length > 3);
      const idx = tripThings.findIndex((row) => row.title === title && row.metadata?.source === 'customer_stated');
      if (idx >= 0) tripThings.splice(idx, 1);
      return [];
    }
    if (sql.includes('insert into trip_things')) {
      const viaInsertTripThing = sql.includes('source_request_id');
      const category = viaInsertTripThing ? values[2] : values[1];
      const title = viaInsertTripThing ? values[4] : values[2];
      const locationRaw = viaInsertTripThing ? values[10] : values.find((value) => typeof value === 'string' && value.includes('"lat"'));
      const location = typeof locationRaw === 'string' ? JSON.parse(locationRaw) : (locationRaw || {});
      tripThings.push({ category, title, location });
      return [{ id: `thing-${tripThings.length}` }];
    }
    if (sql.includes('update trips') && sql.includes('metadata')) return [];
    return [];
  };
  return { db, tripThings };
}

const hyattFixture = loadFixture('hyatt-regency-maui.json');
const kiheiFixture = loadFixture('kihei-kai-nani.json');
const hyattPlaces = bravePlacesFromFixture(hyattFixture);
const kiheiPlaces = bravePlacesFromFixture(kiheiFixture);
assert.equal(hyattPlaces.length, 1);
assert.equal(kiheiPlaces.length, 1);
assert.ok(hyattPlaces[0].providerCategories.some((tag) => /resort/i.test(tag)));
assert.ok(kiheiPlaces[0].providerCategories.some((tag) => /condominium|vacation rental/i.test(tag)));
assert.equal(
  isLodgingProviderPlace({
    source: 'brave',
    title: 'Beach Grill',
    category: 'restaurant',
    categoryName: 'Restaurant',
    providerCategories: braveProviderCategories({
      title: 'Beach Grill',
      categories: ['Restaurant'],
      description: 'Casual dining inside the Hyatt hotel',
    }),
  }),
  false,
);

const { db: hyattDb, tripThings: hyattThings } = mockTripDb();
const hyattOutcome = await persistIntakeLodgingThings(hyattDb, 'trip-hyatt', 'req-hyatt', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  destinationHint: 'Maui',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async () => ({
    places: hyattPlaces,
    providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
    center: { lat: 20.92, lng: -156.69 },
  }),
});
assert.equal(hyattOutcome.saved.length, 1);
assert.equal(hyattOutcome.misses.length, 0);
assert.equal(hyattThings.length, 1);
assert.equal(hyattThings[0].category, 'hotel');
assert.match(hyattThings[0].title, /Hyatt Regency Maui/i);
assert.equal(Number(hyattThings[0].location.lat), hyattPlaces[0].lat);
assert.equal(Number(hyattThings[0].location.lng), hyattPlaces[0].lng);
assert.equal(hyattThings[0].location.address, hyattPlaces[0].address);

const { db: kiheiDb, tripThings: kiheiThings } = mockTripDb();
const kiheiOutcome = await persistIntakeLodgingThings(kiheiDb, 'trip-kihei', 'req-kihei', [{ title: 'Kihei Kai Nani', category: 'hotel' }], {
  areaHint: 'Kihei',
  destinationHint: 'Maui',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async () => ({
    places: kiheiPlaces,
    providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
    center: { lat: 20.75, lng: -156.45 },
  }),
});
assert.equal(kiheiOutcome.saved.length, 1);
assert.equal(kiheiOutcome.misses.length, 0);
assert.equal(kiheiThings.length, 1);
assert.match(kiheiThings[0].title, /Kihei Kai Nani/i);
assert.equal(kiheiThings[0].location.address, kiheiPlaces[0].address);
assert.equal(kiheiThings.filter((row) => row.category !== 'hotel').length, 0);

const emptyNominatimFetch = async (url) => {
  const href = String(url);
  if (!urlIsNominatim(href)) throw new Error(`unexpected fetch ${href}`);
  return { ok: true, json: async () => [] };
};

const { db: missDb, tripThings: missThings } = mockTripDb();
const wrongAreaOutcome = await persistIntakeLodgingThings(missDb, 'trip-miss', 'req-miss', [{ title: 'Kihei Kai Nani', category: 'hotel' }], {
  areaHint: 'Kihei',
  destinationHint: 'Maui',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  fetchImpl: emptyNominatimFetch,
  searchImpl: async () => ({
    places: [{
      source: 'brave',
      title: 'Kihei Kai Nani Resort',
      category: 'activity',
      categoryName: 'Condominium',
      providerCategories: ['lodging', 'Condominium', 'Vacation rental'],
      providerRank: 0,
      sourceRecord: {
        id: 'fixture-wrong-area',
        title: 'Kihei Kai Nani Resort',
        categories: [],
        icon_category: 'lodging',
        coordinates: [21.2793, -157.8293],
        postal_address: { displayAddress: '2552 Kalakaua Ave, Honolulu, HI 96815' },
      },
      lat: 21.2793,
      lng: -157.8293,
      address: '2552 Kalakaua Ave, Honolulu, HI 96815',
      externalId: 'fixture-wrong-area',
    }],
    providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
    center: { lat: 20.75, lng: -156.45 },
  }),
});
assert.equal(wrongAreaOutcome.saved.length, 1);
assert.equal(missThings.filter((row) => row.category === 'hotel').length, 1);
assert.equal(missThings.filter((row) => /Honolulu/i.test(row.location?.address || '')).length, 0);
assert.equal(wrongAreaOutcome.misses.length, 1);
assert.equal(wrongAreaOutcome.misses[0].status, 'miss');
assert.equal(wrongAreaOutcome.misses[0].reason, 'no_structural_area_match');

const { db: shortTitleDb, tripThings: shortTitleThings } = mockTripDb();
const shortTitleOutcome = await persistIntakeLodgingThings(shortTitleDb, 'trip-short', 'req-short', [{ title: 'Hyatt Regency Maui', category: 'hotel' }], {
  areaHint: 'Kaanapali',
  destinationHint: 'Maui',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  fetchImpl: emptyNominatimFetch,
  searchImpl: async () => ({
    places: [{
      source: 'brave',
      title: 'Coastal Lookout Point',
      category: 'hotel',
      categoryName: 'Hotel',
      providerCategories: ['lodging', 'Hotel'],
      providerRank: 0,
      sourceRecord: {
        id: 'fixture-unrelated-lodging-title',
        title: 'Coastal Lookout Point',
        icon_category: 'lodging',
        categories: ['lodging'],
        coordinates: [20.92, -156.69],
        postal_address: { displayAddress: '200 Nohea Kai Dr, Kaanapali, HI' },
      },
      lat: 20.92,
      lng: -156.69,
      address: '200 Nohea Kai Dr, Kaanapali, HI',
      externalId: 'fixture-unrelated-lodging-title',
    }],
    center: { lat: 20.92, lng: -156.69 },
    providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
  }),
});
assert.equal(shortTitleOutcome.misses.length, 1);
assert.equal(shortTitleOutcome.misses[0].reason, 'no_structural_name_match');
assert.equal(shortTitleThings.filter((row) => row.title === 'Coastal Lookout Point').length, 0);
assert.equal(shortTitleOutcome.saved.length, 1);
assert.match(shortTitleOutcome.saved[0].title, /Hyatt Regency Maui/i);

console.log('test_intake_lodging_category_accept: ok');
