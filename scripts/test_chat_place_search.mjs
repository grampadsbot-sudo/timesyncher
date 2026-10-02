#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { insertTripThing } from '../src/vacation/trip-things.mjs';
import {
  applyChatPlaceSearchForVacationTurn,
  classifyVacationAppCustomerTurn,
  intakeExtractedThings,
  runCustomerChatPlaceSearch,
} from '../src/vacation/chat-place-search.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import { sourcedPlaceRule } from './vacation-app-reply-rules.mjs';
import { inTurnPlaceReplyViolation } from '../src/vacation/chat-place-search.mjs';
import { placeResultExtra } from '../src/vacation/provider-result-context.mjs';

const rulesSource = fs.readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
const liveSource = fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const routeSource = fs.readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const chatPlaceSearchSource = fs.readFileSync(new URL('../src/vacation/chat-place-search.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(rulesSource, /THAT_ID/);
assert.doesNotMatch(liveSource, /THAT_ID/);
assert.match(sourcedPlaceRule(), /Results/);
assert.match(routeSource, /classifyVacationAppCustomerTurn/);
assert.match(routeSource, /intakeExtractedThings\(placeSearchTurn/);
assert.match(routeSource, /runVacationAppInTurnSearch/);
assert.match(routeSource, /workerJobId:\s*jobRows\[0\]\.id/);
assert.match(chatPlaceSearchSource, /placeSearchHandledInTurn:\s*true/);
assert.match(routeSource, /placeSearchTurn,/);

const SCT_QUERIES = [
  {
    name: 'kid_friendly_taco_pike_place',
    turn: 'Find kid-friendly taco spots within walking distance of Pike Place',
    mockId: 'brave-el-camion-1',
    provider: 'brave',
    category: 'restaurant',
    destination: 'Pike Place',
  },
  {
    name: 'seafood_water_view_splurge',
    turn: 'Search for a seafood restaurant with a water view for a splurge dinner in Seattle on Saturday',
    mockId: 'brave-anthonys-pier-66',
    provider: 'brave',
    category: 'restaurant',
    destination: 'Seattle',
  },
  {
    name: 'coffee_pike_place_7am',
    turn: 'Find independent coffee shops near Pike Place that open by 7am',
    mockId: 'osm-node-coffee-42',
    provider: 'osm',
    category: 'restaurant',
    destination: 'Pike Place',
  },
  {
    name: 'trains_ferries_seattle_kid',
    turn: 'Search for things to do with trains or ferries for a 7 year old in Seattle',
    mockId: 'osm-way-monorail-7',
    provider: 'osm',
    category: 'activity',
    destination: 'Seattle',
  },
  {
    name: 'toy_bookstore_downtown',
    turn: 'Find a toy store or bookstore near downtown Seattle',
    mockId: 'brave-toy-store-9',
    provider: 'brave',
    category: 'store',
    destination: 'downtown Seattle',
  },
];

function mockPlace({ mockId, provider, category, title }) {
  return {
    source: provider,
    title,
    category,
    lat: 47.609,
    lng: -122.342,
    address: 'Seattle, WA',
    url: `https://example.com/${mockId}`,
    externalId: mockId,
  };
}

function placeClassification(query) {
  return {
    ok: true,
    turnKind: 'place_search',
    target: query.turn.slice(0, 80),
    category: query.category,
    anchor: query.destination,
    anchorIsLodging: false,
    routerModel: 'router-test-model',
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    title: '',
    error: null,
  };
}

function mockDb() {
  const inserts = [];
  const db = async (strings, ...values) => {
    const sql = String(strings[0] || '');
    if (sql.includes('insert into trip_things')) {
      inserts.push(values);
      return [{ id: `trip-thing-${inserts.length}` }];
    }
    if (sql.includes('update transcript_turns')) return [];
    if (sql.includes('select count(*)::int as n from trip_things')) return [{ n: inserts.length }];
    return [];
  };
  return { db, inserts };
}

for (const query of SCT_QUERIES) {
  const classification = placeClassification(query);
  let providerSearchCalls = 0;
  const result = await runCustomerChatPlaceSearch({
    placeSearchTurn: true,
    classification,
    tripDestination: 'Seattle',
    env: { OPENROUTER_API_KEY: 'test', brave: 'brave-key' },
    searchImpl: async (options) => {
      providerSearchCalls += 1;
      assert.equal(options.queries[0].category, query.category, query.name);
      assert.ok(options.destination, query.name);
      return {
        places: [mockPlace({ ...query, title: `Mock ${query.name}` })],
        notes: [],
        destination: options.destination,
      };
    },
  });
  assert.equal(providerSearchCalls, 1, `${query.name}: provider search must run once`);
  assert.equal(result.status, 'ok', query.name);
  assert.deepEqual(result.placeResults.map((row) => row.sourceRef.id), [query.mockId], query.name);

  const { db, inserts } = mockDb();
  const payload = { wantedThings: [{ name: 'Invented Place', source: 'chat_extraction' }] };
  const customerLive = {};
  const applied = await applyChatPlaceSearchForVacationTurn({
    db,
    tripId: 'trip-sct',
    requestId: 'req-sct',
    classification,
    placeSearchTurn: true,
    tripDestination: 'Seattle',
    payload,
    customerLive,
    turnId: 'turn-sct',
    env: { OPENROUTER_API_KEY: 'test', brave: 'brave-key' },
    publishShare: async () => {},
    searchImpl: async () => ({
      places: [mockPlace({ ...query, title: `Persisted ${query.name}` })],
      notes: [],
    }),
  });
  assert.equal(applied.kind, 'ok', query.name);
  assert.equal(applied.placeSearchTurn, true, query.name);
  assert.deepEqual(payload.wantedThings, [], `${query.name}: chat_extraction wantedThings cleared`);
  assert.equal(inserts.length, 1, `${query.name}: one trip_things insert`);
  const metaJson = inserts[0].find((value) => typeof value === 'string' && value.includes('sourceRef'));
  const thingMeta = JSON.parse(metaJson);
  assert.equal(thingMeta.sourceRef.id, query.mockId, `${query.name}: persisted provider id`);
  assert.equal(thingMeta.source, query.provider, `${query.name}: persisted provider source`);

  assert.equal(applied.placeResults[0]?.sourceRef?.source, 'trip_thing', `${query.name}: in-turn row uses trip_thing id`);
  assert.equal(applied.placeResults[0]?.sourceRef?.id, 'trip-thing-1', `${query.name}: persisted thing id for citation`);
  const modelContext = placeResultExtra(applied.placeResults);
  assert.doesNotMatch(modelContext, /\(id:/, `${query.name}: model Results omit internal ids`);
  assert.doesNotMatch(modelContext, new RegExp(query.mockId), `${query.name}: provider brave/osm id omitted from Results`);
  assert.match(modelContext, /Results:/, `${query.name}: model Results list place names`);
  assert.doesNotMatch(modelContext, /SCM-2023|BL-441|FB-779|THAT_ID|Invented Place/);
}

let classifyCalls = 0;
const blocked = await classifyVacationAppCustomerTurn(
  SCT_QUERIES[0].turn,
  process.env,
  async () => {
    classifyCalls += 1;
    return {
      ok: true,
      turnKind: 'place_search',
      intake: false,
      target: 'taco spots',
      category: 'restaurant',
      anchor: 'Pike Place',
      anchorIsLodging: false,
      things: [{ name: 'El Camión', source: 'chat_extraction' }],
      roster: [],
      destination: '',
      hasDates: false,
      title: '',
      routerModel: 'router-test-model',
      error: null,
    };
  },
);
assert.equal(classifyCalls, 1, 'router classifier must run on every customer turn');
assert.deepEqual(blocked.classification.things, [{ name: 'El Camión', source: 'chat_extraction' }]);
assert.equal(blocked.placeSearchTurn, true);
assert.deepEqual(
  intakeExtractedThings(true, { ok: true, things: [{ name: 'El Camión', source: 'chat_extraction' }] }),
  [],
);

const { db: failDb, inserts: failInserts } = mockDb();
const failPayload = { wantedThings: [{ name: 'Should Not Persist', source: 'chat_extraction' }] };
const failed = await applyChatPlaceSearchForVacationTurn({
  db: failDb,
  tripId: 'trip-fail',
  requestId: 'req-fail',
  classification: placeClassification(SCT_QUERIES[1]),
  placeSearchTurn: true,
  tripDestination: 'Seattle',
  payload: failPayload,
  customerLive: {},
  turnId: 'turn-fail',
  searchImpl: async () => ({ places: [], notes: [] }),
});
assert.equal(failed.kind, 'failed');
assert.equal(failed.placeSearch.status, 'failed');
assert.equal(Array.isArray(failed.placeSearch.providers), true);
assert.equal(failInserts.length, 0);

const errorDb = mockDb();
const errored = await applyChatPlaceSearchForVacationTurn({
  db: errorDb.db,
  tripId: 'trip-err',
  requestId: 'req-err',
  classification: placeClassification(SCT_QUERIES[2]),
  placeSearchTurn: true,
  tripDestination: 'Seattle',
  payload: { wantedThings: [] },
  customerLive: {},
  turnId: 'turn-err',
  searchImpl: async () => {
    throw new Error('Brave Place Search failed: HTTP 503');
  },
});
assert.equal(errored.kind, 'failed');
assert.match(errored.error, /Brave Place Search failed/);
assert.equal(errorDb.inserts.length, 0);

const thing = placeToTripThing(mockPlace(SCT_QUERIES[0]));
assert.equal(thing.metadata.sourceRef.id, SCT_QUERIES[0].mockId);

const inTurnRows = [{
  name: 'Mock El Camión',
  title: 'Mock El Camión',
  sourceRef: { source: 'trip_thing', id: 'trip-thing-cite-1' },
}];
assert.equal(inTurnPlaceReplyViolation('Try Mock El Camión for tacos.', inTurnRows), null);
assert.equal(inTurnPlaceReplyViolation('Glass Lagoon (id:missing) is open late.', inTurnRows)?.invented?.[0], 'Glass Lagoon');
assert.equal(inTurnPlaceReplyViolation('Try lunch at Secret Taco Cove near the hotel.', inTurnRows)?.status, 'unsourced_place');
assert.doesNotMatch(
  placeResultExtra([{ name: 'Brave Taco Cart', sourceRef: { source: 'brave', id: 'brave-ext-1' } }]),
  /\(id:/,
);

console.log(JSON.stringify({
  ok: true,
  checked: 'chat-place-search',
  assertions: [
    'sct_queries_detected',
    'provider_search_called_per_query',
    'mock_ids_match_place_results',
    'trip_things_inserted_with_provider_sourceRef',
    'wantedThings_cleared_no_chat_extraction',
    'placeResultExtra_names_only_no_internal_ids',
    'classifier_runs_on_place_search_turn',
    'empty_provider_place_search_failed_no_inserts',
    'invented_place_name_blocks_in_turn_reply',
    'sourced_place_name_allows_in_turn_reply',
  ],
}));
