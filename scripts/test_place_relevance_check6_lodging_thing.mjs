#!/usr/bin/env node
/**
 * Staging check 6 (turn 6c2a042e): named Kaanapali anchor with a lodging Thing on the trip.
 * Geocoded locationText includes zip; the judge must still see the classifier anchor.
 */
import assert from 'node:assert/strict';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { runCustomerChatPlaceSearch } from '../src/vacation/chat-place-search.mjs';
import {
  KAANAPALI_GEOCODE,
  KAANAPALI_ON_TARGET_BRAVE,
  LODGING_LOCALITY,
  STAGING_HOTEL_BRAVE_REJECTIONS,
} from './fixtures/place-relevance-kaanapali-brave.mjs';

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const ZIP_LOCATION_TEXT = 'Kaanapali, Maui County, Hawaii, 96761, United States';

function relevanceScoreForName(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('saved maui grill')) return 3.9;
  if (lower.includes('taco borracho') || lower.includes('whalers village')) return 3.9;
  if (STAGING_HOTEL_BRAVE_REJECTIONS.some((row) => row.title.toLowerCase() === lower)) return 0.4;
  return 2.0;
}

function mockFetch({ relevanceAreas = [], braveResults = KAANAPALI_ON_TARGET_BRAVE }) {
  return async (url, options = {}) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ ...KAANAPALI_GEOCODE, address: {} }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return {
        ok: true,
        json: async () => ({
          elements: [{
            type: 'node',
            id: 9001,
            lat: 20.9215,
            lon: -156.6942,
            tags: { name: 'El Taco Borracho', amenity: 'restaurant' },
          }],
        }),
      };
    }
    if (href.includes(BRAVE_HOST) && href.includes('local')) {
      return { ok: true, json: async () => ({ results: braveResults }) };
    }
    if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const jevState = raw.state || {};
      relevanceAreas.push(jevState.searchArea);
      const score = relevanceScoreForName(jevState.name);
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
    }
    throw new Error(`unexpected fetch ${href}`);
  };
}

const env = {
  OPENROUTER_API_KEY: 'test-openrouter',
  BRAVE_SEARCH_API_KEY: 'test-brave',
  DATABASE_URL: '',
};

const classification = {
  ok: true,
  turnKind: 'place_search',
  target: 'taco spots',
  category: 'restaurant',
  anchor: 'Kaanapali Maui',
  anchorIsLodging: false,
};

const relevanceAreas = [];
const search = await searchPlaces({
  destination: 'Kaanapali Maui',
  queries: [{ category: 'restaurant', q: 'taco spots near Kaanapali Maui', limit: 5, place: true, target: 'taco spots' }],
  relevanceTarget: 'taco spots',
  relevanceArea: 'Kaanapali Maui',
  env,
  fetchImpl: mockFetch({ relevanceAreas }),
  priorPlaces: [{
    title: 'Saved Maui Grill',
    category: 'restaurant',
    lat: 20.9208,
    lng: -156.6935,
    address: 'Kaanapali, HI',
    externalId: 'prior-saved-1',
    source: 'prior_db',
  }],
});

assert.ok(relevanceAreas.length > 0);
assert.ok(relevanceAreas.every((area) => area === 'Kaanapali Maui'), relevanceAreas.join(' | '));
const live = search.places.filter((row) => row.source !== 'prior_db');
assert.ok(live.some((row) => /taco borracho/i.test(row.title)), JSON.stringify(search.places.map((row) => row.title)));

const soleSourceAreas = [];
await assert.rejects(
  () => searchPlaces({
    destination: 'Kaanapali Maui',
    queries: [{ category: 'restaurant', q: 'taco spots near Kaanapali Maui', limit: 5, place: true, target: 'taco spots' }],
    relevanceTarget: 'taco spots',
    relevanceArea: 'Kaanapali Maui',
    env,
    fetchImpl: async (url, options = {}) => {
      const href = String(url);
      if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
        const raw = options.body ? JSON.parse(String(options.body)) : {};
        soleSourceAreas.push(raw.state?.searchArea);
        return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 0.1 } } }) };
      }
      return mockFetch({ relevanceAreas: soleSourceAreas, braveResults: KAANAPALI_ON_TARGET_BRAVE })(url, options);
    },
    priorPlaces: [{
      title: 'Only Prior Row',
      category: 'restaurant',
      lat: 20.9208,
      lng: -156.6935,
      address: 'Kaanapali, HI',
      externalId: 'prior-only',
      source: 'prior_db',
    }],
  }),
  (error) => error?.code === 'prior_db_sole_source',
);

assert.ok(soleSourceAreas.every((area) => area === 'Kaanapali Maui'));

let chatSearchArea = null;
const chatOk = await runCustomerChatPlaceSearch({
  placeSearchTurn: true,
  classification,
  tripDestination: 'Maui',
  tripResolvedArea: ZIP_LOCATION_TEXT,
  lodging: LODGING_LOCALITY,
  lodgingPoint: { lat: 20.92, lng: -156.69 },
  env,
  searchImpl: async (options) => {
    chatSearchArea = options.relevanceArea;
    return searchPlaces({
      ...options,
      fetchImpl: mockFetch({ relevanceAreas: [] }),
      priorPlaces: [],
    });
  },
});
assert.equal(chatOk.status, 'ok');
assert.equal(chatSearchArea, 'Kaanapali Maui');

const lodgingClassification = {
  ok: true,
  turnKind: 'place_search',
  target: 'tacos',
  category: 'restaurant',
  anchor: 'our hotel',
  anchorIsLodging: true,
};
const nearHotel = await runCustomerChatPlaceSearch({
  placeSearchTurn: true,
  classification: lodgingClassification,
  tripDestination: 'Maui',
  lodging: LODGING_LOCALITY,
  lodgingPoint: { lat: 20.92, lng: -156.69 },
  env,
  searchImpl: async (options) => {
    assert.equal(options.destination, LODGING_LOCALITY);
    assert.equal(options.relevanceArea, LODGING_LOCALITY);
    return {
      places: [{
        source: 'brave',
        title: 'Poolside Taco Cart',
        category: 'restaurant',
        lat: 20.921,
        lng: -156.691,
        address: 'Kaanapali, HI',
        externalId: 'brave-hotel-taco',
      }],
      providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
    };
  },
});
assert.equal(nearHotel.status, 'ok');

console.log('test_place_relevance_check6_lodging_thing: ok');
