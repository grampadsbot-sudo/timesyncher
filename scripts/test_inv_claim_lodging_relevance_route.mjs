#!/usr/bin/env node
/**
 * INV-CLAIM lodging turn (Hyatt gap answer) on the vacation-itinerary POST queue path.
 * Proves it does not enter the Jev POI relevance stage that drives check 6b relevance_judge_failed → 502.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runVacationAppInTurnSearch } from '../src/vacation/chat-place-search.mjs';
import { searchIntakeLodgingPlaces } from '../src/vacation/intake-lodging-search.mjs';
import {
  STAGING_HYATT_INTAKE_EXTRACTION,
  STAGING_HYATT_INTAKE_SENTENCE,
} from './fixtures/trip-intake-hyatt-staging.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const lodgingSearchSource = readFileSync(
  fileURLToPath(new URL('../src/vacation/intake-lodging-search.mjs', import.meta.url)),
  'utf8',
);
assert.doesNotMatch(lodgingSearchSource, /attachPlaceRelevance|jevRelevanceScore|postJevDecisions/);

const queueSource = readFileSync(
  fileURLToPath(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url)),
  'utf8',
);
assert.match(queueSource, /failedInTurnSearchTurn/);
assert.match(queueSource, /placeSearchClientError\(inTurnSearch\.placeSearch/);

const itinerarySource = readFileSync(
  fileURLToPath(new URL('../routes/vacation-itinerary.mjs', import.meta.url)),
  'utf8',
);
assert.match(itinerarySource, /const postStatus = queued\.ok \? \(selected \? 201 : 200\) : 502/);

let openRouterCalls = 0;
const fetchImpl = async (url) => {
  const href = String(url);
  if (href.includes(OPENROUTER_HOST)) {
    openRouterCalls += 1;
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 0 } } }) };
  }
  throw new Error(`unexpected fetch ${href}`);
};

const classification = {
  ok: true,
  intake: true,
  turnKind: STAGING_HYATT_INTAKE_EXTRACTION.turnKind,
  things: STAGING_HYATT_INTAKE_EXTRACTION.things.map((row) => ({
    name: row.name,
    kind: row.kind,
    who: row.who,
    when: row.when,
  })),
  destination: STAGING_HYATT_INTAKE_EXTRACTION.destination,
  roster: [],
};

const payload = {};
const customerLive = {};
const db = async (strings) => {
  const sql = String(strings[0] || '');
  if (sql.includes('update transcript_turns')) return [];
  if (sql.includes('from trips')) return [{ metadata: {} }];
  if (sql.includes('from trip_things')) return [];
  return [];
};

const inTurn = await runVacationAppInTurnSearch({
  db,
  tripId: 'trip-inv-claim-lodging',
  requestId: 'req-inv-claim',
  customerTurn: STAGING_HYATT_INTAKE_SENTENCE,
  tripDestination: 'Maui',
  classification,
  payload,
  customerLive,
  turnId: 'turn-inv-claim',
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl,
  placeSearchTurn: false,
  webResearchTurn: false,
});

assert.equal(inTurn.ok, true);
assert.equal(openRouterCalls, 0, 'trip_intake lodging must skip in-turn place search and Jev relevance');

let braveCalls = 0;
const lodgingFetch = async (url) => {
  const href = String(url);
  if (href.includes('openstreetmap.org')) {
    return {
      ok: true,
      json: async () => [{
        lat: '20.9250419',
        lon: '-156.6899009',
        display_name: 'Kaanapali, Maui',
        address: { city: 'Kaanapali' },
      }],
    };
  }
  if (href.includes('search.brave.com') || href.includes('api.search.brave.com')) {
    braveCalls += 1;
    return { ok: true, json: async () => ({ results: [] }) };
  }
  if (href.includes(OPENROUTER_HOST)) {
    openRouterCalls += 1;
    throw new Error('lodging lookup must not call OpenRouter relevance');
  }
  throw new Error(`unexpected ${href}`);
};

await searchIntakeLodgingPlaces({
  destination: 'Maui',
  areaHint: 'Kaanapali',
  propertyName: 'Hyatt Regency Maui',
  env: { BRAVE_SEARCH_API_KEY: 'test-brave' },
  fetchImpl: lodgingFetch,
});
assert.equal(braveCalls, 1);
assert.equal(openRouterCalls, 0);

console.log('test_inv_claim_lodging_relevance_route: ok');
