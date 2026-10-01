#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { insertTripThing } from '../src/vacation/trip-things.mjs';
import {
  isCustomerPlaceSearchTurn,
  runCustomerChatPlaceSearch,
} from '../src/vacation/chat-place-search.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import { sourcedPlaceRule } from './vacation-app-reply-rules.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const rulesSource = fs.readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
const liveSource = fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(rulesSource, /THAT_ID/);
assert.doesNotMatch(liveSource, /THAT_ID/);
assert.match(sourcedPlaceRule(), /Results/);
assert.match(routeSource, /applyChatPlaceSearchForVacationTurn/);
assert.match(routeSource, /placeResults/);

const tacoTurn = 'Find kid-friendly taco spots within walking distance of Pike Place';
assert.equal(isCustomerPlaceSearchTurn(tacoTurn), true);
assert.equal(isCustomerPlaceSearchTurn('Plan a week in Seattle for our family'), false);

const mockPlaces = [
  {
    source: 'brave',
    title: 'El Camión',
    category: 'restaurant',
    lat: 47.609,
    lng: -122.342,
    address: 'Seattle, WA',
    url: 'https://example.com/el-camion',
    externalId: 'brave-el-camion-1',
  },
  {
    source: 'osm',
    title: 'Pike Place Market',
    category: 'activity',
    lat: 47.609,
    lng: -122.341,
    address: 'Seattle, WA',
    url: 'https://www.openstreetmap.org/node/123',
    externalId: 'node/123',
  },
];

let searchCalled = false;
const ok = await runCustomerChatPlaceSearch({
  customerTurn: tacoTurn,
  tripDestination: 'Seattle',
  env: { OPENROUTER_API_KEY: 'test', brave: 'brave-key' },
  searchImpl: async (options) => {
    searchCalled = true;
    assert.equal(options.destination, 'Pike Place');
    assert.equal(options.queries[0].category, 'restaurant');
    return { places: mockPlaces, notes: [], destination: options.destination };
  },
});
assert.equal(searchCalled, true);
assert.equal(ok.status, 'ok');
assert.deepEqual(ok.placeResults.map((row) => row.sourceRef.id), ['brave-el-camion-1', 'node/123']);
assert.equal(ok.things.every((thing) => thing.metadata?.sourceRef?.id), true);

const inserts = [];
const db = async (strings, ...values) => {
  const sql = String(strings[0] || '');
  if (sql.includes('insert into trip_things')) {
    inserts.push(values);
  }
  return [];
};
for (const thing of ok.things) {
  await insertTripThing(db, { tripId: 'trip-chat-1', requestId: 'req-chat-1', thing });
}
assert.equal(inserts.length, ok.things.length);
assert.equal(inserts[0][4], 'El Camión');

const empty = await runCustomerChatPlaceSearch({
  customerTurn: 'Search for a seafood restaurant with a water view for a splurge dinner Saturday',
  tripDestination: 'Seattle',
  searchImpl: async () => ({ places: [], notes: [] }),
});
assert.equal(empty.status, 'failed');
assert.match(empty.error, /no results/i);
assert.deepEqual(empty.placeResults, []);

const broken = await runCustomerChatPlaceSearch({
  customerTurn: 'Find independent coffee shops near Pike Place that open by 7am',
  tripDestination: 'Seattle',
  searchImpl: async () => {
    throw new Error('Brave Place Search failed: HTTP 503');
  },
});
assert.equal(broken.status, 'failed');
assert.match(broken.error, /Brave Place Search failed/);

const thing = placeToTripThing(mockPlaces[0]);
assert.equal(thing.source, 'brave');
assert.equal(thing.metadata.sourceRef.source, 'brave');

console.log(JSON.stringify({ ok: true, checked: 'chat-place-search' }));
