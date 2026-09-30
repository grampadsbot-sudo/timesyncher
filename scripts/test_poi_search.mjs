import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  clearPoiCache,
  lowestRentalPrices,
  overpassQuery,
  parseOverpass,
  scoreWebPoisInParallel,
  searchFsqRecords,
  searchPois,
  searchTavily,
  synthesizeFromIds,
  TavilySearchError,
  POI_RADIUS_METERS,
  THIN_POI_COUNT,
} from '../src/vacation/poi-search.mjs';
import { clearWindCache, forecastReadings, lookupWindBackup } from '../src/vacation/wind-backup.mjs';
import { applyThingPresentation, sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';
import { runPublicResearch } from './vacation-public-research-worker.mjs';

const house = { lat: 19.649, lng: -155.994 };

function record(id, name, lat, lng, category) {
  return { id, name, lat, lng, category };
}

assert.equal(POI_RADIUS_METERS.grocery, 8000);
assert.equal(POI_RADIUS_METERS.restaurant, 10000);
assert.equal(POI_RADIUS_METERS.store, 10000);
assert.equal(POI_RADIUS_METERS.garden, 40000);
assert.equal(POI_RADIUS_METERS.activity, 40000);
assert.equal(THIN_POI_COUNT, 3);

const near = searchFsqRecords([
  record('a', 'KTA Super Stores', 19.64, -155.99, 'grocery'),
  record('b', 'Kona', 19.64, -155.99, 'grocery'),
  record('far', 'Far Market', 21.3, -157.8, 'grocery'),
], { origin: house, radiusMeters: 8000, category: 'grocery' });
assert.deepEqual(near.map((poi) => poi.id), ['fsq:a', 'fsq:b']);
assert.match(near[0].url, /^https:\/\//);

const osm = parseOverpass({
  elements: [
    { type: 'node', id: 9, lat: 19.65, lon: -155.99, tags: { name: 'Huggo\'s' } },
    { type: 'node', id: 10, lat: 19.65, lon: -155.99, tags: { name: 'Big Island' } },
    { type: 'way', id: 11, center: { lat: 19.66, lon: -156.0 }, tags: { name: 'Kahaluu Beach' } },
  ],
}, 'restaurant');
assert.deepEqual(osm.map((poi) => poi.id), ['osm:node/9', 'osm:node/10', 'osm:way/11']);
assert.equal(osm[0].url, 'https://www.openstreetmap.org/node/9');
assert.match(overpassQuery({ lat: house.lat, lng: house.lng, radiusMeters: 8000, category: 'grocery' }), /around:8000,19.649,-155.994/);

clearPoiCache();
let fetches = [];
const thick = await searchPois({
  origin: house,
  category: 'restaurant',
  fsqRecords: [1, 2, 3].map((n) => record(`r${n}`, `Table ${n}`, 19.65, -155.99, 'restaurant')),
  fetchImpl: async (url) => {
    fetches.push(url);
    throw new Error(`unexpected fetch ${url}`);
  },
  braveKey: 'brave-test',
});
assert.equal(thick.pois.length, 3);
assert.equal(thick.brave, false);
assert.equal(fetches.length, 0);
const again = await searchPois({
  origin: house,
  category: 'restaurant',
  fsqRecords: [],
  fetchImpl: async (url) => {
    fetches.push(url);
    throw new Error(`cache miss ${url}`);
  },
  braveKey: 'brave-test',
});
assert.equal(again.cache, 'hit');
assert.equal(fetches.length, 0);
assert.deepEqual(again.pois.map((poi) => poi.id), thick.pois.map((poi) => poi.id));

clearPoiCache();
fetches = [];
const osmBacked = await searchPois({
  origin: house,
  category: 'store',
  fsqRecords: [record('only', 'Island Market', 19.65, -155.99, 'store')],
  braveKey: 'brave-test',
  fetchImpl: async (url) => {
    fetches.push(String(url));
    if (String(url).includes('overpass')) {
      return { ok: true, json: async () => ({ elements: [1, 2, 3].map((n) => ({ type: 'node', id: 100 + n, lat: 19.65, lon: -155.99, tags: { name: `Shop ${n}` } })) }) };
    }
    throw new Error(`brave ran with a full OSM set ${url}`);
  },
});
assert.equal(osmBacked.brave, false);
assert.equal(fetches.filter((url) => url.includes('brave')).length, 0);
assert.ok(osmBacked.pois.some((poi) => poi.id === 'osm:node/101'));

clearPoiCache();
fetches = [];
const thin = await searchPois({
  origin: house,
  category: 'activity',
  dateBucket: '2026-04-03',
  fsqRecords: [],
  braveKey: 'brave-test',
  now: 1_000,
  fetchImpl: async (url) => {
    fetches.push(String(url));
    if (String(url).includes('overpass')) return { ok: true, json: async () => ({ elements: [] }) };
    if (String(url).includes('brave')) {
      return { ok: true, json: async () => ({ web: { results: [{ title: 'Puuhonua o Honaunau', url: 'https://www.nps.gov/puho/', lat: 19.42, lng: -155.91 }] } }) };
    }
    throw new Error(`unexpected ${url}`);
  },
});
assert.equal(thin.brave, true);
assert.equal(thin.pois.filter((poi) => poi.source === 'brave').length, 1);
assert.equal(fetches.filter((url) => url.includes('overpass')).length, 1);
const braveCached = await searchPois({
  origin: house,
  category: 'activity',
  dateBucket: '2026-04-03',
  fsqRecords: [],
  braveKey: 'brave-test',
  now: 1_000 + 60_000,
  fetchImpl: async () => {
    throw new Error('short brave cache should not refetch');
  },
});
assert.equal(braveCached.cache, 'hit');
assert.equal(braveCached.pois.some((poi) => poi.source === 'brave'), true);
await searchPois({
  origin: house,
  category: 'activity',
  dateBucket: '2026-04-03',
  fsqRecords: [],
  braveKey: 'brave-test',
  now: 1_000 + (8 * 60 * 60 * 1000) + 1,
  fetchImpl: async (url) => {
    fetches.push(String(url));
    if (String(url).includes('overpass')) throw new Error('database cache should still hold');
    return { ok: true, json: async () => ({ web: { results: [{ title: 'Puuhonua o Honaunau', url: 'https://www.nps.gov/puho/', lat: 19.42, lng: -155.91 }] } }) };
  },
});
assert.equal(fetches.filter((url) => url.includes('brave')).length, 2);
assert.equal(fetches.filter((url) => url.includes('overpass')).length, 1);

let active = 0;
let maxActive = 0;
const mixed = [
  { id: 'fsq:kept', name: 'Island Market', source: 'fsq-os-places', url: 'https://example.com/market', lat: 1, lng: 2 },
  ...[0, 1, 2, 3, 4].map((n) => ({ id: `brave:${n}`, name: `Web ${n}`, source: 'brave', url: `https://example.com/${n}`, lat: 1, lng: 2 })),
];
const scored = await scoreWebPoisInParallel(mixed, async (poi) => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  await new Promise((resolve) => setTimeout(resolve, 20));
  active -= 1;
  return poi.id.endsWith('0') ? 2 : 4;
});
assert.ok(maxActive >= 2);
assert.ok(scored.some((poi) => poi.id === 'fsq:kept' && poi.jevScore === 4));
assert.equal(scored.find((poi) => poi.id === 'brave:0').jevScore, 2);
assert.equal(scored.filter((poi) => poi.source === 'brave').length, 5);
const unscored = await scoreWebPoisInParallel([
  { id: 'fsq:open', name: 'Open Market', source: 'fsq-os-places' },
], async () => 0);
assert.equal(unscored.length, 1);
assert.equal(unscored[0].id, 'fsq:open');
assert.equal(unscored[0].jevScore, 0);

const cited = synthesizeFromIds(['fsq:kept', 'fsq:missing', 'osm:node/1'], [
  { id: 'fsq:kept', name: 'Island Market' },
  { id: 'osm:node/1', name: 'Kona' },
  { id: 'fsq:other', name: 'Huggo\'s' },
]);
assert.deepEqual(cited.map((poi) => poi.id), ['fsq:kept', 'osm:node/1']);

const offers = [
  { brand: 'Alamo', price: 90 },
  { brand: 'Budget', price: 40 },
  { brand: 'Budget', price: 41 },
  { brand: 'Dollar', price: 42 },
  { brand: 'Enterprise', price: 43 },
  { brand: 'Hertz', price: 44 },
  { brand: 'National', price: 45 },
  { brand: 'Thrifty', price: 46 },
  { brand: 'Avis', price: 47 },
  { brand: 'Sixt', price: 48 },
  { brand: 'Fox', price: 49 },
  { brand: 'Payless', price: 80 },
];
assert.equal(lowestRentalPrices(offers).length, 10);
assert.equal(lowestRentalPrices(offers)[0].brand, 'Budget');
assert.equal(lowestRentalPrices(offers).some((offer) => offer.brand === 'Alamo'), false);
assert.equal(lowestRentalPrices(offers, { eliminatedBrands: ['Budget'] }).some((offer) => offer.brand === 'Budget'), false);
assert.equal(lowestRentalPrices(offers, { eliminatedBrands: ['Budget'] })[0].price, 42);
assert.equal(lowestRentalPrices(Array.from({ length: 12 }, (_, index) => ({ brand: 'Budget', price: index + 1 }))).length, 10);

assert.deepEqual(forecastReadings([]), []);
assert.deepEqual(forecastReadings([{ name: 'Kahaluu', windMph: 12 }]), [{ name: 'Kahaluu', windMph: 12 }]);
assert.deepEqual(forecastReadings([{ name: 'Kahaluu', windMph: 22 }, { name: 'House', windMph: 18 }]), [
  { name: 'House', windMph: 18 },
  { name: 'Kahaluu', windMph: 22 },
]);
assert.equal(JSON.stringify(forecastReadings([{ name: 'Kahaluu', windMph: 22 }])).includes('house pool'), false);
const presented = applyThingPresentation(sharedTripFromIntake({
  trip: { id: 'trip-notes', title: 'Vacation', destination: '', start_date: '2026-04-03', end_date: '2026-04-06' },
  things: [{ id: 'swim', title: 'Swim', notes: ['the beach'], source: 'customer' }],
}), { windBackup: 'forecast wind' });
const presentedSwim = presented.places.find((place) => place.name === 'Swim');
assert.equal(presentedSwim.description, '');
assert.match(presentedSwim.notes, /the beach/);
assert.equal(presentedSwim.source, 'customer');
assert.doesNotMatch(JSON.stringify(presentedSwim), /forecast wind/);
assert.doesNotMatch(JSON.stringify(presented), /A swim for/);

clearWindCache();
const nwsUrls = [];
const nws = await lookupWindBackup([{ name: 'Kahaluu Beach', lat: 19.58, lng: -155.96 }], {
  startDate: '2026-04-06',
  endDate: '2026-04-06',
  fetchImpl: async (url) => {
    nwsUrls.push(String(url));
    if (String(url).includes('api.weather.gov/points')) {
      return { ok: true, json: async () => ({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/HFO/1,1/forecast/hourly' } }) };
    }
    if (String(url).includes('forecast/hourly')) {
      return { ok: true, json: async () => ({ properties: { periods: [{ startTime: '2026-04-06T18:00:00Z', windSpeed: '12 mph' }] } }) };
    }
    throw new Error(`open-meteo should wait ${url}`);
  },
});
assert.deepEqual(nws, [{ name: 'Kahaluu Beach', windMph: 12 }]);
assert.equal(nwsUrls.some((url) => url.includes('open-meteo')), false);

clearWindCache();
const meteo = await lookupWindBackup([{ name: 'House', lat: 19.649, lng: -155.994 }], {
  startDate: '2026-04-03',
  fetchImpl: async (url) => {
    if (String(url).includes('weather.gov')) return { ok: false, json: async () => ({}) };
    assert.match(String(url), /open-meteo/);
    return { ok: true, json: async () => ({ hourly: { time: ['2026-04-03T00:00'], wind_speed_10m: [16.09] } }) };
  },
});
assert.deepEqual(meteo, [{ name: 'House', windMph: 10 }]);

clearWindCache();
const missing = await lookupWindBackup([{ name: 'House', lat: 19.649, lng: -155.994 }], {
  startDate: '2026-04-03',
  fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
});
assert.deepEqual(missing, []);
const hung = await lookupWindBackup([{ name: 'House', lat: 19.649, lng: -155.994 }], {
  timeoutMs: 30,
  fetchImpl: () => new Promise(() => {}),
});
assert.deepEqual(hung, []);

const workerText = fs.readFileSync(new URL('./vacation-public-research-worker.mjs', import.meta.url), 'utf8');
const poiText = fs.readFileSync(new URL('../src/vacation/poi-search.mjs', import.meta.url), 'utf8');
const telegramText = fs.readFileSync(new URL('./telegram-vacation-intake-bot.mjs', import.meta.url), 'utf8');
const runnerText = fs.readFileSync(new URL('./travel-source-adapter-runner.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(workerText, /places\.googleapis\.com/);
assert.doesNotMatch(workerText, /live-google-places-new/);
assert.doesNotMatch(workerText, /house-radius-poi/);
assert.doesNotMatch(poiText, /\bGENERIC_NAME\b/);
assert.doesNotMatch(poiText, /\bAIRLINES\b/);
assert.doesNotMatch(poiText, /function flightPlan/);
assert.match(poiText, /export async function searchTavily/);
assert.match(poiText, /jevRelevanceScore/);
assert.match(telegramText, /google\/gemini-2\.5-flash-lite/);
assert.doesNotMatch(telegramText, /gpt-4o-mini/);
assert.match(telegramText, /openrouter\.ai\/api\/v1\/chat\/completions/);
assert.match(runnerText, /async function runWanderlustGoat\(\) \{\n  return \[\];\n\}/);

let tavilyFetched = false;
await assert.rejects(
  () => searchTavily('morning flight', {
    apiKey: '',
    env: {},
    fetchImpl: async () => {
      tavilyFetched = true;
      throw new Error('missing tavily key must not fetch');
    },
  }),
  (error) => error instanceof TavilySearchError && error.code === 'TAVILI_API_KEY_MISSING',
);
assert.equal(tavilyFetched, false);

const researched = await runPublicResearch({
  artifacts: { destination: 'Big Island', house },
  fsqRecords: [record('grill', 'Ulu Ocean Grill', 19.65, -155.99, 'restaurant')],
  fetchImpl: async () => {
    throw new Error('fsqRecords bypass must not fetch');
  },
});
assert.equal(researched.status, 'no_wanted_things');
assert.equal(researched.provider, 'place-search');
assert.deepEqual(researched.things, []);

console.log('poi search ok');
