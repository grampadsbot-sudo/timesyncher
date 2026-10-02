#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolvePlaceSearchDestination } from '../src/vacation/place-search-anchor.mjs';
import { runCustomerChatPlaceSearch } from '../src/vacation/chat-place-search.mjs';

const lodgingClassification = {
  ok: true,
  turnKind: 'place_search',
  target: 'tacos',
  anchor: 'our hotel',
  anchorIsLodging: true,
};

assert.equal(
  resolvePlaceSearchDestination({
    classification: lodgingClassification,
    lodgingText: 'Kaanapali, Maui County, Hawaii, US',
    tripDestination: 'Kaanapali Maui',
    tripResolvedArea: 'Resolved Kaanapali',
  }),
  'Kaanapali, Maui County, Hawaii, US',
  'lodging Thing wins first',
);

assert.equal(
  resolvePlaceSearchDestination({
    classification: lodgingClassification,
    lodgingText: '',
    tripDestination: 'Kaanapali Maui',
    tripResolvedArea: 'Resolved Kaanapali',
  }),
  'Kaanapali Maui',
  'trip destination is second',
);

assert.equal(
  resolvePlaceSearchDestination({
    classification: lodgingClassification,
    lodgingText: '',
    tripDestination: '',
    tripResolvedArea: 'Resolved Kaanapali',
  }),
  'Resolved Kaanapali',
  'trip resolved area is third',
);

assert.equal(
  resolvePlaceSearchDestination({
    classification: lodgingClassification,
    lodgingText: '',
    tripDestination: '',
    tripResolvedArea: '',
  }),
  '',
  'true none yields empty area',
);

let braveCalls = 0;
const ok = await runCustomerChatPlaceSearch({
  placeSearchTurn: true,
  classification: lodgingClassification,
  tripDestination: 'Kaanapali Maui',
  lodging: 'Kaanapali, Maui County, Hawaii, US',
  lodgingPoint: { lat: 20.92, lng: -156.69 },
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async (options) => {
    braveCalls += 1;
    assert.doesNotMatch(options.destination, /our hotel/i);
    assert.match(options.destination, /Kaanapali/);
    return {
      places: [{
        source: 'brave',
        title: 'Taco Cart',
        category: 'restaurant',
        lat: 20.921,
        lng: -156.691,
        address: 'Kaanapali, HI',
        externalId: 'brave-taco-1',
      }],
      providers: [{ provider: 'brave', status: 'ok', resultCount: 1, query: 'tacos near Kaanapali' }],
    };
  },
});
assert.equal(braveCalls, 1);
assert.equal(ok.status, 'ok');

assert.equal(
  resolvePlaceSearchDestination({
    classification: { anchorIsLodging: false, anchor: 'Kaanapali Maui' },
    tripDestination: 'Maui',
    tripResolvedArea: '',
  }),
  'Kaanapali Maui',
  'anchorIsLodging false uses named area',
);

let fallbackCalls = 0;
const lodgingNoThing = await runCustomerChatPlaceSearch({
  placeSearchTurn: true,
  classification: lodgingClassification,
  tripDestination: 'Kaanapali Maui',
  lodging: '',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
  searchImpl: async (options) => {
    fallbackCalls += 1;
    assert.doesNotMatch(options.destination, /our hotel/i);
    assert.equal(options.destination, 'Kaanapali Maui');
    return {
      places: [{
        source: 'brave',
        title: 'Taco Cart',
        category: 'restaurant',
        lat: 20.921,
        lng: -156.691,
        address: 'Kaanapali, HI',
        externalId: 'brave-taco-2',
      }],
      providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
    };
  },
});
assert.equal(fallbackCalls, 1);
assert.equal(lodgingNoThing.status, 'ok');

const failed = await runCustomerChatPlaceSearch({
  placeSearchTurn: true,
  classification: lodgingClassification,
  tripDestination: '',
  tripResolvedArea: '',
  lodging: '',
  env: { OPENROUTER_API_KEY: 'test' },
});
assert.equal(failed.status, 'failed');
assert.match(failed.error, /Place search needs a trip destination or a named area/);

console.log('test_place_search_lodging_anchor: ok');
