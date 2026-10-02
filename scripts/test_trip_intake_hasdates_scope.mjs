#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createVacationFromChatMessage } from '../src/vacation/vacation-from-chat-intake.mjs';
import {
  TRIP_INTAKE_HAS_DATES_PROMPT,
  classifyTripIntake,
} from '../src/vacation/trip-intake-classify.mjs';
import { classifyVacationAppCustomerTurn } from '../src/vacation/chat-place-search.mjs';
import {
  queueVacationAppTurnForTests,
  useVacationAppDatabase,
} from '../routes/vacation-itinerary.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';

const TRIP_ID = '5ce5eb7d-10f9-4022-ae4b-85620a616116';
const ORDER_ID = '22222222-3333-4444-8555-666666666666';
const CUSTOMER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const LANDING_TEXT = 'we land in Maui at 3pm';
const CREATE_TEXT = 'Maui March 10-17 2027 with my wife';
const STORED_START = '2027-03-10';
const STORED_END = '2027-03-17';

const classifySource = fs.readFileSync(new URL('../src/vacation/trip-intake-classify.mjs', import.meta.url), 'utf8');
assert.match(classifySource, /TRIP_INTAKE_HAS_DATES_PROMPT/);
assert.match(TRIP_INTAKE_HAS_DATES_PROMPT, /times of day/i);
assert.match(TRIP_INTAKE_HAS_DATES_PROMPT, /calendar trip dates/i);
assert.equal(classifySource.includes(TRIP_INTAKE_HAS_DATES_PROMPT), true);

const savedEnv = {};
const fixtureEnv = {
  ...testPlanEnv,
  OPENROUTER_API_KEY: 'test-key',
  JEV_ROUTER_MODEL: 'test/jev-router',
  DATABASE_URL: 'postgres://trip-intake-hasdates-scope',
};
for (const key of Object.keys(fixtureEnv)) savedEnv[key] = process.env[key];
Object.assign(process.env, fixtureEnv);

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

const state = {
  tripCount: 1,
  trips: [{
    id: TRIP_ID,
    customer_id: CUSTOMER_ID,
    title: 'March Maui week',
    destination: 'Maui',
    start_date: STORED_START,
    end_date: STORED_END,
    status: 'onboarding',
    metadata: {},
  }],
  transcriptTurns: [{ id: 'turn-prior-intake' }],
  workerJobs: [],
  entitlement: {
    id: 'ent-hasdates-scope',
    customer_id: CUSTOMER_ID,
    trip_id: TRIP_ID,
    plan: 'single',
    status: 'active',
    metadata: { product: 'timesyncher_vacation_single' },
  },
  session: {
    id: 'session-hasdates-scope',
    token: 'tok-hasdates-scope',
    customer_id: CUSTOMER_ID,
    trip_id: TRIP_ID,
    order_id: ORDER_ID,
    first_name: 'Buyer',
    last_name: 'Example',
    display_name: 'Buyer Example',
  },
};

function db(strings, ...values) {
  const text = sqlText(strings);
  if (/insert into trips/i.test(text)) return [{ id: TRIP_ID }];
  if (/insert into vacation_requests/i.test(text)) {
    return [{ id: 'req-landing', received_at: new Date(), queued_at: new Date() }];
  }
  if (/insert into transcript_turns/i.test(text) && /returning id/i.test(text)) {
    const id = `turn-${state.transcriptTurns.length + 1}`;
    state.transcriptTurns.push({ id });
    return [{ id }];
  }
  if (/insert into transcript_turns/i.test(text)) return [];
  if (/update transcript_turns/i.test(text)) return [];
  if (/insert into worker_jobs/i.test(text)) return [{ id: 'job-landing' }];
  if (/insert into vacation_request_events/i.test(text)) return [];
  if (/update worker_jobs/i.test(text)) return [];
  if (/update trips/i.test(text) && /start_date/i.test(text)) {
    throw new Error('trip dates must not be overwritten on a logistics turn');
  }
  if (/update trips/i.test(text)) return [];
  if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) {
    return [{ n: 1, started_at: new Date() }];
  }
  if (/from transcript_turns/i.test(text) && /order by/i.test(text)) {
    return [{
      speaker: 'customer',
      body: CREATE_TEXT,
      payload: { liveTranscript: { intake: true } },
    }];
  }
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
  if (/join entitlements e on e\.customer_id = t\.customer_id/i.test(text)) {
    return [{ plan: state.entitlement.plan, status: state.entitlement.status, metadata: state.entitlement.metadata }];
  }
  if (/from trip_things/i.test(text)) return [];
  if (/^\s*select\b/i.test(text)) return [];
  throw new Error(`unexpected sql: ${text.slice(0, 240)}`);
}

function extractionJson(overrides = {}) {
  return JSON.stringify({
    turnKind: 'other',
    target: '',
    anchor: '',
    anchorIsLodging: false,
    question: '',
    things: [],
    roster: [],
    destination: 'Maui',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
    ...overrides,
  });
}

function classifyFetchMock({ extraction, intakeScore = 0.12 } = {}) {
  return async (url, init) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (href.includes('/decisions')) {
      const questions = body?.questions || body?.input?.questions || {};
      if (questions.trip_intake) {
        return { ok: true, json: async () => ({ answers: { trip_intake: { noul: intakeScore } } }) };
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
    if (/Starter facts|Intake facts|tags from the allowed list|score/i.test(corpus)) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'What else should I know about your arrival?' } }] }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: extraction } }] }) };
  };
}

const originalFetch = globalThis.fetch;
useVacationAppDatabase(db);

try {
  globalThis.fetch = classifyFetchMock({ extraction: extractionJson() });
  const queueClassify = await classifyVacationAppCustomerTurn(
    LANDING_TEXT,
    process.env,
    (opts) => classifyTripIntake({ ...opts, requireExtractedTripDates: false }),
  );
  assert.equal(queueClassify.classification.ok, true);

  const misExtracted = await classifyTripIntake({
    text: LANDING_TEXT,
    env: process.env,
    fetchImpl: classifyFetchMock({
      extraction: extractionJson({ hasDates: true, startDate: '', endDate: '', turnKind: 'trip_intake' }),
      intakeScore: 0.92,
    }),
    requireExtractedTripDates: false,
  });
  assert.equal(misExtracted.ok, true);

  const creationClassify = await classifyTripIntake({
    text: CREATE_TEXT,
    env: process.env,
    fetchImpl: classifyFetchMock({
      extraction: extractionJson({
        turnKind: 'trip_intake',
        hasDates: true,
        startDate: STORED_START,
        endDate: STORED_END,
        title: 'March Maui week',
      }),
      intakeScore: 0.92,
    }),
    requireExtractedTripDates: true,
  });
  assert.equal(creationClassify.startDate, STORED_START);
  assert.equal(creationClassify.endDate, STORED_END);

  const creationFail = await classifyTripIntake({
    text: CREATE_TEXT,
    env: process.env,
    fetchImpl: classifyFetchMock({
      extraction: extractionJson({ turnKind: 'trip_intake', hasDates: true, startDate: '', endDate: '', title: 'March Maui week' }),
      intakeScore: 0.92,
    }),
    requireExtractedTripDates: true,
  });
  assert.equal(creationFail.ok, false);
  assert.match(creationFail.error, /dates required/);

  globalThis.fetch = classifyFetchMock({ extraction: extractionJson() });
  const beforeStart = state.trips[0].start_date;
  const beforeEnd = state.trips[0].end_date;
  const trip = {
    id: TRIP_ID,
    title: state.trips[0].title,
    destination: state.trips[0].destination,
    startDate: state.trips[0].start_date,
    endDate: state.trips[0].end_date,
    status: state.trips[0].status,
    current: true,
    publicUrl: '',
    shareToken: '',
    intakeShare: false,
  };
  const queued = await queueVacationAppTurnForTests(db, state.session, trip, { text: LANDING_TEXT });
  assert.equal(queued.ok, true);
  assert.equal(state.trips[0].start_date, beforeStart);
  assert.equal(state.trips[0].end_date, beforeEnd);

  state.tripCount = 0;
  state.trips = [];
  state.session.trip_id = null;
  state.entitlement.trip_id = null;
  globalThis.fetch = classifyFetchMock({
    extraction: extractionJson({ turnKind: 'trip_intake', hasDates: true, startDate: '', endDate: '', title: 'March Maui week' }),
    intakeScore: 0.92,
  });
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

  console.log(JSON.stringify({ ok: true, checked: 'trip-intake-hasdates-scope' }));
} finally {
  globalThis.fetch = originalFetch;
  useVacationAppDatabase(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}
