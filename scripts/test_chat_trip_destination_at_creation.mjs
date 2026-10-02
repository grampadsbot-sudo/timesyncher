#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createVacationFromChatMessage, classifyVacationChatIntake } from '../src/vacation/vacation-from-chat-intake.mjs';
import { classifyTripIntake, tripIntakeJobFields } from '../src/vacation/trip-intake-classify.mjs';
import { firstIntakeReplyFacts } from '../src/vacation/first-intake-reply.mjs';
import { runCustomerChatPlaceSearch } from '../src/vacation/chat-place-search.mjs';
import {
  queueVacationAppTurnForTests,
  useVacationAppDatabase,
} from '../routes/vacation-itinerary.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';

const TRIP_ID = '5ce5eb7d-10f9-4022-ae4b-85620a616116';
const ORDER_ID = '22222222-3333-4444-8555-666666666666';
const CUSTOMER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CREATE_TEXT = 'Maui March 10-17 2027 with my wife';
const TRIP_DESTINATION = 'Maui';
const TRIP_START = '2027-03-10';
const TRIP_END = '2027-03-17';
const TRIP_TITLE = 'March Maui week';

const savedEnv = {};
const fixtureEnv = {
  ...testPlanEnv,
  OPENROUTER_API_KEY: 'test-key',
  JEV_ROUTER_MODEL: 'test/jev-router',
  DATABASE_URL: 'postgres://chat-trip-destination-at-creation',
};
for (const key of Object.keys(fixtureEnv)) savedEnv[key] = process.env[key];
Object.assign(process.env, fixtureEnv);

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

const state = {
  tripCount: 0,
  trips: [],
  transcriptTurns: [],
  workerJobs: [],
  placeSearchCalls: [],
  entitlement: {
    id: 'ent-creation-dest',
    customer_id: CUSTOMER_ID,
    trip_id: null,
    plan: 'single',
    status: 'active',
    metadata: { product: 'timesyncher_vacation_single' },
  },
  session: {
    id: 'session-creation-dest',
    token: 'tok-creation-dest',
    customer_id: CUSTOMER_ID,
    trip_id: null,
    order_id: ORDER_ID,
    first_name: 'Buyer',
    last_name: 'Example',
    display_name: 'Buyer Example',
  },
};

function db(strings, ...values) {
  const text = sqlText(strings);
  if (/insert into trips/i.test(text)) {
    state.tripCount += 1;
    const row = {
      id: TRIP_ID,
      customer_id: values[0],
      title: values[1],
      destination: values[2] || '',
      start_date: values[3] || null,
      end_date: values[4] || null,
      status: 'onboarding',
      metadata: values[values.length - 1] || {},
    };
    state.trips.push(row);
    return [{ id: TRIP_ID }];
  }
  if (/update onboarding_sessions/i.test(text) && /trip_id/i.test(text)) {
    state.session.trip_id = TRIP_ID;
    return [];
  }
  if (/delete from trips/i.test(text)) {
    state.trips = [];
    state.tripCount = 0;
    return [];
  }
  if (/update entitlements/i.test(text) && /trip_id/i.test(text)) {
    state.entitlement.trip_id = TRIP_ID;
    return [{ id: state.entitlement.id }];
  }
  if (/from entitlements e/i.test(text) && /paid_orders/i.test(text)) {
    return [{ ...state.entitlement }];
  }
  if (/from entitlements e/i.test(text) && /trip_id is null/i.test(text)) {
    return state.entitlement.trip_id ? [] : [{ ...state.entitlement }];
  }
  if (/join entitlements e on e\.customer_id = t\.customer_id/i.test(text)) {
    return state.entitlement.trip_id === TRIP_ID
      ? [{ plan: state.entitlement.plan, status: state.entitlement.status, metadata: state.entitlement.metadata }]
      : [];
  }
  if (/insert into vacation_requests/i.test(text)) {
    return [{ id: 'req-create', received_at: new Date(), queued_at: new Date() }];
  }
  if (/insert into transcript_turns/i.test(text) && /returning id/i.test(text)) {
    const id = `turn-${state.transcriptTurns.length + 1}`;
    state.transcriptTurns.push({ id });
    return [{ id }];
  }
  if (/insert into transcript_turns/i.test(text)) return [];
  if (/update transcript_turns/i.test(text)) return [];
  if (/insert into worker_jobs/i.test(text)) {
    const id = `job-${state.workerJobs.length + 1}`;
    state.workerJobs.push({ id });
    return [{ id }];
  }
  if (/insert into vacation_request_events/i.test(text)) return [];
  if (/update worker_jobs/i.test(text)) return [];
  if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) return [{ n: 0, started_at: new Date() }];
  if (/from transcript_turns/i.test(text) && /order by/i.test(text)) return [];
  if (/from trips/i.test(text)) {
    return state.trips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
      status: trip.status,
      metadata: trip.metadata,
    }));
  }
  if (/from trip_things/i.test(text)) return [];
  if (/update trips/i.test(text)) return [];
  if (/^\s*select\b/i.test(text)) return [];
  throw new Error(`unexpected sql: ${text.slice(0, 240)}`);
}

function tripIntakeExtraction(overrides = {}) {
  return JSON.stringify({
    turnKind: 'trip_intake',
    target: '',
    anchor: '',
    anchorIsLodging: false,
    question: '',
    things: [],
    roster: [],
    destination: TRIP_DESTINATION,
    hasDates: true,
    startDate: TRIP_START,
    endDate: TRIP_END,
    title: TRIP_TITLE,
    ...overrides,
  });
}

function intakeFetchMock({ failIntakeReply = false, placeSearch = false } = {}) {
  return async (url, init) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (href.includes('/decisions')) {
      const questions = body?.questions || body?.input?.questions || {};
      if (questions.trip_intake) {
        return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.92 } } }) };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
        }),
      };
    }
    const corpus = JSON.stringify(body?.messages || []);
    if (failIntakeReply && /Intake facts/i.test(corpus)) {
      throw new Error('intake reply model unavailable');
    }
    if (placeSearch) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                turnKind: 'place_search',
                target: 'kid-friendly taco spots',
                anchor: '',
                anchorIsLodging: false,
                question: '',
                things: [],
                roster: [],
                destination: '',
                hasDates: false,
                startDate: '',
                endDate: '',
                title: '',
              }),
            },
          }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: tripIntakeExtraction() } }],
      }),
    };
  };
}

const originalFetch = globalThis.fetch;
useVacationAppDatabase(db);

try {
  globalThis.fetch = intakeFetchMock();

  const missingDatesFetch = async (url, init) => {
    const href = String(url);
    if (href.includes('/decisions')) {
      return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.92 } } }) };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: tripIntakeExtraction({ startDate: '', endDate: '' }) } }],
      }),
    };
  };
  const missingDatesClass = await classifyTripIntake({
    text: CREATE_TEXT,
    env: process.env,
    fetchImpl: missingDatesFetch,
  });
  assert.equal(missingDatesClass.ok, false);
  assert.match(missingDatesClass.error, /dates required/);

  state.tripCount = 0;
  state.trips = [];
  state.session.trip_id = null;
  state.entitlement.trip_id = null;
  globalThis.fetch = missingDatesFetch;
  const failedCreate = await createVacationFromChatMessage(
    db,
    state.session,
    { text: CREATE_TEXT },
    async () => [],
    process.env,
  );
  assert.equal(failedCreate.ok, false);
  assert.equal(failedCreate.code, 'trip_intake_classification_failed');
  assert.equal(state.tripCount, 0);

  const noDatesFetch = async (url, init) => {
    const href = String(url);
    if (href.includes('/decisions')) {
      return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.1 } } }) };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: tripIntakeExtraction({ hasDates: false, startDate: '', endDate: '' }),
          },
        }],
      }),
    };
  };
  const noDatesClass = await classifyTripIntake({
    text: 'Hello',
    env: process.env,
    fetchImpl: noDatesFetch,
  });
  assert.equal(noDatesClass.ok, true);
  assert.equal(noDatesClass.hasDates, false);
  assert.equal(noDatesClass.startDate, '');
  assert.equal(noDatesClass.endDate, '');

  globalThis.fetch = intakeFetchMock();

  const loadTrips = async () => state.trips.map((trip) => ({
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: trip.start_date,
    endDate: trip.end_date,
    status: trip.status,
    current: trip.id === state.session.trip_id,
    publicUrl: '',
    shareToken: '',
    intakeShare: false,
  }));

  const created = await createVacationFromChatMessage(
    db,
    state.session,
    { text: CREATE_TEXT },
    loadTrips,
    process.env,
  );
  assert.equal(created.ok, true);
  assert.equal(created.action, 'created');
  assert.equal(state.trips.length, 1);
  assert.equal(state.trips[0].destination, TRIP_DESTINATION);
  assert.equal(state.trips[0].start_date, TRIP_START);
  assert.equal(state.trips[0].end_date, TRIP_END);

  const { classification, jobFields } = await classifyVacationChatIntake(CREATE_TEXT, process.env);
  assert.equal(jobFields.startDate, TRIP_START);
  assert.equal(jobFields.endDate, TRIP_END);
  const intakeFacts = firstIntakeReplyFacts({
    customerTurn: CREATE_TEXT,
    tripTitle: jobFields.title,
    extractedDestination: jobFields.destination,
    savedStart: jobFields.startDate,
    savedEnd: jobFields.endDate,
    ownerPlan: {
      checkout_plan: 'single',
      plan_id: 'timesyncher_vacation_single',
      plan_name: 'Single vacation',
    },
    tripId: TRIP_ID,
  });
  assert.equal(intakeFacts.start, TRIP_START);
  assert.equal(intakeFacts.end, TRIP_END);
  assert.equal(classification.startDate, TRIP_START);

  globalThis.fetch = intakeFetchMock({ failIntakeReply: true });
  const trip = (await loadTrips())[0];
  const queuedCreate = await queueVacationAppTurnForTests(db, state.session, trip, { text: CREATE_TEXT });
  assert.equal(queuedCreate.ok, false);
  assert.equal(state.trips[0].destination, TRIP_DESTINATION);
  assert.equal(state.trips[0].start_date, TRIP_START);

  globalThis.fetch = intakeFetchMock({ placeSearch: true });
  const taco = await runCustomerChatPlaceSearch({
    placeSearchTurn: true,
    classification: {
      ok: true,
      turnKind: 'place_search',
      target: 'kid-friendly taco spots',
      anchor: '',
      anchorIsLodging: false,
    },
    tripDestination: state.trips[0].destination,
    env: process.env,
    searchImpl: async (plan) => {
      state.placeSearchCalls.push(plan);
      return {
        destination: plan.destination,
        providers: [{ provider: 'brave', status: 'ok', resultCount: 1 }],
        places: [{
          source: 'brave',
          title: 'Sample taco counter',
          category: 'restaurant',
          lat: 20.8,
          lon: -156.3,
          metadata: { sourceRef: { source: 'brave', id: 'brave-taco-1' } },
        }],
      };
    },
  });
  assert.notEqual(taco.error, 'Place search needs a trip destination or a named area in the message.');
  assert.equal(taco.status, 'ok');
  assert.equal(state.placeSearchCalls[0]?.destination, TRIP_DESTINATION);

  console.log(JSON.stringify({ ok: true, checked: 'chat-trip-destination-at-creation' }));
} finally {
  globalThis.fetch = originalFetch;
  useVacationAppDatabase(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}
