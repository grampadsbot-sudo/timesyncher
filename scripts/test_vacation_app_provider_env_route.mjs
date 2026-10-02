#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import handler from '../routes/vacation-itinerary.mjs';
import { acceptEulaPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import { ensureVacationEulaSession, eulaSessionIdForOnboarding } from '../src/vacation/onboarding.mjs';
import { useVacationAppDatabase } from '../routes/vacation-itinerary.mjs';

const BRAVE_DUMMY = 'route-test-brave-key-aa11';
const TAVILY_DUMMY = 'route-test-tavily-key-bb22';
const OPENROUTER_DUMMY = 'route-test-openrouter-cc33';

const storeDir = await mkdtemp(path.join(tmpdir(), 'provider-env-route-'));
const saved = {};
for (const key of ['BRAVE_SEARCH_API_KEY', 'TAVILI_API_KEY', 'OPENROUTER_API_KEY', 'TIMESYNCHER_EULA_VERSION', 'TIMESYNCHER_ONBOARDING_STORE', 'TIMESYNCHER_SITE_BASE_URL']) {
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
});

const sessionToken = 'session-provider-env-test';

const state = {
  customerId: '11111111-2222-4333-8444-555555555555',
  tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
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
    title: 'Seattle week',
    destination: 'Seattle',
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
  if (/insert into customers/i.test(text)) {
    return [{ id: state.customerId }];
  }
  if (/insert into trips/i.test(text)) {
    state.trip = {
      id: state.tripId,
      customer_id: values[0],
      title: values[1],
      destination: 'Seattle',
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
    return [];
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

useVacationAppDatabase(db);

const store = createPersistentStoreFromEnv(process.env);
await ensureVacationEulaSession(state.session, { env: process.env });
await acceptEulaPersistent(store, eulaSessionIdForOnboarding(state.session), {
  acceptedByName: 'Ada Test',
  checkboxConfirmed: true,
});

const onboarding = { token: sessionToken };

const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const TAVILY_HOST = ['api', 'tavily', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  state.fetchCalls.push(href);
  if (href.includes(NOMINATIM_HOST)) {
    return { ok: true, json: async () => [{ lat: '47.6097', lon: '-122.3331', display_name: 'Seattle, WA' }] };
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
          title: 'October weather in Seattle',
          url: 'https://example.com/seattle-weather',
          content: 'Cool and rainy weeks are common.',
        }],
      }),
    };
  }
  if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
    return { ok: true, json: async () => ({ answers: { relevance: { choice: 5 } } }) };
  }
  if (href.includes(OPENROUTER_HOST)) {
    const raw = options.body ? JSON.parse(String(options.body)) : {};
    const user = raw.messages?.find((row) => row.role === 'user')?.content || '';
    if (String(user).includes('score')) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 0.95 }) } }] }) };
    }
    if (/tags from the allowed list/i.test(String(raw.messages?.[0]?.content || ''))) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tags: ['activities_experiences'], ask: false }) } }] }) };
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
  const place = await postTurn('Find kid-friendly taco spots within walking distance of Pike Place');
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
  assert.deepEqual(placePayload.placeSearch.providers, ['brave']);
  assert.equal(placePayload.placeSearch.results[0].provider, 'brave');
  assert.equal(placePayload.placeSearch.results[0].providerId, 'brave-taco-route-1');

  const web = await postTurn("What's the weather usually like in Seattle in October?");
  assert.equal(state.fetchCalls.some((url) => url.includes(TAVILY_HOST)), true);
  assert.equal(state.fetchCalls.some((url) => url.includes(BRAVE_HOST) && url.includes('local')), false);
  assert.equal(state.tripThings.length, 1);
  assert.equal(state.tripThings[0].source, 'tavily');
  const webPayload = state.turnPayloads.at(-1);
  assert.equal(webPayload.webSearch.status, 'ok');
  assert.equal(webPayload.webSearch.results[0].provider, 'tavily');

  delete process.env.BRAVE_SEARCH_API_KEY;
  const missing = await postTurn('Find kid-friendly taco spots within walking distance of Pike Place');
  assert.equal(state.fetchCalls.length, 0);
  assert.equal(missing.body.ok, false);
  assert.match(String(missing.body.error || ''), /BRAVE_SEARCH_API_KEY/);
  process.env.BRAVE_SEARCH_API_KEY = BRAVE_DUMMY;

  console.log(JSON.stringify({
    ok: true,
    checked: 'vacation-app-provider-env-route',
    tests: [
      'place_query_brave_header',
      'trip_things_provider_metadata',
      'placeSearch_telemetry',
      'non_place_tavily_in_turn',
      'missing_brave_no_fetch',
    ],
  }));
} finally {
  globalThis.fetch = originalFetch;
  useVacationAppDatabase(null);
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(storeDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 }).catch((error) => {
    if (error && !['ENOENT', 'ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
  });
}
