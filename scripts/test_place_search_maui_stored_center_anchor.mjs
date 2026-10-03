#!/usr/bin/env node
import assert from 'node:assert/strict';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';
import {
  KIHEI_LODGING_GEOCODE,
  MAUI_D2_GEOCODE,
} from './fixtures/place-search-maui-d2-geocode.mjs';
import { runPlaceProviderPass } from '../src/vacation/place-search-provider-pass.mjs';
installNoopNominatimStore();

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass', 'api', 'de'].join('-');
const STORED_MAUI_CENTER = { lat: 20.8029568, lng: -156.3106833 };

const KAANAPALI_GEOCODE = {
  lat: '20.9212',
  lon: '-156.6926',
  display_name: 'Kaanapali, Maui County, Hawaii, United States',
  address: { town: 'Kaanapali', county: 'Maui County', state: 'Hawaii', country_code: 'us' },
};

function nominatimFetch(geocodeByQuery) {
  return async (url) => {
    const href = decodeURIComponent(String(url));
    if (!href.includes(NOMINATIM_HOST)) throw new Error(href);
    for (const [needle, hit] of Object.entries(geocodeByQuery)) {
      if (href.toLowerCase().includes(needle.toLowerCase())) {
        return { ok: true, json: async () => [hit] };
      }
    }
    throw new Error(`unexpected nominatim query: ${href}`);
  };
}

const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };

async function providerPassForAnchor({ dest, anchor, target, category = 'restaurant' }) {
  let nominatimCalls = 0;
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      nominatimCalls += 1;
      return nominatimFetch({
        kaanapali: KAANAPALI_GEOCODE,
        kihei: KIHEI_LODGING_GEOCODE,
        maui: MAUI_D2_GEOCODE,
      })(url);
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href.includes('brave.com')) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes('openrouter')) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 4 } } }) };
    }
    throw new Error(href);
  };
  const pass = await runPlaceProviderPass({
    fetchImpl,
    env,
    dest,
    tripDestinationLabel: 'Maui',
    lodging: '',
    lodgingPoint: null,
    tripDestinationCenter: STORED_MAUI_CENTER,
    placeQueries: [{
      category,
      q: `${target} near ${dest}`,
      limit: 5,
      place: true,
      targetKind: 'category',
      target,
    }],
    osmCategoryFilter: [category],
    searchAnchor: { text: anchor, source: 'named_anchor' },
    relevanceContext: { target, area: anchor },
    tripId: 'trip-maui-anchor',
    priorPlaces: [],
    selectPriorPlaces: (rows) => rows,
    priorRowsFromInput: (rows) => rows,
    queryOsm: async () => [],
    queryBrave: async () => [],
    mergePlaces: () => [],
    attachRelevance: async (rows) => ({ places: rows, rejections: [] }),
    readJson: async () => ({}),
    fail: (message) => {
      throw new Error(message);
    },
  });
  return { pass, nominatimCalls };
}

const kaanapali = await providerPassForAnchor({
  dest: 'Kaanapali Maui',
  anchor: 'Kaanapali Maui',
  target: 'taco spots',
});
assert.ok(kaanapali.nominatimCalls >= 1, 'Kaanapali anchor must geocode, not reuse island center');
assert.ok(Math.abs(kaanapali.pass.searchCenter.lat - 20.9212) < 0.05);
assert.ok(Math.abs(kaanapali.pass.searchCenter.lng - (-156.6926)) < 0.05);
assert.ok(
  !kaanapali.pass.providerLog.some((row) => row.provider === 'nominatim' && row.reason === 'trip_destination_center'),
  'sub-area search must not reuse stored island trip_destination_center',
);

const kihei = await providerPassForAnchor({
  dest: 'Kihei',
  anchor: 'Kihei',
  target: 'farmers market',
  category: 'market',
});
assert.ok(kihei.nominatimCalls >= 1, 'Kihei anchor must geocode on Maui trip');
assert.ok(Math.abs(kihei.pass.searchCenter.lat - 20.763395) < 0.05);
assert.ok(Math.abs(kihei.pass.searchCenter.lng - (-156.4463997)) < 0.05);

let mauiOnlyNominatim = 0;
const mauiOnly = await runPlaceProviderPass({
  fetchImpl: async (url) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      mauiOnlyNominatim += 1;
      throw new Error('should use stored Maui center without nominatim');
    }
    if (href.includes(OVERPASS_HOST)) return { ok: true, json: async () => ({ elements: [] }) };
    if (href.includes('brave.com')) return { ok: true, json: async () => ({ results: [] }) };
    if (href.includes('openrouter')) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 4 } } }) };
    }
    throw new Error(href);
  },
  env,
  dest: 'Maui',
  tripDestinationLabel: 'Maui',
  tripDestinationCenter: STORED_MAUI_CENTER,
  placeQueries: [{
    category: 'restaurant',
    q: 'dinner in Maui',
    limit: 5,
    place: true,
    targetKind: 'category',
    target: 'dinner',
  }],
  osmCategoryFilter: ['restaurant'],
  searchAnchor: { text: 'Maui', source: 'destination' },
  relevanceContext: { target: 'dinner', area: 'Maui' },
  tripId: 'trip-maui-only',
  priorPlaces: [],
  selectPriorPlaces: (rows) => rows,
  priorRowsFromInput: (rows) => rows,
  queryOsm: async () => [],
  queryBrave: async () => [],
  mergePlaces: () => [],
  attachRelevance: async (rows) => ({ places: rows, rejections: [] }),
  readJson: async () => ({}),
  fail: (message) => {
    throw new Error(message);
  },
});
assert.equal(mauiOnlyNominatim, 0);
assert.ok(mauiOnly.providerLog.some((row) => row.reason === 'trip_destination_center'));
assert.ok(Math.abs(mauiOnly.searchCenter.lat - STORED_MAUI_CENTER.lat) < 0.0001);

const rejectedPass = await runPlaceProviderPass({
  fetchImpl: nominatimFetch({ kihei: KIHEI_LODGING_GEOCODE }),
  env,
  dest: 'Kihei',
  tripDestinationLabel: 'Maui',
  tripDestinationCenter: STORED_MAUI_CENTER,
  placeQueries: [{
    category: 'market',
    q: 'farmers market near Kihei',
    limit: 5,
    place: true,
    targetKind: 'category',
    target: 'farmers market',
  }],
  osmCategoryFilter: ['market'],
  searchAnchor: { text: 'Kihei', source: 'named_anchor' },
  relevanceContext: { target: 'farmers market', area: 'Kihei' },
  tripId: 'trip-reject-all',
  priorPlaces: [],
  selectPriorPlaces: (rows) => rows,
  priorRowsFromInput: (rows) => rows,
  queryOsm: async () => [{
    source: 'osm',
    title: 'Kihei Farmers Market',
    category: 'market',
    lat: 20.764,
    lng: -156.446,
    address: 'Kihei, HI',
    url: '',
    externalId: 'osm-kihei',
  }],
  queryBrave: async () => [{
    source: 'brave',
    title: 'Kihei Sunday Market',
    category: 'market',
    lat: 20.765,
    lng: -156.447,
    address: 'Kihei, HI',
    url: '',
    externalId: 'brave-kihei',
  }],
  mergePlaces: (groups) => groups.flat(),
  attachRelevance: async () => ({
    places: [],
    rejections: [{
      title: 'Upcountry Farmer\'s Market',
      address: 'Makawao, HI',
      source: 'brave',
      score: 2.1,
      reason: 'relevance_below_minimum_2.10',
    }],
  }),
  readJson: async () => ({}),
  fail: (message) => {
    throw new Error(message);
  },
});
assert.equal(rejectedPass.status, 'no_results');
assert.equal(rejectedPass.reason, 'relevance_rejected_all');
assert.ok(Array.isArray(rejectedPass.relevanceRejections) && rejectedPass.relevanceRejections.length > 0);

console.log('test_place_search_maui_stored_center_anchor: ok');
