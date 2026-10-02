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
  TAVILY_DUMMY,
  TAVILY_HOST,
} from './fixtures/place-intent-brave-fallback-fixtures.mjs';
import { resolvedAreaText } from '../src/vacation/place-search-geocode.mjs';
import {
  KAANAPALI_GEOCODE,
  KAANAPALI_OFF_TARGET_BRAVE,
  KAANAPALI_ON_TARGET_BRAVE,
  KAANAPALI_TACO_BRAVE_RESULTS,
  LODGING_LOCALITY,
  STAGING_HOTEL_BRAVE_REJECTIONS,
} from './fixtures/place-relevance-kaanapali-brave.mjs';

async function runPlaceRelevanceTargetAreaTests() {
  const storeDir = await mkdtemp(path.join(tmpdir(), 'place-relevance-target-'));
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
    TIMESYNCHER_EULA_VERSION: 'test-eula-place-relevance',
    TIMESYNCHER_ONBOARDING_STORE: storeDir,
    TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
    TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
    TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
    TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
    TIMESYNCHER_SINGLE_NAME: 'Single vacation',
    TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
    DATABASE_URL: 'postgresql://place-relevance-target@127.0.0.1/place_relevance',
  });

  const sessionToken = 'session-place-relevance-target';
  const eulaStore = {};
  const state = {
    customerId: '11111111-2222-4333-8444-555555555555',
    tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    entitlement: { plan: 'single', status: 'active', metadata: { product: 'timesyncher_vacation_single' } },
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
    nominatimMode: 'ok',
    osmMode: 'empty',
    braveMode: 'kaanapali',
    classifierMode: 'ok',
    relevanceMode: 'targeted',
    relevanceRejectAll: false,
    relevanceJudgeMode: null,
    tripThings: [],
    turnPayloads: [],
    relevanceCalls: [],
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
      return [{ ...state.session, display_name: 'Ada Test', first_name: 'Ada', last_name: 'Test', email: 'ada@example.com' }];
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
      return [{ id: 'req-place-relevance', received_at: new Date(), queued_at: new Date() }];
    }
    if (/insert into transcript_turns/i.test(text) && /returning id/i.test(text)) {
      return [{ id: `turn-${state.turnPayloads.length}` }];
    }
    if (/insert into worker_jobs/i.test(text)) return [{ id: 'job-place-relevance' }];
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
        title: 'Hyatt Regency Maui',
        category: 'hotel',
        description: LODGING_LOCALITY,
        location: {
          lat: 20.92,
          lng: -156.69,
          address: 'Hyatt Regency Maui, Kaanapali, Maui',
          locality: LODGING_LOCALITY,
        },
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

  function relevanceResponse(jevState) {
    if (state.relevanceJudgeMode === 'http_400') {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'criteria must be array' } }),
        text: async () => '{"error":{"message":"criteria must be array"}}',
      };
    }
    if (state.relevanceRejectAll) {
      return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score: 0.2 } } }) };
    }
    const name = String(jevState?.name || '').toLowerCase();
    const offTarget = STAGING_HOTEL_BRAVE_REJECTIONS.some((row) => row.title.toLowerCase() === name);
    const score = offTarget ? 0.5 : 3.8;
    return { ok: true, json: async () => ({ answers: { relevance: { type: 'score', score } } }) };
  }

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    state.fetchCalls.push(href);
    if (href.includes(NOMINATIM_HOST)) {
      if (state.nominatimMode === 'fail') {
        return { ok: false, status: 503, json: async () => ({}), text: async () => 'fail' };
      }
      return { ok: true, json: async () => [KAANAPALI_GEOCODE] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href.includes(BRAVE_HOST) && href.includes('local')) {
      assert.equal(options.headers['X-Subscription-Token'], BRAVE_DUMMY);
      const results = state.braveMode === 'kaanapali'
        ? [...KAANAPALI_TACO_BRAVE_RESULTS, KAANAPALI_OFF_TARGET_BRAVE]
        : [];
      return { ok: true, json: async () => ({ results }) };
    }
    if (href.includes(TAVILY_HOST)) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const questions = raw?.questions || raw?.input?.questions || {};
      if (questions.relevance) {
        const jevState = raw.state || {};
        state.relevanceCalls.push(jevState);
        assert.ok(Array.isArray(questions.relevance.criteria), 'relevance criteria must be a Jev array');
        assert.ok(String(jevState.searchTarget || '').length > 0, 'searchTarget must be passed to relevance judge');
        assert.ok(String(jevState.searchArea || '').length > 0, 'searchArea must be passed to relevance judge');
        return relevanceResponse(jevState);
      }
      if (questions.trip_intake) {
        return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.1 } } }) };
      }
      return { ok: true, json: async () => ({ ok: true, answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } } }) };
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
    state.relevanceCalls = [];
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
    state.braveMode = 'kaanapali';
    state.relevanceRejectAll = false;
    const resolvedArea = resolvedAreaText(KAANAPALI_GEOCODE, 'Kaanapali Maui');
    assert.equal(resolvedArea, 'Kaanapali, Maui County, Hawaii, US');
    const kaanapali = await postTurn('recommend taco spots near Kaanapali Maui');
    assert.equal(kaanapali.status, 201, JSON.stringify(kaanapali.body));
    assert.ok(state.tripThings.length >= 1);
    assert.ok(state.tripThings.every((row) => row.source === 'brave'));
    const savedIds = state.tripThings.map((row) => row.metadata?.sourceRef?.id);
    assert.ok(savedIds.includes(KAANAPALI_ON_TARGET_BRAVE[0].id));
    assert.ok(!savedIds.includes(KAANAPALI_OFF_TARGET_BRAVE.id));
    const kaanapaliPayload = state.turnPayloads.at(-1);
    assert.equal(kaanapaliPayload.placeSearch?.status, 'ok');
    const kaanapaliBrave = kaanapaliPayload.placeSearch.providers.find((row) => row.provider === 'brave');
    assert.equal(kaanapaliBrave.endpoint, 'local');
    assert.match(kaanapaliBrave.query, /tacos/);
    assert.match(kaanapaliBrave.query, new RegExp(resolvedArea.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(kaanapaliBrave.query, /near Kaanapali Maui$/);
    const kaanapaliUrl = state.fetchCalls.find((url) => url.includes(BRAVE_HOST) && url.includes('local'));
    assert.equal(new URL(kaanapaliUrl).searchParams.get('q'), kaanapaliBrave.query);
    const rejections = kaanapaliPayload.placeSearch?.relevanceRejections || [];
    for (const candidate of STAGING_HOTEL_BRAVE_REJECTIONS) {
      const row = rejections.find((item) => item.title === candidate.title);
      assert.ok(row, JSON.stringify(rejections));
      assert.equal(row.address, candidate.address);
    }

    const hotel = await postTurn('best tacos near our hotel');
    assert.equal(hotel.status, 201, JSON.stringify(hotel.body));
    assert.ok(state.tripThings.length >= 1);
    assert.ok(state.tripThings.every((row) => row.source === 'brave'));
    const hotelPayload = state.turnPayloads.at(-1);
    const hotelBrave = hotelPayload.placeSearch.providers.find((row) => row.provider === 'brave');
    assert.equal(hotelBrave.endpoint, 'local');
    assert.match(hotelBrave.query, new RegExp(`tacos near ${LODGING_LOCALITY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.doesNotMatch(hotelBrave.query, /our hotel/i);
    const hotelUrl = state.fetchCalls.find((url) => url.includes(BRAVE_HOST) && url.includes('local'));
    assert.equal(new URL(hotelUrl).searchParams.get('q'), hotelBrave.query);
    const hotelCall = state.relevanceCalls.find((row) => String(row.searchArea || '').includes(LODGING_LOCALITY));
    assert.ok(hotelCall, JSON.stringify(state.relevanceCalls[0]));

    state.relevanceJudgeMode = 'http_400';
    state.relevanceRejectAll = false;
    state.braveMode = 'kaanapali';
    const judgeFail = await postTurn('recommend taco spots near Kaanapali Maui');
    assert.equal(judgeFail.status, 502, JSON.stringify(judgeFail.body));
    assert.equal(judgeFail.body.status, 'relevance_judge_failed');
    assert.equal(state.tripThings.length, 0);
    const judgePayload = state.turnPayloads.at(-1);
    assert.equal(judgePayload.placeSearch?.reason, 'relevance_judge_failed');
    assert.equal(judgePayload.placeSearch?.judgeHttpStatus, 400);
    assert.match(String(judgePayload.placeSearch?.judgeBodySnippet || ''), /criteria/i);

    state.relevanceJudgeMode = null;
    state.relevanceRejectAll = true;
    state.braveMode = 'kaanapali';
    const loudFail = await postTurn('best tacos near our hotel');
    assert.equal(loudFail.status, 502, JSON.stringify(loudFail.body));
    assert.equal(loudFail.body.status, 'place_search_no_relevant_results');
    assert.equal(state.tripThings.length, 0);
    const failPayload = state.turnPayloads.at(-1);
    assert.equal(failPayload.placeSearch?.reason, 'relevance_rejected_all');

    return { ok: true };
  } finally {
    globalThis.fetch = originalFetch;
    useVacationDatabase(null);
    useVacationAppDatabase(null);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(storeDir, { recursive: true, force: true });
  }
}

try {
  const result = await runPlaceRelevanceTargetAreaTests();
  if (result?.ok) console.log('test_place_relevance_target_area: ok');
  else process.exit(1);
} catch (error) {
  console.error(error);
  process.exit(1);
}
