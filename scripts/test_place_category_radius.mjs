import assert from 'node:assert/strict';

import {
  DEFAULT_CATEGORY_RADIUS_KEY,
  POI_RADIUS_METERS,
  categoryRadiusMeters,
} from '../src/vacation/keepsake-list-minimums.mjs';
import { distanceMeters, searchPlaces, selectPriorPlaces } from '../src/vacation/place-search.mjs';

const CENTER = { lat: 0, lng: 0 };
const EARTH_METERS = 6371000;
const CATEGORIES = Object.keys(POI_RADIUS_METERS);
const OSM_FILTER = {
  grocery: '["shop"~"supermarket|grocery|convenience|greengrocer"]',
  restaurant: '["amenity"~"restaurant|cafe|fast_food"]',
  store: '["shop"]',
  garden: '["leisure"="garden"]',
  activity: '["tourism"~"attraction|museum|gallery|viewpoint"]',
};
const OSM_TAGS = {
  grocery: { shop: 'supermarket' },
  restaurant: { amenity: 'restaurant' },
  store: { shop: 'books' },
  garden: { leisure: 'garden' },
  activity: { tourism: 'museum' },
};

function pointNorth(meters) {
  const deg = (meters / EARTH_METERS) * (180 / Math.PI);
  return { lat: CENTER.lat + deg, lng: CENTER.lng };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

assert.deepEqual(CATEGORIES, ['grocery', 'restaurant', 'store', 'garden', 'activity']);
assert.equal(DEFAULT_CATEGORY_RADIUS_KEY, 'activity');
assert.equal(categoryRadiusMeters('grocery'), 8000);
assert.equal(categoryRadiusMeters('groceries'), 8000);
assert.equal(categoryRadiusMeters('restaurant'), 10000);
assert.equal(categoryRadiusMeters('store'), 10000);
assert.equal(categoryRadiusMeters('garden'), 40000);
assert.equal(categoryRadiusMeters('activity'), 40000);
assert.equal(categoryRadiusMeters('hotel'), POI_RADIUS_METERS[DEFAULT_CATEGORY_RADIUS_KEY]);
assert.equal(categoryRadiusMeters('unknown-kind'), POI_RADIUS_METERS[DEFAULT_CATEGORY_RADIUS_KEY]);

const bands = {};
for (const category of CATEGORIES) {
  const radius = categoryRadiusMeters(category);
  assert.equal(radius, POI_RADIUS_METERS[category]);
  const inside = pointNorth(radius - 50);
  const outside = pointNorth(radius + 50);
  assert.ok(distanceMeters(CENTER, inside) <= radius);
  assert.ok(distanceMeters(CENTER, outside) > radius);
  assert.ok(distanceMeters(CENTER, outside) < radius + 200);
  bands[category] = { radius, inside, outside };
}

const queries = CATEGORIES.map((category) => ({
  category,
  q: category,
  place: true,
  limit: 2,
}));
queries.push({ category: 'hotel', q: 'hotel', place: true, limit: 2 });

const priorRows = [];
const osmElements = [];
let osmId = 1;
for (const category of CATEGORIES) {
  const { inside, outside } = bands[category];
  priorRows.push(
    { id: `prior-in-${category}`, title: `prior-in-${category}`, category, lat: inside.lat, lng: inside.lng },
    { id: `prior-out-${category}`, title: `prior-out-${category}`, category, lat: outside.lat, lng: outside.lng },
  );
  for (const [edge, point] of [['in', inside], ['out', outside]]) {
    osmElements.push({
      type: 'node',
      id: osmId,
      lat: point.lat,
      lon: point.lng,
      tags: { name: `osm-${edge}-${category}`, ...OSM_TAGS[category] },
    });
    osmId += 1;
  }
}
const hotelRadius = categoryRadiusMeters('hotel');
const hotelInside = pointNorth(hotelRadius - 50);
const hotelOutside = pointNorth(hotelRadius + 50);
priorRows.push(
  { id: 'prior-in-hotel', title: 'prior-in-hotel', category: 'hotel', lat: hotelInside.lat, lng: hotelInside.lng },
  { id: 'prior-out-hotel', title: 'prior-out-hotel', category: 'hotel', lat: hotelOutside.lat, lng: hotelOutside.lng },
);

const calls = [];
const hosts = [];
const allowedHosts = new Set([
  'overpass-api.de',
  'api.search.brave.com',
  'openrouter.ai',
]);
const found = await searchPlaces({
  lodgingPoint: CENTER,
  queries,
  env: {
    brave: 'brave-test',
    OPENROUTER_API_KEY: 'openrouter-test',
  },
  priorPlaces: priorRows,
  fetchImpl: async (url, options) => {
    const value = String(url);
    const hostname = new URL(value).hostname;
    hosts.push(hostname);
    if (!allowedHosts.has(hostname)) throw new Error(`unexpected host ${hostname}`);
    calls.push({ url: value, options, hostname });
    if (value.includes('openrouter.ai')) {
      return jsonResponse({ answers: { relevance: { choice: 5 } } });
    }
    if (value.includes('overpass-api.de')) return jsonResponse({ elements: osmElements });
    if (value.includes('api.search.brave.com')) {
      const category = new URL(value).searchParams.get('q');
      const band = category === 'hotel'
        ? { inside: hotelInside, outside: hotelOutside }
        : bands[category];
      return jsonResponse({
        results: [
          { id: `brave-in-${category}`, title: `brave-in-${category}`, coordinates: [band.inside.lat, band.inside.lng] },
          { id: `brave-out-${category}`, title: `brave-out-${category}`, coordinates: [band.outside.lat, band.outside.lng] },
        ],
      });
    }
    throw new Error(`unexpected place search request ${value}`);
  },
});

const brave = calls.filter((call) => call.url.includes('api.search.brave.com'));
const overpass = calls.filter((call) => call.url.includes('overpass-api.de'));
assert.deepEqual([...new Set(hosts)].sort(), ['api.search.brave.com', 'openrouter.ai', 'overpass-api.de']);
assert.equal(brave.length, CATEGORIES.length + 1);
assert.equal(overpass.length, 1);
assert.equal(calls.some((call) => /nominatim|googleapis|places\.google/.test(call.url)), false);

const overpassQuery = decodeURIComponent(String(overpass[0].options.body).replace(/^data=/, ''));
for (const category of CATEGORIES) {
  const radius = String(bands[category].radius);
  const braveCall = brave.find((call) => new URL(call.url).searchParams.get('q') === category);
  assert.equal(new URL(braveCall.url).searchParams.get('radius'), radius);
  const filter = OSM_FILTER[category].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(overpassQuery, new RegExp(`${filter}\\(around:${radius},${CENTER.lat},${CENTER.lng}\\)`));
  for (const source of ['prior', 'osm', 'brave']) {
    assert.equal(found.places.some((place) => place.title === `${source}-in-${category}`), true, `${source}-in-${category}`);
    assert.equal(found.places.some((place) => place.title === `${source}-out-${category}`), false, `${source}-out-${category}`);
  }
}

const hotelBrave = brave.find((call) => new URL(call.url).searchParams.get('q') === 'hotel');
assert.equal(new URL(hotelBrave.url).searchParams.get('radius'), String(hotelRadius));
assert.equal(found.places.some((place) => place.title === 'prior-in-hotel'), true);
assert.equal(found.places.some((place) => place.title === 'prior-out-hotel'), false);
assert.equal(found.places.some((place) => place.title === 'brave-in-hotel'), true);
assert.equal(found.places.some((place) => place.title === 'brave-out-hotel'), false);
assert.equal(overpassQuery.includes('around:20000'), false);
assert.equal(calls.some((call) => /(?:radius=20000|around:20000)/.test(call.url + String(call.options?.body || ''))), false);

const keptPrior = selectPriorPlaces(priorRows, CENTER);
assert.deepEqual(
  keptPrior.map((place) => place.title).sort(),
  [...CATEGORIES.map((category) => `prior-in-${category}`), 'prior-in-hotel'].sort(),
);

console.log('place category radius tests passed');
