#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import handler from '../routes/vacation-itinerary.mjs';
import { acceptEulaPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import { ensureVacationEulaSession, eulaSessionIdForOnboarding, vacationEulaStatus } from '../src/vacation/onboarding.mjs';
import { useVacationAppDatabase } from '../routes/vacation-itinerary.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import {
  BRAVE_DUMMY,
  BRAVE_HOST,
  classifierPayloadForTurn,
  NOMINATIM_HOST,
  OPENROUTER_DUMMY,
  OPENROUTER_HOST,
  OVERPASS_HOST,
  ROUTER_MODEL,
  TAVILY_DUMMY,
  TAVILY_HOST,
} from './fixtures/place-intent-brave-fallback-fixtures.mjs';

async function runAnyProviderOkRouteTests() {
  const storeDir = await mkdtemp(path.join(tmpdir(), 'place-any-provider-ok-'));
  const saved = {};
  for (const key of [
    'BRAVE_SEARCH_API_KEY',
    'TAVILI_API_KEY',
    'OPENROUTER_API_KEY',
    'TIMESYNCHER_EULA_VERSION',
    'TIMESYNCHER_ONBOARDING_STORE',
    'TIMESYNCHER_SITE_BASE_URL',
    'DATABASE_URL',
    'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS',
    'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS',
    'TIMESYNCHER_SINGLE_NAME',
    'TIMESYNCHER_UNLIMITED_NAME',
  ]) {
    saved[key] = process.env[key];
  }

  Object.assign(process.env, {
    BRAVE_SEARCH_API_KEY: BRAVE_DUMMY,
    TAVILI_API_KEY: TAVILY_DUMMY,
    OPENROUTER_API_KEY: OPENROUTER_DUMMY,
    TIMESYNCHER_EULA_VERSION: 'test-eula-any-provider-ok',
    TIMESYNCHER_ONBOARDING_STORE: storeDir,
    TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
    TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
    TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
    TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
    TIMESYNCHER_SINGLE_NAME: 'Single vacation',
    TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
    DATABASE_URL: 'postgresql://any-provider-ok-route@127.0.0.1/any_provider_ok',
  });

  const sessionToken = 'session-any-provider-ok';
  const eulaStore = {};

  const state = {
    customerId: '11111111-2222-4333-8444-555555555555',
    tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    entitlement: {
      plan: 'single',
      status: 'active',
      metadata: { product: 'timesyncher_vacation_single' },
    },
    session: {
      id: '44444444-5555-4666-8777-888888888888',
      token: sessionToken,
      customer_id: '11111111-2222-4333-8444-555555555555',
      trip_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      status: 'active',
      first_name: 'Ada',
      last_name: 'Test',
      display_name: 'Ada Test',
      email: 'ada@example.com',
      metadata: {},
    },
    trip: {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      title: 'Maui week',
      destination: 'Kaanapali Maui',
      start_date: '2026-10-10',
      end_date: '2026-10-17',
      status: 'onboarding',
      metadata: {},
    },
    seededLodging: true,
    lodgingCoords: true,
    nominatimMode: 'fail',
    osmMode: 'fail',
    braveMode: 'triple',
    classifierMode: 'ok',
    relevanceMode: 'accept',
    tripThings: [],
    turnPayloads: [],
    fetchCalls: [],
    lastResponse: null,
  };

  function sqlText(strings) {
    return strings.join(' ').replace(/\s+/g, ' ').trim();
  }

  function parseMetadataValue(values) {
    return values.find((value) => typeof value === 'string' && value.includes('sourceRef'))
      || values.find((value) => value && typeof value === 'object' && value.sourceRef);
  }

  function db(strings, ...values) {
    const text = sqlText(strings);
    if (/create table if not exists eula_store_objects/i.test(text)) return [];
    if (/insert into eula_store_objects/i.test(text)) {
      const key = values.find((v) => typeof v === 'string' && v.includes('timesyncher-eula'));
      const doc = values.find((v) => v && typeof v === 'object' && !Array.isArray(v));
      if (key) eulaStore[key] = doc;
      return [];
    }
    if (/select document from eula_store_objects/i.test(text)) {
      const key = values[0];
      return eulaStore[key] ? [{ document: eulaStore[key] }] : [];
    }
    if (/from entitlements e/i.test(text) && /e\.customer_id = t\.customer_id/i.test(text)) {
      return [{ plan: state.entitlement.plan, status: state.entitlement.status, metadata: state.entitlement.metadata }];
    }
    if (/insert into customers/i.test(text)) return [{ id: state.customerId }];
    if (/insert into trips/i.test(text)) return [{ id: state.tripId }];
    if (/insert into onboarding_sessions/i.test(text)) {
      state.session = {
        ...state.session,
        token: values.find((value) => typeof value === 'string' && value.length > 8) || sessionToken,
      };
      return [state.session];
    }
    if (/from onboarding_sessions/i.test(text) && /token/i.test(text)) {
      return [{
        ...state.session,
        display_name: 'Ada Test',
        first_name: 'Ada',
        last_name: 'Test',
        email: 'ada@example.com',
      }];
    }
    if (/from trips/i.test(text) && /customer_id/i.test(text)) {
      return [{
        id: state.trip.id,
        title: state.trip.title,
        destination: state.trip.destination,
        start_date: state.trip.start_date,
        end_date: state.trip.end_date,
        status: state.trip.status,
        metadata: state.trip.metadata,
        current: true,
      }];
    }
    if (/insert into vacation_requests/i.test(text)) {
      return [{ id: 'req-any-provider-ok', received_at: new Date(), queued_at: new Date() }];
    }
    if (/insert into transcript_turns/i.test(text) && /returning id/i.test(text)) {
      return [{ id: 'turn-any-provider-ok' }];
    }
    if (/insert into worker_jobs/i.test(text)) return [{ id: 'job-any-provider-ok' }];
    if (/insert into trip_things/i.test(text)) {
      const source = values.find((value) => value === 'brave' || value === 'osm') || values.at(-1);
      const metaRaw = parseMetadataValue(values);
      const metadata = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw || {});
      state.tripThings.push({ source, metadata, id: `trip-thing-${state.tripThings.length + 1}` });
      return [{ id: state.tripThings.at(-1).id }];
    }
    if (/update transcript_turns/i.test(text) && /set payload/i.test(text)) {
      const payload = values.find((value) => value && typeof value === 'object' && value.liveTranscript);
      if (payload) state.turnPayloads.push(payload);
      return [];
    }
    if (/from trip_things/i.test(text) && /category = 'hotel'/i.test(text)) {
      return [{
        title: 'Ka La Resort',
        category: 'hotel',
        description: 'Kaanapali, Maui',
        location: { lat: 20.92, lng: -156.69, address: 'Kaanapali, Maui' },
      }];
    }
    if (/from trip_things/i.test(text)) return [];
    if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) return [{ n: 0, started_at: new Date() }];
    if (/select 1/i.test(text) && /transcript_turns/i.test(text)) return [{ ok: 1 }];
    if (/from transcript_turns/i.test(text) && /order by/i.test(text)) return [];
    if (/insert into vacation_request_events/i.test(text)) return [];
    if (/update worker_jobs/i.test(text)) return [];
    if (/update trips/i.test(text)) return [];
    if (/update onboarding_sessions/i.test(text)) return [];
    if (/from vacation_collaborators/i.test(text)) return [];
    if (/not exists/i.test(text) && /transcript_turns/i.test(text)) return [];
    if (/select metadata from trips/i.test(text)) return [{ metadata: {} }];
    return [];
  }

  useVacationDatabase(db);
  useVacationAppDatabase(db);

  const store = createPersistentStoreFromEnv(process.env);
  await ensureVacationEulaSession(state.session, { env: process.env });
  const eulaStatus = await vacationEulaStatus(state.session, process.env);
  if (!eulaStatus.ok) {
    await acceptEulaPersistent(store, eulaSessionIdForOnboarding(state.session), {
      acceptedByName: 'Ada Test',
      checkboxConfirmed: true,
    });
  }

  const onboarding = { token: sessionToken };
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    state.fetchCalls.push(href);
    if (href.includes(NOMINATIM_HOST)) {
      if (state.nominatimMode === 'fail') {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'fail' };
      }
      return { ok: true, json: async () => [{ lat: '20.92', lon: '-156.69', display_name: 'Kaanapali, Maui' }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      if (state.osmMode === 'fail') {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'overpass fail' };
      }
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href.includes(BRAVE_HOST) && href.includes('local')) {
      assert.equal(options.headers['X-Subscription-Token'], BRAVE_DUMMY);
      if (state.braveMode === 'fail') {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'fail' };
      }
      if (state.braveMode === 'empty') {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      if (state.braveMode === 'triple') {
        return {
          ok: true,
          json: async () => ({
            results: [
              { id: 'brave-taco-1', title: 'Kaanapali Taco Cart', latitude: 20.921, longitude: -156.691, url: 'https://example.com/taco-1' },
              { id: 'brave-taco-2', title: 'Maui Fish Taco', latitude: 20.922, longitude: -156.692, url: 'https://example.com/taco-2' },
              { id: 'brave-taco-3', title: 'Sunset Taco Shack', latitude: 20.923, longitude: -156.693, url: 'https://example.com/taco-3' },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes(TAVILY_HOST)) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const questions = raw?.questions || raw?.input?.questions || {};
      if (questions.relevance) {
        if (state.relevanceMode === 'reject') {
          return { ok: true, json: async () => ({ answers: { relevance: { choice: 1 } } }) };
        }
        return { ok: true, json: async () => ({ answers: { relevance: { choice: 5 } } }) };
      }
      if (questions.trip_intake) {
        return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.1 } } }) };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
        }),
      };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const user = raw.messages?.find((row) => row.role === 'user')?.content || '';
      if (String(raw.messages?.[0]?.content || '').includes('turnKind')) {
        const payload = classifierPayloadForTurn(user, state);
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) };
      }
      if (String(user).includes('score')) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 0.95 }) } }] }) };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Here are nearby taco spots from search.' } }] }) };
    }
    throw new Error(`unexpected fetch ${href}`);
  };

  async function postTurn(text) {
    state.tripThings = [];
    state.turnPayloads = [];
    state.fetchCalls = [];
    const req = {
      method: 'POST',
      url: `/api/vacation-itinerary?app=1&session=${encodeURIComponent(onboarding.token)}`,
      headers: { host: 'vacation-staging.timesyncher.com', 'content-type': 'application/json' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ text }));
      },
    };
    let status = 0;
    let body = null;
    const res = {
      setHeader() {},
      end(chunk) {
        body = JSON.parse(String(chunk || '{}'));
      },
    };
    Object.defineProperty(res, 'statusCode', {
      get() { return status; },
      set(value) { status = value; },
    });
    await handler(req, res);
    state.lastResponse = { status, body };
    return state.lastResponse;
  }

  try {
    state.nominatimMode = 'fail';
    state.osmMode = 'fail';
    state.braveMode = 'triple';
    const braveOk = await postTurn('best tacos near our hotel');
    assert.equal(braveOk.status, 201, JSON.stringify(braveOk.body));
    assert.equal(state.tripThings.length, 3);
    assert.ok(state.tripThings.every((row) => row.source === 'brave'));
    assert.deepEqual(
      state.tripThings.map((row) => row.metadata?.sourceRef?.id).sort(),
      ['brave-taco-1', 'brave-taco-2', 'brave-taco-3'].sort(),
    );
    const okPayload = state.turnPayloads.at(-1);
    assert.equal(okPayload.placeSearch?.status, 'ok');
    const nominatimRow = okPayload.placeSearch.providers.find((row) => row.provider === 'nominatim');
    assert.ok(nominatimRow && (nominatimRow.status === 'error' || nominatimRow.status === 'skipped'));
    const osmRow = okPayload.placeSearch.providers.find((row) => row.provider === 'osm');
    assert.equal(osmRow?.status, 'error');
    const braveRow = okPayload.placeSearch.providers.find((row) => row.provider === 'brave');
    assert.equal(braveRow?.status, 'ok');
    assert.equal(Number(braveRow?.resultCount), 3);

    state.relevanceMode = 'reject';
    state.braveMode = 'triple';
    state.nominatimMode = 'fail';
    state.osmMode = 'fail';
    const relevanceRejected = await postTurn('best tacos near our hotel');
    assert.equal(relevanceRejected.status, 502, JSON.stringify(relevanceRejected.body));
    assert.equal(relevanceRejected.body.ok, false);
    assert.equal(relevanceRejected.body.status, 'place_search_no_relevant_results');
    assert.equal(state.tripThings.length, 0);
    const relevancePayload = state.turnPayloads.at(-1);
    assert.equal(relevancePayload.placeSearch?.status, 'failed');
    assert.equal(relevancePayload.placeSearch?.reason, 'relevance_rejected_all');
    const braveRejected = relevancePayload.placeSearch.providers.find((row) => row.provider === 'brave');
    assert.equal(braveRejected?.status, 'ok');
    assert.equal(Number(braveRejected?.relevanceRejected), 3);

    state.relevanceMode = 'accept';
    state.braveMode = 'empty';
    state.nominatimMode = 'fail';
    state.osmMode = 'fail';
    const osmFailBraveEmpty = await postTurn('best tacos near our hotel');
    assert.equal(osmFailBraveEmpty.status, 201, JSON.stringify(osmFailBraveEmpty.body));
    assert.equal(osmFailBraveEmpty.body.ok, true);
    const partialPayload = state.turnPayloads.at(-1);
    assert.equal(partialPayload.placeSearch?.status, 'no_results');
    assert.ok(partialPayload.placeSearch.providers.some((row) => row.provider === 'osm' && row.status === 'error'));
    assert.ok(partialPayload.placeSearch.providers.some((row) => row.provider === 'brave' && row.status === 'empty'));
    assert.ok(Array.isArray(partialPayload.placeSearch.providerErrors) && partialPayload.placeSearch.providerErrors.some((row) => row.provider === 'osm'));

    state.braveMode = 'fail';
    const liveProvidersFail = await postTurn('best tacos near our hotel');
    assert.equal(liveProvidersFail.status, 201, JSON.stringify(liveProvidersFail.body));
    assert.equal(liveProvidersFail.body.ok, true);
    const liveFailPayload = state.turnPayloads.at(-1);
    assert.equal(liveFailPayload.placeSearch?.status, 'no_results');
    assert.ok(liveFailPayload.placeSearch.providers.some((row) => row.provider === 'osm' && row.status === 'error'));
    assert.ok(liveFailPayload.placeSearch.providers.some((row) => row.provider === 'brave' && row.status === 'error'));
    assert.ok(Array.isArray(liveFailPayload.placeSearch.providerErrors) && liveFailPayload.placeSearch.providerErrors.length >= 2);

    state.lodgingCoords = false;
    state.seededLodging = false;
    state.braveMode = 'fail';
    state.osmMode = 'fail';
    state.nominatimMode = 'fail';
    const allFail = await postTurn('best tacos near Kaanapali');
    assert.equal(allFail.status, 502);
    assert.equal(allFail.body.ok, false);
    assert.match(String(allFail.body.error || allFail.body.status || ''), /place_search_failed|Place search failed/i);
    const failPayload = state.turnPayloads.at(-1);
    assert.equal(failPayload.placeSearch?.status, 'failed');

    return { ok: true };
  } finally {
    globalThis.fetch = originalFetch;
    useVacationDatabase(null);
    useVacationAppDatabase(null);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(storeDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 }).catch((error) => {
      if (error && !['ENOENT', 'ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
    });
  }
}

const result = await runAnyProviderOkRouteTests();
console.log(JSON.stringify({
  ok: true,
  checked: 'place-search-any-provider-ok-route',
  tests: [
    'nominatim_osm_fail_brave_three_results_201',
    'relevance_rejects_all_brave_results_loud_fail',
    'osm_fail_brave_empty_no_results_with_provider_errors',
    'osm_and_brave_error_prior_empty_no_results',
    'only_brave_runs_and_errors_502',
  ],
  result,
}));
