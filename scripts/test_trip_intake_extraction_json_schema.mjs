#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  tripIntakeExtractionChatRequest,
  tripIntakeExtractionJsonSchema,
  classifyTripIntake,
} from '../src/vacation/trip-intake-classify.mjs';
import { bakeoffTierModels } from '../scripts/vacation-app-reply-rules.mjs';
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

function assertStrictObjectSchema(schema) {
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.ok(Array.isArray(schema.required) && schema.required.length > 0);
  for (const key of schema.required) {
    assert.ok(schema.properties[key], `missing property for required key ${key}`);
  }
  assert.strictEqual(Object.keys(schema.properties).length, schema.required.length);
  assert.strictEqual(schema.required.includes('things'), true);
  assert.strictEqual(schema.required.includes('roster'), true);
  assert.strictEqual(schema.required.includes('startDate'), true);
  assert.strictEqual(schema.required.includes('endDate'), true);
  assert.strictEqual(schema.required.includes('hasDates'), true);
  assert.strictEqual(schema.required.includes('category'), true);
}

function assertStrictThingItemSchema(schema) {
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required.sort(), ['kind', 'name', 'when', 'who'].sort());
}

const responseFormat = tripIntakeExtractionJsonSchema();
assert.equal(responseFormat.type, 'json_schema');
assert.equal(responseFormat.json_schema.strict, true);
assertStrictObjectSchema(responseFormat.json_schema.schema);
assertStrictThingItemSchema(responseFormat.json_schema.schema.properties.things.items);
function assertStrictRosterItemSchema(schema) {
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required.sort(), ['age', 'name', 'role'].sort());
}
assertStrictRosterItemSchema(responseFormat.json_schema.schema.properties.roster.items);

const extractionModel = bakeoffTierModels()[1];
const requestBody = tripIntakeExtractionChatRequest({ message: LANDING_TEXT, model: extractionModel });
assert.equal(requestBody.response_format.type, 'json_schema');
assert.equal(requestBody.response_format.json_schema.strict, true);
assert.equal(requestBody.provider.require_parameters, true);
assertStrictObjectSchema(requestBody.response_format.json_schema.schema);

const env = { OPENROUTER_API_KEY: 'test-key', JEV_ROUTER_MODEL: 'test/jev-router' };

const missingThingsFetch = async (url) => {
  if (String(url).includes('/decisions')) {
    return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.12 } } }) };
  }
  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            turnKind: 'other',
            target: '',
            anchor: '',
            anchorIsLodging: false,
            category: '',
            question: '',
            roster: [],
            destination: '',
            hasDates: false,
            startDate: '',
            endDate: '',
            title: '',
            inviteeName: '',
            inviteeEmail: '',
          }),
        },
      }],
    }),
  };
};
const missingThings = await classifyTripIntake({
  text: LANDING_TEXT,
  env,
  fetchImpl: missingThingsFetch,
});
assert.equal(missingThings.ok, false);
assert.match(missingThings.error, /missing things/);

function fullExtraction(overrides = {}) {
  return JSON.stringify({
    turnKind: 'other',
    target: '',
    anchor: '',
    anchorIsLodging: false,
    category: '',
    question: '',
    things: [],
    roster: [],
    destination: 'Maui',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
    inviteeName: '',
    inviteeEmail: '',
    ...overrides,
  });
}

let capturedExtractionBody = null;
const classifyFetch = async (url, init) => {
  const href = String(url);
  if (href.includes('/decisions')) {
    return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.12 } } }) };
  }
  capturedExtractionBody = JSON.parse(String(init.body));
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: fullExtraction() } }] }),
  };
};
const landingClass = await classifyTripIntake({
  text: LANDING_TEXT,
  env,
  fetchImpl: classifyFetch,
  requireExtractedTripDates: false,
});
assert.equal(landingClass.ok, true);
assert.equal(capturedExtractionBody.response_format.type, 'json_schema');
assert.equal(capturedExtractionBody.response_format.json_schema.strict, true);

const creationFetch = async (url, init) => {
  const href = String(url);
  if (href.includes('/decisions')) {
    return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.92 } } }) };
  }
  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: fullExtraction({
            turnKind: 'trip_intake',
            hasDates: true,
            startDate: STORED_START,
            endDate: STORED_END,
            title: 'March Maui week',
          }),
        },
      }],
    }),
  };
};
const creationClass = await classifyTripIntake({
  text: CREATE_TEXT,
  env,
  fetchImpl: creationFetch,
  requireExtractedTripDates: true,
});
assert.equal(creationClass.startDate, STORED_START);
assert.equal(creationClass.endDate, STORED_END);

const savedEnv = {};
const fixtureEnv = {
  ...testPlanEnv,
  OPENROUTER_API_KEY: 'test-key',
  JEV_ROUTER_MODEL: 'test/jev-router',
  DATABASE_URL: 'postgres://trip-intake-json-schema',
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
  transcriptTurns: [{ id: 'turn-prior' }],
  entitlement: {
    id: 'ent-json-schema',
    customer_id: CUSTOMER_ID,
    trip_id: TRIP_ID,
    plan: 'single',
    status: 'active',
    metadata: { product: 'timesyncher_vacation_single' },
  },
  session: {
    id: 'session-json-schema',
    token: 'tok-json-schema',
    customer_id: CUSTOMER_ID,
    trip_id: TRIP_ID,
    order_id: ORDER_ID,
    first_name: 'Buyer',
    last_name: 'Example',
    display_name: 'Buyer Example',
  },
};

const welcomeClaims = new Set();

function db(strings, ...values) {
  const text = sqlText(strings);
  if (/insert into vacation_onboarding_welcomes/i.test(text)) {
    const key = `${values[0]}|${values[1]}`;
    if (welcomeClaims.has(key)) return [];
    welcomeClaims.add(key);
    return [{ id: 'welcome-claim-1' }];
  }
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
  if (/update trips/i.test(text)) return [];
  if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) {
    return [{ n: 1, started_at: new Date() }];
  }
  if (/from transcript_turns/i.test(text) && /order by/i.test(text)) {
    return [{ speaker: 'customer', body: CREATE_TEXT, payload: { liveTranscript: { intake: true } } }];
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

const originalFetch = globalThis.fetch;
useVacationAppDatabase(db);

try {
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (href.includes('/decisions')) {
      const questions = body?.questions || body?.input?.questions || {};
      if (questions.trip_intake) {
        return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.12 } } }) };
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
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'What else should I know?' } }] }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: fullExtraction() } }] }) };
  };

  const beforeStart = state.trips[0].start_date;
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

  console.log(JSON.stringify({
    ok: true,
    checked: 'trip-intake-extraction-json-schema',
    extractionModel,
    provider: requestBody.provider,
    responseFormatType: requestBody.response_format.type,
  }));
} finally {
  globalThis.fetch = originalFetch;
  useVacationAppDatabase(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}
