#!/usr/bin/env node
/**
 * Staging check 6b rejections (Maui island center): overlooks/museums must not enter OSM merge for taco restaurant search.
 */
import assert from 'node:assert/strict';
import { searchPlaces } from '../src/vacation/place-search.mjs';

const STAGING_6B_REJECT_TITLES = [
  'Baldwin Home Museum',
  'Makahiku Overlook',
  'Leleiwi Overlook',
  'Aliʻi Kula Lavender',
  'Mahana Ridge Trailhead',
  'Kalahaku Overlook',
  'Scenic View',
  "Hanzawa's Variety Store",
  'Nakalele Blowhole',
  'Kahanu Garden',
];

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');

let overpassBody = '';
const env = { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' };

const search = await searchPlaces({
  destination: 'Maui',
  queries: [{ category: 'restaurant', q: 'tacos near Maui', limit: 5, place: true, target: 'tacos' }],
  relevanceTarget: 'tacos',
  relevanceArea: 'Maui',
  searchAnchor: { text: 'Maui', source: 'destination' },
  env,
  fetchImpl: async (url, options = {}) => {
    const href = String(url);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ lat: '20.7984', lon: '-156.3319', display_name: 'Maui, Hawaii', address: { state: 'Hawaii', country_code: 'us' } }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      overpassBody = String(options.body || '');
      const elements = [
        ...STAGING_6B_REJECT_TITLES.map((name, index) => ({
          type: 'node',
          id: 7000 + index,
          lat: 20.8 + index * 0.001,
          lon: -156.33,
          tags: { name, tourism: 'viewpoint' },
        })),
        {
          type: 'node',
          id: 7999,
          lat: 20.81,
          lon: -156.33,
          tags: { name: 'El Taco Borracho', amenity: 'restaurant' },
        },
      ];
      return { ok: true, json: async () => ({ elements }) };
    }
    if (href.includes(BRAVE_HOST)) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const name = String(raw.state?.name || '');
      const score = /taco borracho/i.test(name) ? 3.9 : 0.5;
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});

assert.match(overpassBody, /amenity/);
assert.doesNotMatch(overpassBody, /tourism/);
const titles = search.places.map((row) => row.title);
assert.ok(titles.some((title) => /taco borracho/i.test(title)));
for (const rejectTitle of STAGING_6B_REJECT_TITLES) {
  assert.equal(titles.includes(rejectTitle), false, rejectTitle);
}

console.log('test_place_search_osm_restaurant_scope: ok');
