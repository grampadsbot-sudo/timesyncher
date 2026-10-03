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
import { installNoopNominatimStore, resetNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

const BRAVE_DUMMY = 'route-test-brave-key-aa11';
const TAVILY_DUMMY = 'route-test-tavily-key-bb22';
const OPENROUTER_DUMMY = 'route-test-openrouter-cc33';

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const TAVILY_HOST = ['api', 'tavily', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');

async function runProviderEnvRouteTest(blobMode) {
  const storeDir = await mkdtemp(path.join(tmpdir(), `provider-env-route-${blobMode ? 'blob' : 'local'}-`));
  const saved = {};
  for (const key of [
    'BRAVE_SEARCH_API_KEY',
    'TAVILI_API_KEY',
    'OPENROUTER_API_KEY',
    'TIMESYNCHER_EULA_VERSION',
    'TIMESYNCHER_ONBOARDING_STORE',
    'TIMESYNCHER_SITE_BASE_URL',
    'DATABASE_URL',
    'BLOB_READ_WRITE_TOKEN',
    'VERCEL_BLOB_STORE_ID',
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
    TIMESYNCHER_EULA_VERSION: 'test-eula-provider-env',
    TIMESYNCHER_ONBOARDING_STORE: storeDir,
    TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
    TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
    TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
    TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
    TIMESYNCHER_SINGLE_NAME: 'Single vacation',
    TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
    DATABASE_URL: 'postgresql://provider-env-route-test@127.0.0.1/provider_env_route',
  });
  if (blobMode) {
    process.env.BLOB_READ_WRITE_TOKEN = 'route-test-blob-token';
    delete process.env.VERCEL_BLOB_STORE_ID;
  } else {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL_BLOB_STORE_ID;
  }

  const sessionToken = 'session-provider-env-test';
  const eulaStore = {};

  const state = {
    customerId: '11111111-2222-4333-8444-555555555555',
    tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    entitlement: {
      id: 'ent-provider-env',
      customer_id: '11111111-2222-4333-8444-555555555555',
      trip_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
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
      title: 'Harbor week',
      destination: 'Neutral Bay',
      start_date: '2026-10-10',
      end_date: '2026-10-17',
      status: 'onboarding',
      metadata: {},
    },
    tripThings: [],
    turnPayloads: [],
    fetchCalls: [],
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
      return [{
        plan: state.entitlement.plan,
        status: state.entitlement.status,
        metadata: state.entitlement.metadata,
      }];
    }
    if (/insert into customers/i.test(text)) {
      return [{ id: state.customerId }];
    }
    if (/insert into trips/i.test(text)) {
      state.trip = {
        id: state.tripId,
        customer_id: values[0],
        title: values[1],
        destination: 'Neutral Bay',
        start_date: values[2] || '2026-10-10',
        end_date: values[3] || '2026-10-17',
        status: 'onboarding',
        metadata: {},
      };
      return [{ id: state.tripId }];
    }
    if (/insert into onboarding_sessions/i.test(text)) {
      state.session = {
        id: values[0] || 'sess-provider-env',
        token: values.find((value) => typeof value === 'string' && value.length > 8) || 'session-token',
        customer_id: state.customerId,
        trip_id: state.tripId,
        status: 'active',
        metadata: {},
      };
      return [state.session];
    }
    if (/from onboarding_sessions/i.test(text) && /token/i.test(text)) {
      return state.session ? [{
        ...state.session,
        display_name: 'Ada Test',
        first_name: 'Ada',
        last_name: 'Test',
        email: 'ada@example.com',
      }] : [];
    }
    if (/from trips/i.test(text) && /customer_id/i.test(text)) {
      return state.trip ? [{
        id: state.trip.id,
        title: state.trip.title,
        destination: state.trip.destination,
        start_date: state.trip.start_date,
        end_date: state.trip.end_date,
        status: state.trip.status,
        metadata: state.trip.metadata,
        current: true,
      }] : [];
    }
    if (/insert into vacation_requests/i.test(text)) {
      return [{ id: 'req-provider-env', received_at: new Date(), queued_at: new Date() }];
    }
    if (/insert into transcript_turns/i.test(text) && /returning id/i.test(text)) {
      return [{ id: 'turn-provider-env' }];
    }
    if (/insert into worker_jobs/i.test(text)) return [{ id: 'job-provider-env' }];
    if (/insert into trip_things/i.test(text)) {
      const metaValue = values.find((value) => value && typeof value === 'object' && value.sourceRef);
      const metaJson = metaValue ? JSON.stringify(metaValue) : values.find((value) => typeof value === 'string' && value.includes('sourceRef'));
      const source = values.find((value) => value === 'brave' || value === 'tavily')
        || metaValue?.source
        || (metaJson && JSON.parse(metaJson).source);
      state.tripThings.push({ metaJson: metaJson || JSON.stringify(metaValue || {}), source });
      return [{ id: `trip-thing-${state.tripThings.length}` }];
    }
    if (/update transcript_turns/i.test(text) && /set payload/i.test(text)) {
      const payload = values.find((value) => value && typeof value === 'object' && value.liveTranscript);
      if (payload) state.turnPayloads.push(payload);
      return [];
    }
    if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) return [{ n: 0, started_at: new Date() }];
    if (/select 1/i.test(text) && /transcript_turns/i.test(text)) return [{ ok: 1 }];
    if (/from transcript_turns/i.test(text) && /order by/i.test(text)) return [];
    if (/insert into vacation_request_events/i.test(text)) return [];
    if (/update worker_jobs/i.test(text)) return [];
    if (/update trips/i.test(text)) return [];
    if (/update onboarding_sessions/i.test(text)) return [];
    if (/from trip_things/i.test(text)) return [];
    if (/from vacation_collaborators/i.test(text)) return [];
    if (/not exists/i.test(text) && /transcript_turns/i.test(text)) return [];
    if (/select metadata from trips/i.test(text)) return [{ metadata: {} }];
    return [];
  }

  useVacationDatabase(db);
  useVacationAppDatabase(db);
  installNoopNominatimStore();

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
      return { ok: true, json: async () => [{ lat: '47.6097', lon: '-122.3331', display_name: 'Neutral Bay' }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href.includes(BRAVE_HOST) && href.includes('local')) {
      assert.equal(options.headers['X-Subscription-Token'], BRAVE_DUMMY);
      return {
        ok: true,
        json: async () => ({
          results: [{
            id: 'brave-taco-route-1',
            title: 'Route Taco Spot',
            latitude: 47.61,
            longitude: -122.34,
            url: 'https://example.com/taco',
          }],
        }),
      };
    }
    if (href.includes(TAVILY_HOST)) {
      assert.equal(String(options.headers.authorization || options.headers.Authorization), `Bearer ${TAVILY_DUMMY}`);
      return {
        ok: true,
        json: async () => ({
          results: [{
            title: 'October weather in Neutral Bay',
            url: 'https://example.com/weather',
            content: 'Cool and rainy weeks are common.',
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
        return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.1 } } }) };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          answers: {
            model_tier: { score: 0 },
            route_type: { choice: 'general' },
          },
        }),
      };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const user = raw.messages?.find((row) => row.role === 'user')?.content || '';
      if (String(raw.messages?.[0]?.content || '').includes('turnKind')) {
        const turnKind = /weather/i.test(String(user)) ? 'web_research' : 'place_search';
        const body = {
          turnKind,
          target: turnKind === 'place_search' ? 'taco spots' : '',
          category: turnKind === 'place_search' ? 'restaurant' : '',
          targetKind: turnKind === 'place_search' ? 'category' : '',
          anchor: turnKind === 'place_search' ? 'market square' : '',
          anchorIsLodging: false,
          question: turnKind === 'web_research' ? String(user) : '',
          things: [],
          roster: [],
          destination: '',
          hasDates: false,
          title: '',
        };
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }) };
      }
      if (String(user).includes('score')) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 0.95 }) } }] }) };
      }
      if (/tags from the allowed list/i.test(String(raw.messages?.[0]?.content || ''))) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tags: ['activities_experiences'], ask: false }) } }] }) };
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
    return { status, body };
  }

  try {
    const place = await postTurn('Find family-friendly taco spots within walking distance of the market square');
    assert.notEqual(place.status, 502, JSON.stringify(place.body));
    assert.equal(state.fetchCalls.some((url) => url.includes(BRAVE_HOST)), true);
    assert.equal(state.tripThings.length, 1);
    assert.equal(state.tripThings[0].source, 'brave');
    const placeMeta = typeof state.tripThings[0].metaJson === 'string'
      ? JSON.parse(state.tripThings[0].metaJson)
      : state.tripThings[0].metaJson;
    assert.equal(placeMeta.sourceRef.id, 'brave-taco-route-1');
    assert.equal(placeMeta.source, 'brave');
    const placePayload = state.turnPayloads.at(-1);
    assert.equal(placePayload.placeSearch.status, 'ok');
    const braveProvider = placePayload.placeSearch.providers.find((row) => row.provider === 'brave');
    assert.equal(braveProvider?.status, 'ok');
    assert.equal(placePayload.placeSearch.results[0].provider, 'brave');
    assert.equal(placePayload.placeSearch.results[0].providerId, 'brave-taco-route-1');

    const web = await postTurn('What is the weather usually like in Neutral Bay in October?');
    assert.notEqual(web.status, 502, JSON.stringify(web.body));
    assert.equal(state.fetchCalls.some((url) => url.includes(TAVILY_HOST)), true);
    assert.equal(state.fetchCalls.some((url) => url.includes(BRAVE_HOST) && url.includes('local')), false);
    assert.equal(state.tripThings.length, 1);
    assert.equal(state.tripThings[0].source, 'tavily');
    const webPayload = state.turnPayloads.at(-1);
    assert.equal(webPayload.webSearch.status, 'ok');
    assert.equal(webPayload.webSearch.results[0].provider, 'tavily');

    delete process.env.BRAVE_SEARCH_API_KEY;
    const missing = await postTurn('Find family-friendly taco spots within walking distance of the market square');
    assert.equal(state.fetchCalls.some((url) => url.includes(BRAVE_HOST)), false);
    assert.equal(state.fetchCalls.some((url) => url.includes(NOMINATIM_HOST)), false);
    assert.equal(missing.body.ok, false);
    assert.match(String(missing.body.error || ''), /BRAVE_SEARCH_API_KEY/);
    process.env.BRAVE_SEARCH_API_KEY = BRAVE_DUMMY;

    return { blobMode, ok: true };
  } finally {
    globalThis.fetch = originalFetch;
    useVacationDatabase(null);
    useVacationAppDatabase(null);
    resetNominatimStore();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(storeDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 }).catch((error) => {
      if (error && !['ENOENT', 'ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
    });
  }
}

const localResult = await runProviderEnvRouteTest(false);
const blobResult = await runProviderEnvRouteTest(true);
console.log(JSON.stringify({
  ok: true,
  checked: 'vacation-app-provider-env-route',
  modes: [localResult, blobResult],
  tests: [
    'place_query_brave_header',
    'trip_things_provider_metadata',
    'placeSearch_telemetry',
    'non_place_tavily_in_turn',
    'missing_brave_no_fetch',
    'local_and_blob_store_modes',
  ],
}));
