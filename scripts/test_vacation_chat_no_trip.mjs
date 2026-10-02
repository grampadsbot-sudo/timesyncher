import assert from 'node:assert/strict';
import {
  classifyVacationChatIntake,
  createVacationFromChatMessage,
  intakeTripReadyForCreation,
} from '../src/vacation/vacation-from-chat-intake.mjs';
import { NO_TRIP_STARTER_INSTRUCTION, noTripReplyBlock } from '../src/vacation/no-trip-starter-reply.mjs';
import {
  queueVacationAppTurnForTests,
  useVacationAppDatabase,
} from '../routes/vacation-itinerary.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';

const TRIP_ID = '01234567-89ab-4cde-8f01-23456789abcd';
const ORDER_ID = '22222222-3333-4444-8555-666666666666';
const CUSTOMER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const savedEnv = {};
const fixtureEnv = {
  ...testPlanEnv,
  OPENROUTER_API_KEY: 'test-key',
  JEV_ROUTER_MODEL: 'test/jev-router',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
  DATABASE_URL: 'postgres://vacation-chat-no-trip-test',
};
for (const key of Object.keys(fixtureEnv)) {
  savedEnv[key] = process.env[key];
}
Object.assign(process.env, fixtureEnv);

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

const state = {
  tripCount: 0,
  trips: [],
  vacationRequestCount: 0,
  transcriptTurns: [],
  workerJobs: [],
  entitlement: {
    id: 'ent-no-trip-test',
    customer_id: CUSTOMER_ID,
    trip_id: null,
    plan: 'single',
    status: 'active',
    metadata: { product: 'timesyncher_vacation_single' },
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_payment_intent_id: null,
  },
  session: {
    id: 'session-1',
    token: 'tok-no-trip-test',
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
      title: typeof values[1] === 'string' ? values[1] : 'trip',
      destination: typeof values[2] === 'string' ? values[2] : '',
      start_date: values[3] || null,
      end_date: values[4] || null,
      status: 'onboarding',
      metadata: values[values.length - 1] && typeof values[values.length - 1] === 'object' ? values[values.length - 1] : {},
    };
    state.trips.push(row);
    return [{ id: TRIP_ID }];
  }
  if (/update onboarding_sessions/i.test(text) && /trip_id/i.test(text)) {
    const tripId = values.find((v) => v === TRIP_ID || (typeof v === 'string' && v.includes('-')));
    if (tripId === TRIP_ID || values.includes(TRIP_ID)) state.session.trip_id = TRIP_ID;
    return [];
  }
  if (/delete from trips/i.test(text)) {
    state.trips = state.trips.filter((trip) => trip.id !== values.find((v) => v === TRIP_ID));
    state.tripCount = state.trips.length;
    return [];
  }
  if (/update entitlements/i.test(text) && /trip_id/i.test(text)) {
    const tripId = values.find((v) => v === TRIP_ID) || values.find((v) => typeof v === 'string' && v.includes('-'));
    if (tripId) state.entitlement.trip_id = tripId;
    return [{ id: state.entitlement.id }];
  }
  if (/insert into entitlements/i.test(text)) {
    const tripId = values.find((v) => v === TRIP_ID);
    const row = { ...state.entitlement, id: 'ent-unlimited-sibling', trip_id: tripId || null };
    return [{ id: row.id }];
  }
  if (/from entitlements e/i.test(text) && /paid_orders/i.test(text)) {
    return [{ ...state.entitlement }];
  }
  if (/from entitlements e/i.test(text) && /trip_id is null/i.test(text)) {
    return state.entitlement.trip_id ? [] : [{ ...state.entitlement }];
  }
  if (/from entitlements e/i.test(text) && /e\.trip_id = \$\{/i.test(text)) {
    const tripId = values.find((v) => v === TRIP_ID);
    if (state.entitlement.trip_id === tripId) {
      return [{
        plan: state.entitlement.plan,
        status: state.entitlement.status,
        metadata: state.entitlement.metadata,
      }];
    }
    return [];
  }
  if (/from entitlements/i.test(text)) {
    return [{
      plan: state.entitlement.plan,
      status: state.entitlement.status,
      metadata: state.entitlement.metadata,
    }];
  }
  if (/insert into vacation_requests/i.test(text)) {
    state.vacationRequestCount += 1;
    const id = `req-${state.vacationRequestCount}`;
    return [{ id, received_at: new Date().toISOString(), queued_at: new Date().toISOString() }];
  }
  if (/insert into transcript_turns/i.test(text)) {
    const id = `turn-${state.transcriptTurns.length + 1}`;
    state.transcriptTurns.push({ id });
    return [{ id }];
  }
  if (/update transcript_turns/i.test(text)) return [];
  if (/insert into vacation_request_events/i.test(text)) return [];
  if (/insert into worker_jobs/i.test(text)) {
    const id = `job-${state.workerJobs.length + 1}`;
    state.workerJobs.push({ id });
    return [{ id }];
  }
  if (/update worker_jobs/i.test(text)) return [];
  if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) {
    const nullTrip = /trip_id is null/i.test(text);
    const n = state.transcriptTurns.filter(() => nullTrip === !state.session.trip_id).length;
    return [{ n, started_at: new Date().toISOString() }];
  }
  if (/from transcript_turns/i.test(text) && /select speaker/i.test(text)) return [];
  if (/from transcript_turns/i.test(text) && /request_id/i.test(text) && /speaker = 'app'/i.test(text)) {
    return [];
  }
  if (/from trips/i.test(text) && /where id/i.test(text)) {
    const trip = state.trips.find((t) => t.id === values.find((v) => v === TRIP_ID));
    return trip ? [trip] : [];
  }
  if (/update trips/i.test(text)) return [];
  if (/from trip_things/i.test(text)) return [];
  if (/^\s*select\b/i.test(text)) return [];
  throw new Error(`unexpected sql: ${text.slice(0, 240)}`);
}

const originalFetch = globalThis.fetch;
function intakeFetchMock({ title, things, destination, hasDates, intake = true }) {
  return async (url, init) => {
    const href = String(url);
    if (href.includes('app-config')) throw new Error(`unexpected app-config fetch: ${href}`);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (href.includes('/decisions')) {
      const questions = body?.questions || body?.input?.questions || {};
      if (questions.trip_intake) {
        return {
          ok: true,
          json: async () => ({
            answers: { trip_intake: { noul: intake === false ? 0.1 : 0.92 } },
          }),
        };
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
    const messages = body?.messages || [];
    const corpus = JSON.stringify(messages);
    if (corpus.includes('Starter facts')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Where are you headed, and what dates work for you?' } }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              things,
              roster: [],
              destination,
              hasDates,
              title,
            }),
          },
        }],
      }),
    };
  };
}

useVacationAppDatabase(db);

assert.ok(NO_TRIP_STARTER_INSTRUCTION.includes('where'));
assert.equal(noTripReplyBlock('See /shared/foo', () => '', { shape: 'no-trip' }), 'no_trip_reply_shared_link');

try {
  globalThis.fetch = intakeFetchMock({ title: '', things: [], destination: '', hasDates: false, intake: false });

  const empty = await createVacationFromChatMessage(db, state.session, { text: '' }, async () => [], process.env);
  assert.equal(empty.ok, false);
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.code, 'vacation_app_message_required');

  const prevKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = '';
  const noKey = await createVacationFromChatMessage(db, state.session, { text: 'hi' }, async () => [], process.env);
  process.env.OPENROUTER_API_KEY = prevKey;
  assert.equal(noKey.ok, false);
  assert.equal(noKey.statusCode, 502);
  assert.equal(noKey.code, 'trip_intake_classification_failed');

  globalThis.fetch = intakeFetchMock({ title: '', things: [], destination: '', hasDates: false, intake: false });
  state.tripCount = 0;
  state.trips = [];
  state.vacationRequestCount = 0;
  state.session.trip_id = null;

  const queued = await createVacationFromChatMessage(db, state.session, { text: 'hi' }, async () => [], process.env);
  assert.equal(queued.ok, true);
  assert.equal(queued.action, 'queue_without_trip');
  assert.equal(state.tripCount, 0);

  const turn = await queueVacationAppTurnForTests(db, state.session, null, { text: 'hi' });
  assert.equal(turn.ok, true);
  assert.match(turn.reply, /\?/);
  assert.doesNotMatch(turn.reply || '', /\/shared\//);
  assert.equal(state.tripCount, 0);
  assert.equal(state.vacationRequestCount, 1);

  assert.equal(
    intakeTripReadyForCreation({
      title: 'Harbor Ridge Week',
      destination: 'Neutral Bay',
      hasDates: true,
    }),
    true,
  );
  const classified = await classifyVacationChatIntake(
    'We are planning Harbor Ridge Week in Neutral Bay from October 7 to October 9, 2026.',
    process.env,
  );
  assert.equal(classified.classification.ok, true);

  globalThis.fetch = intakeFetchMock({
    title: 'Harbor Ridge Week',
    things: [],
    destination: 'Neutral Bay',
    hasDates: true,
    intake: true,
  });
  state.tripCount = 0;
  state.trips = [];
  state.session.trip_id = null;

  const created = await createVacationFromChatMessage(
    db,
    state.session,
    { text: 'We are planning Harbor Ridge Week in Neutral Bay from October 7 to October 9, 2026.' },
    async () => state.trips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      status: trip.status,
      current: true,
      publicUrl: '',
      shareToken: '',
      intakeShare: false,
    })),
    process.env,
  );
  assert.equal(created.ok, true);
  assert.equal(created.action, 'created');
  assert.equal(state.tripCount, 1);
  assert.equal(state.session.trip_id, TRIP_ID);
  assert.equal(state.entitlement.trip_id, TRIP_ID);

  globalThis.fetch = intakeFetchMock({
    title: '',
    things: [{ name: 'Aurora Tea House', kind: 'restaurant', who: 'Ada', when: 'October 7' }],
    destination: 'Neutral Bay',
    hasDates: true,
    intake: true,
  });
  const existing = await createVacationFromChatMessage(
    db,
    state.session,
    { text: 'Adding dinner at Aurora Tea House on October 7.' },
    async () => state.trips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      status: trip.status,
      current: true,
      publicUrl: '',
      shareToken: '',
      intakeShare: false,
    })),
    process.env,
  );
  assert.equal(existing.ok, true);
  assert.equal(existing.action, 'existing');
  assert.equal(state.tripCount, 1);

  console.log('vacation chat no trip passed');
} finally {
  useVacationAppDatabase(null);
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
