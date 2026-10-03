#!/usr/bin/env node
import assert from 'node:assert/strict';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import { finalizeNamedPlaceSearchResults } from '../src/vacation/place-search-named-select.mjs';
import {
  KIHEI_LODGING_GEOCODE,
  MAUI_D2_GEOCODE,
  PAIA_AREA_GEOCODE,
} from './fixtures/place-search-maui-d2-geocode.mjs';

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };

const PAIA_COMPETING_BRAVE = [
  {
    id: 'loc-paia-restaurant',
    title: 'Paia Fish Market Restaurant',
    latitude: 20.915,
    longitude: -156.381,
    categories: ['restaurant'],
    postal_address: { displayAddress: '300 Baldwin Ave, Paia, HI 96779' },
  },
  {
    id: 'loc-paia-south',
    title: 'Paia Fish Market South Side',
    latitude: 20.74,
    longitude: -156.455,
    categories: ['restaurant'],
    postal_address: { displayAddress: '1913 S Kihei Rd, Kihei, HI 96753' },
  },
  {
    id: 'loc-mamas',
    title: "Mama's Fish House",
    latitude: 20.936,
    longitude: -156.367,
    categories: ['restaurant'],
    postal_address: { displayAddress: '799 Poho Pl, Paia, HI 96779' },
  },
];

const paiaAnchorCenter = {
  lat: Number(PAIA_AREA_GEOCODE.lat),
  lng: Number(PAIA_AREA_GEOCODE.lon),
};

function nominatimStub() {
  return async (url) => {
    const href = String(url);
    if (/Paia/i.test(href)) {
      return { ok: true, json: async () => [PAIA_AREA_GEOCODE] };
    }
    if (/Kihei/i.test(href)) {
      return { ok: true, json: async () => [KIHEI_LODGING_GEOCODE] };
    }
    return { ok: true, json: async () => [MAUI_D2_GEOCODE] };
  };
}

async function relevanceFetch(url, options = {}) {
  const href = String(url);
  if (href.includes(OPENROUTER_HOST)) {
    const body = JSON.parse(String(options.body || '{}'));
    const name = String(body?.state?.name || '');
    const indexMeanByName = {
      'Paia Fish Market Restaurant': 3.05,
      'Paia Fish Market South Side': 3.08,
      "Mama's Fish House": 1.1,
    };
    const indexMean = indexMeanByName[name] ?? 2.5;
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: indexMean } } }) };
  }
  if (href.includes(NOMINATIM_HOST)) return nominatimStub()(url);
  if (href.includes(OVERPASS_HOST)) {
    return { ok: true, json: async () => ({ elements: [] }) };
  }
  if (href.includes(BRAVE_HOST)) {
    return { ok: true, json: async () => ({ results: PAIA_COMPETING_BRAVE }) };
  }
  throw new Error(`unexpected ${href}`);
}

const search = await searchPlaces({
  destination: 'Maui',
  queries: [{
    q: 'Paia Fish Market, Maui',
    target: 'Paia Fish Market',
    category: 'restaurant',
    targetKind: 'named_place',
  }],
  relevanceTarget: 'Paia Fish Market',
  relevanceArea: 'Paia',
  searchAnchor: { text: 'Kihei', source: 'lodging' },
  env,
  fetchImpl: relevanceFetch,
});

assert.equal(search.places.length, 1);
assert.equal(search.places[0].title, 'Paia Fish Market Restaurant');
assert.ok(!search.places.some((row) => /Mama's Fish House/i.test(row.title)));
assert.ok(!search.places.some((row) => /South Side/i.test(row.title)));
assert.equal(placeToTripThing(search.places[0]).title, 'Paia Fish Market Restaurant');

const anchorPick = finalizeNamedPlaceSearchResults([
  {
    title: 'Paia Fish Market Restaurant',
    jevScore: 4.05,
    lat: 20.915,
    lng: -156.381,
    source: 'brave',
  },
  {
    title: 'Paia Fish Market South Side',
    jevScore: 4.08,
    lat: 20.74,
    lng: -156.455,
    source: 'brave',
  },
  {
    title: "Mama's Fish House",
    jevScore: 2.1,
    lat: 20.936,
    lng: -156.367,
    source: 'brave',
  },
], 'named_place', { anchorCenter: paiaAnchorCenter });
assert.equal(anchorPick.ambiguous, false);
assert.equal(anchorPick.places[0].title, 'Paia Fish Market Restaurant');

const stillAmbiguous = finalizeNamedPlaceSearchResults([
  {
    title: 'Paia Fish Market Restaurant',
    jevScore: 4.0,
    lat: 20.915,
    lng: -156.381,
    source: 'brave',
  },
  {
    title: 'Paia Fish Market South Side',
    jevScore: 4.02,
    lat: 20.915,
    lng: -156.381,
    source: 'brave',
  },
], 'named_place', { anchorCenter: paiaAnchorCenter });
assert.equal(stillAmbiguous.ambiguous, true);
assert.equal(stillAmbiguous.places.length, 0);

console.log('test_place_search_named_place_competing: ok');
