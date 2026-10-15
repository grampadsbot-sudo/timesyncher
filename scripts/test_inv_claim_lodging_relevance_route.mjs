#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyVacationAppCustomerTurn, runVacationAppInTurnSearch } from '../src/vacation/chat-place-search.mjs';
import { searchIntakeLodgingPlaces } from '../src/vacation/intake-lodging-search.mjs';
import {
  STAGING_HYATT_INTAKE_EXTRACTION,
  STAGING_HYATT_INTAKE_SENTENCE,
} from './fixtures/trip-intake-hyatt-staging.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');

const queueSource = readFileSync(
  fileURLToPath(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url)),
  'utf8',
);
assert.match(queueSource, /failedInTurnSearchTurn/);
assert.match(queueSource, /placeSearchClientError\(inTurnSearch\.placeSearch/);

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

const routeFlags = await classifyVacationAppCustomerTurn(
  STAGING_HYATT_INTAKE_SENTENCE,
  { OPENROUTER_API_KEY: 'test-key' },
  async () => classification,
);
assert.equal(routeFlags.placeSearchTurn, false, 'trip_intake lodging must not be classified as place_search');
assert.equal(routeFlags.webResearchTurn, false);

let openRouterCalls = 0;
const fetchImpl = async (url) => {
  const href = String(url);
  if (href.includes(OPENROUTER_HOST)) {
    openRouterCalls += 1;
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 0 } } }) };
  }
  throw new Error(`unexpected fetch ${href}`);
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
  placeSearchTurn: routeFlags.placeSearchTurn,
  webResearchTurn: routeFlags.webResearchTurn,
});

assert.equal(inTurn.ok, true);
assert.equal(openRouterCalls, 0, 'trip_intake lodging must skip in-turn place search and Jev relevance');

let placeProviderCalls = 0;
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
  if (href.includes(BRAVE_HOST)) {
    placeProviderCalls += 1;
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
assert.equal(placeProviderCalls, 1);
assert.equal(openRouterCalls, 0);

console.log('test_inv_claim_lodging_relevance_route: ok');
