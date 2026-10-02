#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attachIntakeItineraryFromReply } from '../routes/vacation-itinerary.mjs';
import {
  braveAddress,
  braveCategoryName,
  braveLocalPlaceResult,
  bravePlaceSearchRows,
  bravePoint,
  braveProviderCategories,
  braveTitle,
} from '../src/vacation/brave-place-query.mjs';
import { queriesFromPlaceClassification } from '../src/vacation/place-search-query-plan.mjs';
import { placeSearchProvidersAllEmpty } from '../src/vacation/place-search-provider-pass.mjs';
import { overpassQuery, osmPlaceQualifiesForSave, placesFromOsmPayload } from '../src/vacation/place-search-osm.mjs';
import { osmAppCategoryFromTags, osmProviderCategoryNameFromTags } from '../src/vacation/place-search-osm-tag-map.mjs';
import { intakeThingsForPersistence } from '../src/vacation/chat-place-search.mjs';
import { buildIntakeLodgingOutcome } from '../src/vacation/intake-lodging-turn-outcome.mjs';
import { placeToTripThing, searchPlaces } from '../src/vacation/place-search.mjs';
import { runCustomerChatPlaceSearch } from '../src/vacation/chat-place-search.mjs';
import { intakeLodgingLookupQuery } from '../src/vacation/intake-lodging-lookup.mjs';
import { urlIsNominatim } from './intake-lodging-test-hosts.mjs';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/intake-lodging-brave/', import.meta.url));
const KIHEI_CENTER = { lat: 20.763395, lng: -156.4463997 };
const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');

function loadFixture(name) {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, 'utf8'));
}

function bravePlacesFromFixture(fixture) {
  const rows = [];
  const braveRows = bravePlaceSearchRows(fixture, 'local');
  for (let providerRank = 0; providerRank < braveRows.length; providerRank += 1) {
    const result = braveRows[providerRank];
    if (!braveLocalPlaceResult(result)) continue;
    const point = bravePoint(result);
    const title = braveTitle(result?.title || result?.name);
    const address = braveAddress(result);
    if (!title) continue;
    rows.push({
      source: 'brave',
      title,
      category: 'hotel',
      lat: point.lat,
      lng: point.lng,
      address,
      url: String(result?.url || ''),
      externalId: String(result?.id || result?.url || ''),
      categoryName: braveCategoryName(result),
      providerCategories: braveProviderCategories(result),
      providerRank,
      sourceRecord: result,
    });
  }
  return rows;
}

function mockCreationDb(tripId) {
  const tripThings = [];
  const turns = new Map([['turn-creation', { liveTranscript: { turnIndex: 1 } }]]);
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (sql.includes('from trip_things') && sql.includes('count')) return [{ n: tripThings.length }];
    if (sql.includes('from trip_things') && sql.includes('order by')) {
      return tripThings.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        description: row.description || '',
        metadata: row.metadata || {},
        location: row.location || {},
      }));
    }
    if (sql.includes('delete from trip_things')) return [];
    if (sql.includes('insert into trip_things')) {
      const viaInsertTripThing = sql.includes('source_request_id');
      const category = viaInsertTripThing ? values[2] : values[1];
      const title = viaInsertTripThing ? values[4] : values[2];
      const locationRaw = viaInsertTripThing ? values[10] : '{}';
      const location = typeof locationRaw === 'string' ? JSON.parse(locationRaw) : (locationRaw || {});
      const metaRaw = viaInsertTripThing ? values[13] : values.find((v) => v && typeof v === 'object' && v.source);
      const metadata = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw || {});
      const row = {
        id: `thing-${tripThings.length + 1}`,
        trip_id: tripId,
        category,
        title,
        location,
        metadata,
      };
      tripThings.push(row);
      return [{ id: row.id }];
    }
    if (sql.includes('from transcript_turns') && sql.includes('payload')) {
      return [{ payload: turns.get(values[0]) || {} }];
    }
    if (sql.includes('update transcript_turns') && sql.includes('payload')) {
      const id = values[values.length - 1];
      turns.set(id, values.find((v) => v && typeof v === 'object' && v.liveTranscript) || {});
      return [];
    }
    if (sql.includes('from trips')) return [{ destination: 'Kihei', metadata: {} }];
    if (sql.includes('update trips')) return [];
    return [];
  };
  return { db, tripThings, turns };
}

const kiheiPlaces = bravePlacesFromFixture(loadFixture('kihei-live-h2.json'));
const creationSentence = 'We booked Kihei Kai Nani in Kihei Nov 19–26 2026.';
const creationThings = [{ name: 'Kihei Kai Nani', kind: 'hotel', who: '', when: '' }];
let creationQuery = '';

const { db: creationDb, tripThings: creationThingsRows, turns: creationTurns } = mockCreationDb('trip-creation');
creationThingsRows.push({
  id: 'thing-activity',
  trip_id: 'trip-creation',
  category: 'activity',
  title: 'Beach day',
  location: {},
  metadata: { source: 'chat_extraction' },
});

await attachIntakeItineraryFromReply(
  creationDb,
  'trip-creation',
  creationSentence,
  {
    customerTurnId: 'turn-creation',
    extractedDestination: 'Kihei',
    extractedTitle: 'Kihei Nov 19–26 2026',
    wantedThings: creationThings,
    env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key' },
    searchPlacesImpl: async ({ propertyName, areaHint }) => {
      creationQuery = intakeLodgingLookupQuery(propertyName, areaHint);
      return {
        places: kiheiPlaces,
        center: KIHEI_CENTER,
        providers: [{ provider: 'brave', status: 'ok', resultCount: kiheiPlaces.length, query: creationQuery }],
      };
    },
  },
  creationSentence,
  creationThings,
);

assert.equal(creationQuery, 'Kihei Kai Nani, Kihei');
const creationHotels = creationThingsRows.filter((row) => row.category === 'hotel');
assert.equal(creationHotels.length, 1);
assert.ok(Number(creationHotels[0].location?.lat) > 20.7);
const creationPayload = creationTurns.get('turn-creation');
assert.ok(Array.isArray(creationPayload.intakeLodgingLookup));
assert.equal(creationPayload.intakeLodgingLookup[0].status, 'ok');
const creationMeta = creationHotels[0].metadata || {};
const creationRecord = creationMeta.sourceRecord || {};
assert.equal(creationRecord.icon_category, 'lodging');
assert.ok(Array.isArray(creationRecord.categories) || creationMeta.providerCategories?.length);

const farmersPlan = queriesFromPlaceClassification({
  ok: true,
  turnKind: 'place_search',
  target: 'Farmers market',
  category: 'market',
  anchor: 'Kihei',
  anchorIsLodging: false,
}, 'Kihei', '', '', '');
assert.equal(farmersPlan.queries[0].category, 'market');
assert.match(farmersPlan.queries[0].q, /Farmers market/i);
assert.match(farmersPlan.queries[0].q, /Kihei/i);

const overpassMarket = overpassQuery(KIHEI_CENTER, ['market']);
assert.match(overpassMarket, /amenity"="marketplace"/);
assert.match(overpassMarket, /shop"="farm"/);
assert.doesNotMatch(overpassMarket, /supermarket\|grocery/);

let braveFarmersQuery = '';
const farmersFetch = async (url, options = {}) => {
  const href = String(url);
  if (href.includes(NOMINATIM_HOST)) {
    return { ok: true, json: async () => [{ lat: String(KIHEI_CENTER.lat), lon: String(KIHEI_CENTER.lng), display_name: 'Kihei, Maui', address: { town: 'Kihei' } }] };
  }
  if (href.includes(OVERPASS_HOST)) {
    return { ok: true, json: async () => ({ elements: [] }) };
  }
  if (href.includes(BRAVE_HOST)) {
    braveFarmersQuery = new URL(href).searchParams.get('q') || '';
    return { ok: true, json: async () => ({ results: [] }) };
  }
  if (href.includes(OPENROUTER_HOST)) {
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
  }
  throw new Error(href);
};

const farmersSearch = await searchPlaces({
  destination: farmersPlan.destination,
  queries: farmersPlan.queries,
  relevanceTarget: 'Farmers market',
  relevanceArea: farmersPlan.destination,
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' },
  fetchImpl: farmersFetch,
  tripId: 'trip-farmers',
});
assert.equal(farmersSearch.outcomeStatus, 'no_results');
assert.match(braveFarmersQuery, /Farmers market/i);

const chatNoResults = await runCustomerChatPlaceSearch({
  placeSearchTurn: true,
  classification: {
    ok: true,
    turnKind: 'place_search',
    target: 'Farmers market',
    category: 'market',
    anchor: 'Kihei',
    anchorIsLodging: false,
  },
  tripDestination: 'Kihei',
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' },
  fetchImpl: farmersFetch,
});
assert.equal(chatNoResults.status, 'no_results');
assert.equal(chatNoResults.error, null);

await assert.rejects(
  () => searchPlaces({
    destination: farmersPlan.destination,
    queries: farmersPlan.queries,
    relevanceTarget: 'Farmers market',
    relevanceArea: farmersPlan.destination,
    env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' },
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes(NOMINATIM_HOST)) {
        return { ok: true, json: async () => [{ lat: String(KIHEI_CENTER.lat), lon: String(KIHEI_CENTER.lng), display_name: 'Kihei' }] };
      }
      if (href.includes(OVERPASS_HOST)) throw new Error('overpass down');
      if (href.includes(BRAVE_HOST)) return { ok: true, json: async () => ({ results: [] }) };
      if (href.includes(OPENROUTER_HOST)) return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 3.5 } } }) };
      throw new Error(href);
    },
    tripId: 'trip-osm-err',
  }),
  (error) => error.code === 'all_providers_failed',
);

assert.equal(osmPlaceQualifiesForSave({ name: 'Hawaii 31 & 360 Junction (Kālepa Bridge)', highway: 'junction', junction: 'yes' }), false);
assert.equal(osmPlaceQualifiesForSave({ name: 'Snorkeling Entry Point', highway: 'service', access: 'yes' }), false);
assert.equal(osmPlaceQualifiesForSave({ name: 'Kihei Farmers Market', amenity: 'marketplace' }), true);

const osmRows = placesFromOsmPayload({
  elements: [
    { type: 'node', id: 1, lat: 20.76, lon: -156.44, tags: { name: 'Snorkeling Entry Point', highway: 'service' } },
    { type: 'node', id: 2, lat: 20.76, lon: -156.45, tags: { name: 'Kihei Farmers Market', amenity: 'marketplace' } },
  ],
}, KIHEI_CENTER, {
  finite: (v) => (Number.isFinite(Number(v)) ? Number(v) : null),
  metersInsideCategory: () => 100,
  ratingFromRecord: () => ({}),
});
assert.equal(osmRows.length, 1);
assert.match(osmRows[0].title, /Farmers Market/);
assert.equal(osmRows[0].category, 'market');

assert.equal(osmAppCategoryFromTags({ amenity: 'cafe', name: 'Lava Java' }), 'restaurant');
assert.equal(osmProviderCategoryNameFromTags({ amenity: 'cafe' }), 'Cafe');
const cafeRow = placesFromOsmPayload({
  elements: [{ type: 'node', id: 9, lat: 20.76, lon: -156.45, tags: { name: 'Lava Java', amenity: 'cafe' } }],
}, KIHEI_CENTER, {
  finite: (v) => (Number.isFinite(Number(v)) ? Number(v) : null),
  metersInsideCategory: () => 100,
  ratingFromRecord: () => ({}),
});
assert.equal(cafeRow[0].category, 'restaurant');
assert.equal(cafeRow[0].categoryName, 'Cafe');

assert.equal(osmPlaceQualifiesForSave({ name: 'Scenic Overlook', tourism: 'information' }), true);
assert.equal(osmAppCategoryFromTags({ name: 'Scenic Overlook', tourism: 'information' }), '');
const activityOnly = placesFromOsmPayload({
  elements: [
    { type: 'node', id: 10, lat: 20.76, lon: -156.45, tags: { name: 'Scenic Overlook', tourism: 'information' } },
    { type: 'node', id: 11, lat: 20.76, lon: -156.45, tags: { name: 'Black Rock', tourism: 'attraction' } },
  ],
}, KIHEI_CENTER, {
  finite: (v) => (Number.isFinite(Number(v)) ? Number(v) : null),
  metersInsideCategory: () => 100,
  ratingFromRecord: () => ({}),
});
assert.equal(activityOnly.length, 1);
assert.equal(activityOnly[0].title, 'Black Rock');

assert.deepEqual(
  intakeThingsForPersistence(false, { ok: true, things: [] }, false, creationThings),
  creationThings,
  'firstIntake ship uses wantedThings when classifier things empty',
);

const lodgingMissOutcome = buildIntakeLodgingOutcome({
  saved: [],
  misses: [{ propertyName: 'Kihei Kai Nani', query: 'Kihei Kai Nani, Kihei', reason: 'no_results' }],
  lookups: [],
});
assert.equal(lodgingMissOutcome.status, 'miss');
assert.equal(lodgingMissOutcome.misses[0].reason, 'no_results');

const KAANAPALI = { lat: 20.941, lng: -156.694 };
const blackRockFetch = async (url) => {
  const href = String(url);
  if (href.includes(NOMINATIM_HOST)) {
    if (href.includes('Black')) {
      return { ok: true, json: async () => [{ lat: String(KAANAPALI.lat), lon: String(KAANAPALI.lng), display_name: 'Black Rock, Kaanapali' }] };
    }
    return { ok: true, json: async () => [{ lat: String(KIHEI_CENTER.lat), lon: String(KIHEI_CENTER.lng), display_name: 'Kihei, Maui' }] };
  }
  if (href.includes(BRAVE_HOST)) {
    return {
      ok: true,
      json: async () => ({
        results: [{
          id: 'black-rock',
          title: 'Black Rock',
          lat: KAANAPALI.lat,
          lng: KAANAPALI.lng,
          address: { street: 'Kaanapali Pkwy' },
          icon_category: 'attraction',
        }],
      }),
    };
  }
  if (href.includes(OVERPASS_HOST)) return { ok: true, json: async () => ({ elements: [] }) };
  if (href.includes(OPENROUTER_HOST)) {
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 4 } } }) };
  }
  throw new Error(href);
};

const anchorSearch = await searchPlaces({
  destination: 'Kihei',
  queries: [{
    category: 'restaurant',
    q: 'cafe near Kihei',
    limit: 5,
    place: true,
    target: 'cafe',
  }],
  relevanceTarget: 'cafe',
  relevanceArea: 'Kihei',
  searchAnchor: { text: 'Kihei', source: 'named_anchor' },
  env: { OPENROUTER_API_KEY: 'test', BRAVE_SEARCH_API_KEY: 'brave-key', DATABASE_URL: '' },
  fetchImpl: blackRockFetch,
  tripId: 'trip-anchor',
});
assert.equal(anchorSearch.places.length, 0);
assert.equal(anchorSearch.outcomeStatus, 'no_results');
assert.ok(Number(anchorSearch.anchorRadiusRejected) >= 1, 'Black Rock outside Kihei anchor radius is dropped');

const braveLodgingThing = placeToTripThing({
  source: 'brave',
  title: 'Kihei Kai Nani Condo',
  category: 'hotel',
  lat: 20.7175,
  lng: -156.4447,
  address: '2495 S Kihei Rd',
  externalId: 'brave-kihei',
  sourceRecord: {
    id: 'loc-test',
    title: 'Kihei Kai Nani Condo',
    icon_category: 'lodging',
    categories: ['lodging', 'real_estate'],
  },
  providerCategories: ['lodging', 'real_estate'],
});
assert.equal(braveLodgingThing.metadata.sourceRecord.icon_category, 'lodging');
assert.ok(braveLodgingThing.metadata.sourceRecord.categories.includes('lodging'));

assert.equal(placeSearchProvidersAllEmpty([
  { provider: 'nominatim', status: 'ok', resultCount: 1 },
  { provider: 'prior_db', status: 'empty', reason: 'no_results', resultCount: 0 },
  { provider: 'osm', status: 'empty', reason: 'no_results', resultCount: 0 },
  { provider: 'brave', status: 'empty', reason: 'no_results', resultCount: 0 },
]), true);

console.log('test_sct_a78799b_search_fill: ok');
