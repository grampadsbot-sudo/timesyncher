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
import {
  BRAVE_DUMMY,
  createHyattHandlerDb,
  createHyattHandlerFetch,
  HYATT_INTAKE,
  MAUI_INTAKE,
  MAUI_TITLE,
  OPENROUTER_DUMMY,
  TAVILY_DUMMY,
} from './fixtures/intake-hyatt-app-handler-fixtures.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';

const HANDLER_CATCH_LINE = 'routes/vacation-itinerary.mjs:1256';

async function postApp(state, handlerFn, token, body) {
  const req = {
    method: 'POST',
    url: `/api/vacation-itinerary?app=1&session=${encodeURIComponent(token)}`,
    headers: { host: 'vacation-staging.timesyncher.com', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  };
  let status = 0;
  let raw = '';
  const res = {
    setHeader() {},
    end(chunk) {
      raw = String(chunk || '');
    },
  };
  Object.defineProperty(res, 'statusCode', {
    get() { return status; },
    set(value) { status = value; },
  });
  await handlerFn(req, res);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { raw };
  }
  state.responses.push({ status, body: parsed, requestBody: body });
  return { status, body: parsed };
}

async function runHyattHandlerRouteTest() {
  const storeDir = await mkdtemp(path.join(tmpdir(), 'intake-hyatt-handler-'));
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
    TIMESYNCHER_EULA_VERSION: 'test-eula-hyatt-handler',
    TIMESYNCHER_ONBOARDING_STORE: storeDir,
    TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
    TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
    TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
    TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
    TIMESYNCHER_SINGLE_NAME: 'Single vacation',
    TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
    DATABASE_URL: 'postgresql://intake-hyatt-handler@127.0.0.1/intake_hyatt_handler',
  });

  const sessionToken = 'session-intake-hyatt-handler';
  const state = {
    customerId: '11111111-2222-4333-8444-555555555555',
    tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    session: {
      id: '44444444-5555-4666-8777-888888888888',
      token: sessionToken,
      customer_id: '11111111-2222-4333-8444-555555555555',
      trip_id: null,
      order_id: '55555555-6666-4777-8888-999999999999',
      status: 'active',
      first_name: 'Shepherd',
      last_name: 'Smoke',
      display_name: 'Shepherd Smoke',
      email: 'buyer@example.com',
      metadata: {},
    },
    trip: null,
    entitlement: {
      id: 'ent-hyatt-test',
      plan: 'single',
      status: 'active',
      trip_id: null,
      metadata: { product: 'timesyncher_vacation_single' },
    },
    eulaStore: {},
    welcomeClaims: new Set(),
    welcomeTurns: [],
    transcriptTurns: [],
    tripThings: [],
    requests: [],
    fetchCalls: [],
    responses: [],
    welcomeClaimTripId: null,
  };

  const db = createHyattHandlerDb(state);
  useVacationDatabase(db);
  useVacationAppDatabase(db);
  installNoopNominatimStore();

  const store = createPersistentStoreFromEnv(process.env);
  await ensureVacationEulaSession(state.session, { env: process.env });
  const eulaStatus = await vacationEulaStatus(state.session, process.env);
  if (!eulaStatus.ok) {
    await acceptEulaPersistent(store, eulaSessionIdForOnboarding(state.session), {
      acceptedByName: 'Shepherd Smoke',
      checkboxConfirmed: true,
    });
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = createHyattHandlerFetch(state);

  try {
    state.welcomeClaims.add(`${state.session.id}|owner`);
    state.welcomeTurns.push({
      id: 'welcome-turn-seeded',
      trip_id: null,
      payload: { welcomeAudience: 'owner_no_site', welcomeFor: 'owner', selectedTripId: null },
      speaker: 'app',
    });
    const intakeSlug = intakeShareSlug(state.tripId);
    state.trip = {
      id: state.tripId,
      customer_id: state.customerId,
      title: MAUI_TITLE,
      destination: 'Maui',
      start_date: '2027-03-10',
      end_date: '2027-03-17',
      status: 'planning',
      metadata: {
        publicSlug: intakeSlug,
        shareToken: intakeSlug,
        publicUrl: `https://vacation-staging.timesyncher.com/shared/${intakeSlug}/`,
        intakeShare: true,
      },
    };
    state.session.trip_id = state.tripId;
    state.entitlement.trip_id = state.tripId;
    state.tripThings.push({
      id: 'seed-activity-1',
      category: 'activity',
      title: 'Prior taco search',
      metadata: {},
      location: {},
    });
    state.transcriptTurns.push(
      { id: 'prior-customer-1', trip_id: state.tripId, speaker: 'customer', payload: { liveTranscript: { turnIndex: 4, intake: true } } },
    );

    const hyatt = await postApp(state, handler, sessionToken, { tripId: state.tripId, text: HYATT_INTAKE });

    if (hyatt.status === 400) {
      if (hyatt.body?.code === 'onboarding_welcome_failed') {
        throw new Error(`regression reproduced: Hyatt handler returned 400 welcome failure via ${HANDLER_CATCH_LINE}`);
      }
      throw new Error(`unexpected 400 from ${HANDLER_CATCH_LINE}: ${JSON.stringify(hyatt.body)}`);
    }

    assert.ok(hyatt.status >= 200 && hyatt.status < 300, `Hyatt lodging turn failed: ${hyatt.status} ${JSON.stringify(hyatt.body)}`);
    assert.ok(hyatt.body?.title || state.trip.title, 'trip title should remain set after Hyatt turn');
    const hotels = state.tripThings.filter((row) => row.category === 'hotel');
    assert.ok(hotels.length >= 1, `expected hotel thing, got ${JSON.stringify(state.tripThings)}`);
    assert.equal(state.welcomeTurns.length, 1, 'Hyatt turn must not insert a second owner welcome');
    return { ok: true };
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

await runHyattHandlerRouteTest();
console.log('test_intake_hyatt_app_handler_route passed');
