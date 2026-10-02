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
  TAVILY_HOST,
  TAVILY_DUMMY,
} from './fixtures/place-intent-brave-fallback-fixtures.mjs';

async function runPlaceIntentRouteTests() {
  const storeDir = await mkdtemp(path.join(tmpdir(), 'place-intent-brave-fallback-'));
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
    TIMESYNCHER_EULA_VERSION: 'test-eula-place-intent',
    TIMESYNCHER_ONBOARDING_STORE: storeDir,
    TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
    TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
    TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
    TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
    TIMESYNCHER_SINGLE_NAME: 'Single vacation',
    TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
    DATABASE_URL: 'postgresql://place-intent-route-test@127.0.0.1/place_intent_route',
  });

  const sessionToken = 'session-place-intent-test';
  const eulaStore = {};
  function lodgingRow() {
    const base = {
      title: 'Ka La Resort',
      category: 'hotel',
      description: 'Kaanapali, Maui',
      location: { address: 'Kaanapali, Maui' },
    };
    if (state.lodgingCoords) {
      base.location = { lat: 20.92, lng: -156.69, address: 'Kaanapali, Maui' };
    }
    return base;
  }

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
    nominatimMode: 'ok',
    braveMode: 'ok',
    classifierMode: 'ok',
    tripThings: [],
    turnPayloads: [],
    fetchCalls: [],
    lastResponse: null,
  };

  function sqlText(strings) {
    return strings.join(' ').replace(/\s+/g, ' ').trim();
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
      return [{ id: 'req-place-intent', received_at: new Date(), queued_at: new Date() }];
    }
    if (/insert into transcript_turns/i.test(text) && /returning id/i.test(text)) {
      return [{ id: 'turn-place-intent' }];
    }
    if (/insert into worker_jobs/i.test(text)) return [{ id: 'job-place-intent' }];
    if (/insert into trip_things/i.test(text)) {
      state.tripThings.push({ source: values.find((value) => value === 'brave') || 'brave' });
      return [{ id: `trip-thing-${state.tripThings.length}` }];
    }
    if (/update transcript_turns/i.test(text) && /set payload/i.test(text)) {
      const payload = values.find((value) => value && typeof value === 'object' && value.liveTranscript);
      if (payload) state.turnPayloads.push(payload);
      return [];
    }
    if (/from trip_things/i.test(text) && /category = 'hotel'/i.test(text)) {
      return state.seededLodging ? [lodgingRow()] : [];
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
      if (state.nominatimMode === 'empty') {
        return { ok: true, json: async () => ([]), text: async () => '[]' };
      }
      return { ok: true, json: async () => [{ lat: '20.92', lon: '-156.69', display_name: 'Kaanapali, Maui' }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href.includes(BRAVE_HOST) && (href.includes('local') || href.includes('/web/search'))) {
      assert.equal(options.headers['X-Subscription-Token'], BRAVE_DUMMY);
      if (state.braveMode === 'fail') {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'fail' };
      }
      if (state.braveMode === 'empty') {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      const params = new URL(href).searchParams;
      return {
        ok: true,
        json: async () => ({
          results: [{
            id: 'brave-kaanapali-taco-1',
            title: 'Kaanapali Taco Cart',
            latitude: 20.921,
            longitude: -156.691,
            url: 'https://example.com/kaanapali-taco',
          }],
        }),
        _q: params.get('q'),
      };
    }
    if (href.includes(TAVILY_HOST)) {
      return {
        ok: true,
        json: async () => ({
          results: [{
            title: 'Local events this weekend',
            url: 'https://example.com/events',
            content: 'A few community events are scheduled.',
          }],
        }),
      };
    }
    if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const questions = raw?.questions || raw?.input?.questions || {};
      if (questions.relevance) {
        return { ok: true, json: async () => ({ answers: { relevance: { choice: 5 } } }) };
      }
      if (questions.trip_intake) {
        if (state.classifierMode === 'fail') {
          return { ok: false, status: 503, json: async () => ({ error: { message: 'classifier down' } }) };
        }
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
        if (!payload) {
          return { ok: false, status: 503, json: async () => ({ error: { message: 'classifier down' } }) };
        }
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) };
      }
      if (String(user).includes('score')) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 0.95 }) } }] }) };
      }
      if (/Starter facts/i.test(String(raw.messages?.[1]?.content || raw.messages?.[0]?.content || ''))) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Here are a few nearby options to consider.' } }] }) };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: false }) } }] }) };
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
    state.seededLodging = true;
    state.lodgingCoords = true;
    state.nominatimMode = 'ok';
    state.braveMode = 'ok';
    const bestTacos = await postTurn('best tacos near our hotel');
    assert.notEqual(bestTacos.status, 502, JSON.stringify(bestTacos.body));
    const braveCall = state.fetchCalls.find((url) => url.includes(BRAVE_HOST) && url.includes('local'));
    assert.ok(braveCall, 'Brave local search should run for best tacos near our hotel');
    const braveQ = new URL(braveCall).searchParams.get('q') || '';
    assert.match(braveQ, /tacos near Kaanapali, Maui/);
    assert.doesNotMatch(braveQ, /our hotel/i);
    const bestPayload = state.turnPayloads.at(-1);
    const bestBrave = bestPayload.placeSearch.providers.find((row) => row.provider === 'brave');
    assert.equal(bestBrave.endpoint, 'local');
    assert.equal(bestBrave.query, braveQ);
    assert.equal(bestPayload.placeSearch?.status, 'ok');
    assert.equal(Array.isArray(bestPayload.placeSearch?.providers), true);
    assert.ok(bestPayload.placeSearch.providers.some((row) => row.provider === 'brave' && row.status === 'ok'));

    state.lodgingCoords = false;
    state.nominatimMode = 'fail';
    state.braveMode = 'ok';
    const findNearHotel = await postTurn('Find family-friendly taco spots near our hotel in Kaanapali');
    assert.equal(findNearHotel.status, 502);
    assert.equal(state.fetchCalls.some((url) => url.includes(BRAVE_HOST) && url.includes('/web/search')), true);
    const findPayload = state.turnPayloads.at(-1);
    assert.equal(findPayload.placeSearch?.status, 'failed');
    const findBrave = findPayload.placeSearch.providers.find((row) => row.provider === 'brave');
    assert.equal(findBrave.endpoint, 'web');
    assert.match(findBrave.query, /tacos near Kaanapali, Maui/);
    assert.equal(findBrave.status, 'empty');
    const nominatimRow = findPayload.placeSearch.providers.find((row) => row.provider === 'nominatim');
    assert.ok(nominatimRow && (nominatimRow.status === 'error' || nominatimRow.status === 'skipped' || nominatimRow.status === 'empty'));

    state.seededLodging = false;
    state.nominatimMode = 'empty';
    state.braveMode = 'ok';
    const recommend = await postTurn('recommend taco spots near Kaanapali Maui');
    assert.equal(recommend.status, 201);
    assert.equal(state.fetchCalls.some((url) => url.includes(BRAVE_HOST) && url.includes('/web/search')), true);
    const recommendPayload = state.turnPayloads.at(-1);
    assert.equal(recommendPayload.placeSearch?.status, 'no_results');
    const recommendBrave = recommendPayload.placeSearch.providers.find((row) => row.provider === 'brave');
    assert.equal(recommendBrave.endpoint, 'web');
    assert.match(recommendBrave.query, /tacos near Kaanapali Maui/);
    assert.equal(recommendBrave.status, 'empty');

    state.seededLodging = false;
    state.nominatimMode = 'empty';
    state.braveMode = 'empty';
    const allFail = await postTurn('recommend taco spots near Kaanapali Maui');
    assert.equal(allFail.status, 201);
    assert.equal(allFail.body.ok, true);
    const failPayload = state.turnPayloads.at(-1);
    assert.equal(failPayload.placeSearch?.status, 'no_results');
    assert.ok(failPayload.placeSearch.providers.some((row) => row.provider === 'brave' && (row.status === 'empty' || row.status === 'error')));
    assert.ok(failPayload.placeSearch.providers.some((row) => row.provider === 'osm'));
    assert.ok(failPayload.placeSearch.providers.some((row) => row.provider === 'prior_db'));

    state.classifierMode = 'ok';
    state.braveMode = 'ok';
    const weather = await postTurn('What events are happening in Kaanapali this weekend?');
    assert.notEqual(weather.status, 502, JSON.stringify(weather.body));
    assert.equal(state.fetchCalls.some((url) => url.includes(TAVILY_HOST)), true);
    assert.equal(state.fetchCalls.some((url) => url.includes(BRAVE_HOST) && url.includes('local')), false);
    const weatherPayload = state.turnPayloads.at(-1);
    assert.equal(weatherPayload.webSearch?.status, 'ok');
    assert.equal(weatherPayload.turnClassifier?.turnKind, 'web_research');

    state.classifierMode = 'ok';
    const landing = await postTurn('we land in Maui at 3pm');
    assert.notEqual(landing.status, 502, JSON.stringify(landing.body));
    assert.equal(state.fetchCalls.some((url) => url.includes(BRAVE_HOST) && url.includes('local')), false);
    assert.equal(state.fetchCalls.some((url) => url.includes(TAVILY_HOST)), false);
    const landingPayload = state.turnPayloads.at(-1);
    assert.equal(landingPayload.placeSearch, undefined);
    assert.equal(landingPayload.turnClassifier?.turnKind, 'other');

    state.classifierMode = 'fail';
    const braveCallsBeforeClassifierFail = state.fetchCalls.filter((url) => url.includes(BRAVE_HOST) && url.includes('local')).length;
    const classifierFail = await postTurn('best tacos near our hotel');
    assert.equal(classifierFail.status, 502);
    assert.equal(classifierFail.body.ok, false);
    assert.equal(classifierFail.body.status, 'turn_classifier_failed');
    assert.match(String(classifierFail.body.error || ''), /classifier down/i);
    assert.equal(
      state.fetchCalls.filter((url) => url.includes(BRAVE_HOST) && url.includes('local')).length,
      braveCallsBeforeClassifierFail,
    );
    const classifierFailPayload = state.turnPayloads.at(-1);
    assert.equal(classifierFailPayload.turnClassifier?.turnKind, null);
    assert.equal(classifierFailPayload.placeSearch?.turnKind, null);
    assert.equal(classifierFailPayload.placeSearch?.error, 'turn_classifier_failed');
    assert.match(String(classifierFailPayload.placeSearch?.reason || ''), /classifier down/i);
    assert.equal(classifierFailPayload.webSearch?.error, 'turn_classifier_failed');
    assert.equal(classifierFailPayload.webSearch?.turnKind, null);

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

const result = await runPlaceIntentRouteTests();
console.log(JSON.stringify({
  ok: true,
  checked: 'place-intent-brave-fallback-route',
  tests: [
    'best_tacos_near_our_hotel_brave_lodging_anchor',
    'find_near_hotel_nominatim_fail_brave_web_not_places',
    'recommend_near_kaanapali_no_coords_brave_web_not_places',
    'all_providers_fail_502_with_provider_telemetry',
    'events_question_uses_tavily_not_brave',
    'maui_landing_no_in_turn_search',
    'classifier_failure_loud_fail_no_provider_fetch',
  ],
  result,
}));
