import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { finishTierRewrite, produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { intId } from '../src/vacation/intake-shared-trip.mjs';
import { createTripStateActions } from '../src/vacation/trip-state-actions.mjs';
import { tripStateCapabilities } from '../src/vacation/trip-state-action-registry.mjs';
import { digestTripState, readTripStateSite } from '../src/vacation/trip-state-action-site.mjs';
import { createTripStateRevisionStore } from '../src/vacation/trip-state-revision-store.mjs';
import {
  TRIP_STATE_MAX_TOKENS, TRIP_STATE_REWRITE_INSTRUCTION, TRIP_STATE_SYSTEM_INSTRUCTION, TRIP_STATE_TARGET_TOKENS,
  enabledTripStateTools, estimateTripStateTokens, pinTripStateContext, selectBoundedTripState, stringifyTripState,
  tripStateHasMatchingReceipt,
} from '../src/vacation/trip-state-model-context.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const file = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ajv = new Ajv2020({ strictRequired: false, strictTypes: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(file('../src/vacation/trip-state.schema.json')));
const sha256 = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');

const OFF_CHAT_BASELINE_HASH = '508d3729a9db13f5a6171c0d9f55768b8dc383107b108f4d03db13684aae1b62';
const OFF_JEV_BASELINE_HASH = '66e902b4132ac077b186a7a17cfa3206338f9edc3d79febe6598f12b47244777';
const BASE_INTENT = { intent: { asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: false } };
const OFFLINE_ENV = { OPENROUTER_API_KEY: 'test-key-offline' };

async function withMockFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

{
  const tripId = '11111111-2222-4333-8444-555555555555';
  const customerTurn = 'Put Botanical Gardens on Tuesday.';
  const priorTurns = [
    { role: 'customer', text: 'We are planning a Harbor City trip from April 5 to April 9, 2027.' },
    { role: 'app', text: 'Sounds great, Harbor City in April will be lovely.' },
  ];
  const runSwitchOff = async (extra = {}) => {
    const calls = [];
    await withMockFetch(async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ path: new URL(url).pathname, raw: init.body });
      if (new URL(url).pathname.endsWith('/decisions')) {
        return Response.json({ answers: { overall_quality: { score: 4 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' }, route_type: { choice: 'itinerary_advice' }, needs_day_for_note: { noul: 0.05 } } });
      }
      return Response.json({ model: body.model, choices: [{ message: { content: 'Botanical Gardens fits well on Tuesday for your Harbor City vacation.' } }] });
    }, () => produceLiveAppReply({
      customerTurn, session: { trip_id: tripId, display_name: 'Maya' }, priorTurns,
      tripTitle: 'Harbor City Family Trip', env: OFFLINE_ENV, understanding: BASE_INTENT,
      loadSavedTripRecordFn: async () => ({
        destination: 'Harbor City', start: '2027-04-05', end: '2027-04-09',
        things: [{ title: 'Botanical Gardens', category: 'park', whenLabel: '', customerWhen: '' }],
        party: { primary: { name: 'Maya', role: 'Owner' }, collaborators: [], preference_subjects: [], viewers: [], editors: [] },
      }),
      ...extra,
    }));
    return calls;
  };
  const offCalls = await runSwitchOff();
  assert.equal(offCalls.length, 2);
  assert.equal(sha256(offCalls[0].raw), OFF_CHAT_BASELINE_HASH);
  assert.equal(sha256(offCalls[1].raw), OFF_JEV_BASELINE_HASH);
  const offWithUnusedTrip = await runSwitchOff({
    trip: { id: tripId, metadata: { trip_state_actions: false, intakeShare: true } },
    tripStateRevision: { state_json: JSON.stringify({ version: '1.0' }) },
  });
  assert.equal(sha256(offWithUnusedTrip[0].raw), OFF_CHAT_BASELINE_HASH);
  assert.equal(sha256(offWithUnusedTrip[1].raw), OFF_JEV_BASELINE_HASH);
  assert.equal(
    sha256(replyRulesSystem({}, '', 'Spring trip', false, 'Please save Botanical Gardens.', { VK_TRIP_STATE_ACTIONS: '0' })),
    '51a721073433d0ee64458c9e1a98f8cbdd576b5c7ede120ddb13d846b7a04170',
  );
}

const raw = new PGlite({ extensions: { pgcrypto } });
let serial = Promise.resolve();
const pool = {
  async connect() {
    const prior = serial;
    let release;
    serial = new Promise((resolve) => { release = resolve; });
    await prior;
    return { query: raw.query.bind(raw), release };
  },
};
const db = async (parts, ...params) => {
  const sql = parts.reduce((out, part, index) => (index ? `${out}$${index}${part}` : part), '');
  return (await raw.query(sql, params)).rows;
};

try {
  await raw.exec(file('../db/migrations/001_vacation_mvp.sql'));
  await raw.exec(file('../db/migrations/003_trip_things_source.sql'));
  await raw.exec(file('../db/migrations/010_vacation_trip_state_actions.sql'));
  await raw.exec(file('../db/migrations/011_vacation_trip_state_revisions.sql'));

  const tripId = 'b24d0645-8dea-4cbe-97de-fce01f5a4814';
  const actorId = '85b0757c-a9d7-4bb0-96d4-78c28a4c86d5';
  const parkId = '10000000-0000-4000-a000-000000000001';
  const day2Id = String(intId(`${tripId}:day:2027-04-06`));
  const trip = {
    id: tripId, customer_id: actorId, title: 'Harbor City Family Trip', destination: 'Harbor City',
    start_date: '2027-04-05', end_date: '2027-04-09', status: 'onboarding',
    metadata: { trip_state_actions: true, intakeShare: true },
  };
  await db`insert into customers (id) values (${actorId})`;
  await db`
    insert into trips (id, customer_id, title, destination, start_date, end_date, status, metadata)
    values (${tripId}, ${actorId}, ${trip.title}, ${trip.destination}, ${trip.start_date}, ${trip.end_date}, ${trip.status}, ${trip.metadata})
  `;
  const thingMetadata = {
    tripState: {
      type: 'park', basis: 'named', via: 'customer_named', turn: 6, proposed_by: 'customer',
      occurrences: [{ id: 'v2', day: day2Id, role: 'visit', time: { value: '09:00', precision: 'proposed' }, via: 'chat_action', turn: 6, proposed_by: 'customer' }],
    },
  };
  await db`insert into trip_things (id, trip_id, category, title, metadata, source) values (${parkId}, ${tripId}, 'park', 'Botanical Gardens', ${thingMetadata}, 'customer')`;
  const siteThings = await db`select id, category, title, description, metadata, ratings, location, source, starts_at::text, ends_at::text from trip_things where trip_id = ${tripId} order by created_at, id`;
  const observed = readTripStateSite({ trip, things: siteThings, invites: {} }, null, 6);
  const receiptRecord = {
    op: 'place_on_day', turn: 6,
    outcome: { result: 'applied', detail: 'Verified Botanical Gardens on Tuesday.', refs: ['v2'] },
    proof: { v2: digestTripState({ day: day2Id, row: observed.days[day2Id].assigned[0] }) },
    changes: { v2: { before: null } }, children: [],
  };
  await db`insert into vacation_trip_state_action_receipts (trip_id, request_id, operation_key, record) values (${tripId}, 'req-verified', 'op-1', ${receiptRecord})`;
  const store = createTripStateRevisionStore({ env: {}, pool });
  const verifiedRevision = await store.prepare({
    trip, requestId: 'req-verified', turn: 6, actorId,
    classification: { ok: true, destination: 'Harbor City', hasDates: true, startDate: '2027-04-05', endDate: '2027-04-09', roster: [] },
    text: 'Put Botanical Gardens on Tuesday.',
  });
  assert.ok(verifiedRevision);
  const verifiedState = JSON.parse(verifiedRevision.state_json);
  assert.equal(validate(verifiedState), true, ajv.errorsText(validate.errors));
  assert.equal(verifiedState.last_actions.length, 1);
  assert.equal(tripStateHasMatchingReceipt(verifiedState, { op: 'place_on_day', ref: 'v2' }), true);
  assert.equal(tripStateHasMatchingReceipt(verifiedState, { op: 'hold_invite' }), false);

  const sentinelHistory = Array.from({ length: 12 }, (_, idx) => ({ role: idx % 2 === 0 ? 'customer' : 'app', text: `OLD_TRANSCRIPT_SENTINEL_TURN_${idx + 1}` }));
  const expectedEnabledTools = Object.entries(
    tripStateCapabilities({ env: {}, trip, backing: 'intake', grant: 'owner', locked: false, read: 'current' }).actions,
  ).filter(([, cap]) => cap.enabled).map(([name]) => name).sort();
  assert.deepEqual(expectedEnabledTools, ['add_from_search', 'add_named_item', 'hold_invite', 'place_on_day', 'save_plan', 'set_stay']);

  const chatPayloads = [];
  const jevPayloads = [];
  const verifiedDraft = 'I placed Botanical Gardens on Tuesday at 9:00 AM for your Harbor City vacation, and you can adjust the time anytime.';
  const verifiedResult = await withMockFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    if (new URL(url).pathname.endsWith('/decisions')) {
      jevPayloads.push(body);
      return Response.json({ answers: { overall_quality: { score: 4 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' }, claims_mutation: { noul: 0.95 }, change_claim_grounded: { noul: 0.96 }, route_type: { choice: 'itinerary_advice' }, needs_day_for_note: { noul: 0.05 } } });
    }
    chatPayloads.push(body);
    return Response.json({ model: body.model, choices: [{ message: { content: verifiedDraft } }] });
  }, () => produceLiveAppReply({
    customerTurn: 'Put Botanical Gardens on Tuesday.', session: { trip_id: tripId, customer_id: actorId, display_name: 'Maya' },
    priorTurns: sentinelHistory, trip, tripStateRevision: verifiedRevision, env: OFFLINE_ENV, understanding: BASE_INTENT,
  }));

  assert.equal(verifiedResult.reply, verifiedDraft);
  assert.equal(chatPayloads.length, 1);
  assert.equal(jevPayloads.length, 1);
  const [writerReq, jevReq] = [chatPayloads[0], jevPayloads[0]];
  assert.deepEqual(writerReq.messages.map((m) => m.role), ['system', 'system', 'user']);
  assert.equal(writerReq.messages[2].content, 'Put Botanical Gardens on Tuesday.');
  assert.ok(writerReq.messages[0].content.map((part) => part.text).join('\n').includes(TRIP_STATE_SYSTEM_INSTRUCTION));
  for (const forbidden of ['Saved trip record', 'Seat record', 'Do not say seat', 'BEAT:', 'OLD_TRANSCRIPT_SENTINEL_TURN_', 'recent_turns']) {
    assert.equal(JSON.stringify(writerReq).includes(forbidden), false, `writer leaked ${forbidden}`);
    assert.equal(JSON.stringify(jevReq).includes(forbidden), false, `jev leaked ${forbidden}`);
  }
  const trustedBlockText = writerReq.messages[1].content[0].text;
  assert.equal(trustedBlockText.includes('\n'), false);
  const trustedBlock = JSON.parse(trustedBlockText);
  assert.deepEqual(trustedBlock.pin, jevReq.state.trip_state_pin);
  assert.equal(trustedBlock.pin.trip_id, tripId);
  assert.equal(trustedBlock.pin.revision, verifiedRevision.revision);
  assert.equal(trustedBlock.pin.revision_digest, verifiedRevision.digest);
  assert.equal(sha256(stringifyTripState(trustedBlock.trip_state)), trustedBlock.pin.digest);
  assert.equal(sha256(stringifyTripState(jevReq.state.trip_state)), jevReq.state.trip_state_pin.digest);
  assert.equal(stringifyTripState(trustedBlock.trip_state), stringifyTripState(jevReq.state.trip_state));
  assert.deepEqual(writerReq.tools.map((tool) => tool.function.name).sort(), expectedEnabledTools);

  assert.deepEqual(
    enabledTripStateTools(tripStateCapabilities({ env: {}, trip, backing: 'intake', grant: 'edit', locked: false, read: 'current' })).map((t) => t.function.name),
    ['add_from_search', 'add_named_item', 'place_on_day', 'save_plan', 'set_stay'],
  );
  assert.deepEqual(enabledTripStateTools(tripStateCapabilities({ env: {}, trip, backing: 'intake', grant: 'owner', locked: true, read: 'current' })), []);

  const emptyReceiptRevision = await store.prepare({
    trip, requestId: 'req-no-receipt', turn: 7, actorId, classification: { ok: true, roster: [] },
    text: 'Can you add Sunset Pier to Wednesday?',
  });
  const emptyState = JSON.parse(emptyReceiptRevision.state_json);
  assert.deepEqual(emptyState.last_actions, []);
  assert.equal(tripStateHasMatchingReceipt(emptyState), false);

  const unbackedChatPayloads = [];
  const unbackedJevPayloads = [];
  const falseClaimDraft = 'I just saved Sunset Pier onto Wednesday morning for your vacation.';
  const correctedRewrite = 'Sunset Pier is not on Wednesday yet. I can place it on Wednesday if you want me to go ahead and add it.\nWHAT_I_CHANGED: Removed the unverified save claim and reported the actual trip state.';
  const recoveredResult = await withMockFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    if (new URL(url).pathname.endsWith('/decisions')) {
      unbackedJevPayloads.push(body);
      const isInitial = body.state.draft === falseClaimDraft;
      return Response.json({ answers: { overall_quality: { score: 4 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' }, claims_mutation: { noul: isInitial ? 0.96 : 0.04 }, change_claim_grounded: { noul: isInitial ? 0.96 : 0.98 }, route_type: { choice: 'itinerary_advice' }, needs_day_for_note: { noul: 0.05 } } });
    }
    unbackedChatPayloads.push(body);
    return Response.json({ model: body.model, choices: [{ message: { content: unbackedChatPayloads.length === 1 ? falseClaimDraft : correctedRewrite } }] });
  }, () => produceLiveAppReply({
    customerTurn: 'Can you add Sunset Pier to Wednesday?', session: { trip_id: tripId, customer_id: actorId, display_name: 'Maya' },
    priorTurns: sentinelHistory, trip, tripStateRevision: emptyReceiptRevision, env: OFFLINE_ENV, understanding: BASE_INTENT,
  }));

  assert.equal(unbackedChatPayloads.length, 2);
  assert.equal(unbackedJevPayloads.length, 2);
  assert.equal(recoveredResult.quality.rewritten, true);
  assert.ok(recoveredResult.reply.includes('Sunset Pier is not on Wednesday yet.'));
  const rewriteReq = unbackedChatPayloads[1];
  assert.equal(rewriteReq.tools, undefined);
  assert.ok(rewriteReq.messages[0].content.map((part) => part.text).join('\n').includes(TRIP_STATE_REWRITE_INSTRUCTION));
  const draftPin = JSON.parse(unbackedChatPayloads[0].messages[1].content[0].text).pin;
  assert.deepEqual(JSON.parse(rewriteReq.messages[1].content[0].text).pin, draftPin);
  assert.deepEqual(unbackedJevPayloads[0].state.trip_state_pin, draftPin);
  assert.deepEqual(unbackedJevPayloads[1].state.trip_state_pin, draftPin);

  const stillFalseRewrite = 'I added Sunset Pier to Wednesday afternoon and updated your schedule.\nWHAT_I_CHANGED: Clarified the afternoon timing.';
  const blockedResult = await withMockFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    if (new URL(url).pathname.endsWith('/decisions')) {
      return Response.json({ answers: { overall_quality: { score: 4 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' }, claims_mutation: { noul: 0.95 }, change_claim_grounded: { noul: 0.05 }, route_type: { choice: 'itinerary_advice' }, needs_day_for_note: { noul: 0.05 } } });
    }
    const isRewrite = body.messages[0].content.map((part) => part.text).join('\n').includes(TRIP_STATE_REWRITE_INSTRUCTION);
    return Response.json({ model: body.model, choices: [{ message: { content: isRewrite ? stillFalseRewrite : falseClaimDraft } }] });
  }, () => produceLiveAppReply({
    customerTurn: 'Can you add Sunset Pier to Wednesday?', session: { trip_id: tripId, customer_id: actorId, display_name: 'Maya' },
    priorTurns: sentinelHistory, trip, tripStateRevision: emptyReceiptRevision, env: OFFLINE_ENV, understanding: BASE_INTENT,
  }));
  assert.equal(blockedResult.reply, null);
  assert.equal(blockedResult.reason, 'rewrite_unbacked_change_claim');

  const deferredPin = pinTripStateContext(verifiedRevision, { customerTurn: 'Put Botanical Gardens on Tuesday.' });
  const deferredCalls = [];
  const deferred = await withMockFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    deferredCalls.push({ path: new URL(url).pathname, body });
    if (new URL(url).pathname.endsWith('/decisions')) {
      return Response.json({ answers: { overall_quality: { score: 4 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' }, claims_mutation: { noul: 0.9 }, change_claim_grounded: { noul: 0.95 } } });
    }
    return Response.json({ model: body.model, choices: [{ message: { content: 'Botanical Gardens is placed on Tuesday at 9:00 AM.\nWHAT_I_CHANGED: Reported the verified Tuesday placement.' } }] });
  }, () => finishTierRewrite({
    pending: {
      customerTurn: 'Put Botanical Gardens on Tuesday.', draft: 'I cannot save that from chat.',
      draftModel: 'anthropic/claude-haiku-5.5', draftScore: 1,
      quality: { judged: true, score: 1, scoreRaw: 0, disposition: 'rewrite', jevFocus: 'misses_ask', wantsRewrite: true },
      jev: { jevRan: true, modelTier: 3 }, tripStateContext: deferredPin, failureReason: 'jev fix_focus misses_ask; score 1',
    },
    env: OFFLINE_ENV,
  }));
  assert.equal(deferred.reply, 'Botanical Gardens is placed on Tuesday at 9:00 AM.');
  assert.deepEqual(JSON.parse(deferredCalls[0].body.messages[1].content[0].text).pin, deferredPin.pin);
  assert.deepEqual(deferredCalls[1].body.state.trip_state_pin, deferredPin.pin);
} finally {
  await raw.close();
}

{
  const tripId = 'cbb020d4-a8e4-4bc5-9150-d7712230adfa';
  const actorId = '31606504-cd3e-460d-8fbf-ff35e23a8205';
  const trip = {
    id: tripId, customer_id: actorId, title: 'Harbor Weekend', destination: 'Harbor City',
    start_date: '2027-04-05', end_date: '2027-04-07', status: 'onboarding',
    metadata: { trip_state_actions: true, intakeShare: true },
  };
  let site = { trip, things: [{ id: '10000000-0000-4000-a000-000000000009', category: 'park', title: 'Willow Creek Park', source: 'customer', metadata: {} }], invites: {} };
  const records = new Map();
  const keyOf = (ctx) => `${ctx.requestId}:${ctx.operationKey}`;
  const actionStore = {
    available: true,
    async read(ctx) {
      return ctx.actorId === actorId ? structuredClone({ ...site, record: records.get(keyOf(ctx)) }) : null;
    },
    async transact(ctx, plan) {
      const current = await this.read(ctx);
      if (!current) return null;
      const { next, record } = plan(current);
      if (next) {
        site = { ...site, things: next.things, invites: next.invites };
        records.set(keyOf(ctx), structuredClone(record));
      }
      return record;
    },
  };
  const actions = createTripStateActions({ store: actionStore, env: {} });
  const initialSaved = readTripStateSite(site, null, 2);
  const [itemId] = Object.keys(initialSaved.items);
  const [dayOne] = Object.keys(initialSaved.days);
  const planningState = {
    version: '1.0', trip_id: tripId, updated_turn: 2, revision: 1, phase: 'planning',
    capabilities: tripStateCapabilities({ env: {}, trip, backing: 'intake', grant: 'owner', locked: false, read: 'current' }),
    saved: { ...initialSaved, items: Object.fromEntries(Object.entries(initialSaved.items).map(([id, item]) => [id, { ...item, proposed_by: 'customer' }])), travelers: {} },
    disclosed: { dest: { kind: 'destination', value: 'Harbor City', turn: 2 } },
    candidates: {}, research: { key: null, state: 'waiting', turn: 2, areas: [], gaps: [] },
    proposals: {}, open_asks: [], answered: [], said: [], last_actions: [], tool_status: [],
    next_steps: [{ kind: 'act', task: 'Place Willow Creek Park on day one.', refs: [itemId, dayOne] }],
    scope: { mode: 'full', omitted: {} }, updates: [{ section: 'saved', source: 'site_read', turn: 2 }],
  };
  assert.equal(validate(planningState), true, ajv.errorsText(validate.errors));
  const toolPayloads = [];
  const toolJevPayloads = [];
  const toolResult = await withMockFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    if (new URL(url).pathname.endsWith('/decisions')) {
      toolJevPayloads.push(body);
      return Response.json({ answers: { overall_quality: { score: 5 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' }, claims_mutation: { noul: 0.96 }, change_claim_grounded: { noul: 0.99 }, route_type: { choice: 'itinerary_advice' }, needs_day_for_note: { noul: 0.05 } } });
    }
    toolPayloads.push(body);
    if (toolPayloads.length === 1) {
      return Response.json({
        model: body.model,
        choices: [{ message: { content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'place_on_day', arguments: JSON.stringify({ item: itemId, day: dayOne, role: 'visit', time: { value: '09:30', precision: 'proposed' } }) } }] } }],
      });
    }
    return Response.json({ model: body.model, choices: [{ message: { content: 'I placed Willow Creek Park on Monday at 9:30 AM as a first pass, and you can move or change it anytime.' } }] });
  }, () => produceLiveAppReply({
    customerTurn: 'Go ahead and take a shot at Monday with Willow Creek Park.',
    session: { trip_id: tripId, customer_id: actorId, display_name: 'Maya' }, priorTurns: [], trip,
    tripStateRevision: planningState, tripStateActions: actions,
    tripStateActionContext: {
      trip, tripId, actorId, requestId: 'req-tool', operationKey: 'plan', turn: 3,
      customerText: 'Go ahead and take a shot at Monday with Willow Creek Park.',
      authority: { source: 'system_plan', id: 'first-pass' },
    },
    env: OFFLINE_ENV, understanding: BASE_INTENT,
  }));

  assert.equal(toolPayloads.length, 2);
  assert.ok(toolPayloads[0].tools.some((tool) => tool.function.name === 'place_on_day'));
  assert.equal(toolPayloads[1].tools, undefined);
  const writerBlock = JSON.parse(toolPayloads[1].messages[1].content[0].text);
  assert.equal(writerBlock.trip_state.phase, 'reply_ready');
  assert.equal(writerBlock.trip_state.last_actions.length, 1);
  assert.equal(writerBlock.trip_state.last_actions[0].op, 'place_on_day');
  assert.deepEqual(writerBlock.pin, toolJevPayloads[0].state.trip_state_pin);
  assert.equal(toolResult.reply, 'I placed Willow Creek Park on Monday at 9:30 AM as a first pass, and you can move or change it anytime.');
}

{
  const bigState = {
    version: '1.0', trip_id: 'trip-budget', updated_turn: 20, revision: 12, phase: 'reply_ready',
    capabilities: tripStateCapabilities({ env: { VK_TRIP_STATE_ACTIONS: 'true' }, backing: 'intake', grant: 'owner', locked: false, read: 'current' }),
    saved: {
      site_revision: 'site-20', read: 'current',
      trip: { title: 'Coast Trip', destination: 'Harbor City', start: '2027-04-05', end: '2027-04-09', via: 'intake', turn: 2 },
      days: {
        d1: { date: '2027-04-05', assigned: [{ id: 'a1', item: 'i1', type: 'park', role: 'visit', time: { value: '09:00', precision: 'proposed' }, via: 'chat_action', turn: 6, proposed_by: 'system' }], via: 'intake', turn: 2 },
        d2: {
          date: '2027-04-06',
          assigned: [
            { id: 'a2', item: 'i2', type: 'park', role: 'visit', time: { value: '09:00', precision: 'exact' }, via: 'chat_action', turn: 6, proposed_by: 'customer' },
            { id: 'a3', item: 'i3', type: 'meal', role: 'visit', time: { value: '12:30', precision: 'proposed' }, via: 'chat_action', turn: 6, proposed_by: 'system' },
          ],
          via: 'intake', turn: 2,
        },
        d3: { date: '2027-04-07', assigned: [{ id: 'a4', item: 'i4', type: 'activity', role: 'visit', time: null, via: 'chat_action', turn: 6, proposed_by: 'system' }], via: 'intake', turn: 2 },
      },
      items: {
        i1: { title: 'North Pier', type: 'park', basis: 'named', via: 'customer_named', turn: 4, proposed_by: 'customer' },
        i2: { title: 'Botanical Gardens', type: 'park', basis: 'named', via: 'customer_named', turn: 4, proposed_by: 'customer' },
        i3: { title: 'Harbor Cafe Lunch', type: 'meal', basis: 'plan_block', via: 'chat_action', turn: 6, proposed_by: 'system' },
        i4: { title: 'Kayak Cove', type: 'activity', basis: 'named', via: 'customer_named', turn: 6, proposed_by: 'customer' },
      },
      unassigned: [], lodging: {}, flights: {}, ground: {}, travelers: {}, collaborators: {}, invites: {},
    },
    disclosed: { dest: { kind: 'destination', value: 'Harbor City', turn: 2 }, pref1: { kind: 'preference', value: 'Prefers calm mornings near the water with shade and benches.', turn: 4 } },
    candidates: Object.fromEntries(Array.from({ length: 12 }, (_, idx) => [`cand-${idx + 1}`, { type: 'restaurant', title: `Harbor Option ${idx + 1}`, area: 'Harbor City', source: 'vk_search', result_id: `res-${idx + 1}`, turn: 3 + idx, facts: ['kid-friendly', 'near waterfront'] }])),
    research: { key: 'harbor-v1', state: 'complete', turn: 3, areas: ['Harbor City'], gaps: [] },
    proposals: { oldProp: { status: 'superseded', turn: 3, lines: [{ day: 'd1', type: 'park', label: 'North Pier', item: 'i1', time: null, role: 'visit' }] } },
    open_asks: [{ id: 'ask-tue', text: 'Check Tuesday lunch time', first_turn: 18, status: 'open', outcome: null, turn: 20, refs: ['d2'] }],
    answered: Array.from({ length: 6 }, (_, idx) => ({ id: `ans-${idx + 1}`, text: `Earlier resolved ask ${idx + 1}`, first_turn: 2, status: 'done', outcome: 'Confirmed on site.', turn: 4 + idx, refs: ['d1'] })),
    said: Array.from({ length: 6 }, (_, idx) => ({ topic: `topic-${idx + 1}`, meaning: `Previously explained topic ${idx + 1} in detail.`, turn: 2 + idx })),
    last_actions: [{ op: 'place_on_day', receipt: 'r-keep', refs: ['a2'], turn: 20 }],
    tool_status: [{ op: 'place_on_day', receipt: 'r-keep', result: 'applied', detail: 'Verified Botanical Gardens on Tuesday.', refs: ['a2'], turn: 20 }],
    next_steps: [{ kind: 'answer', task: 'Confirm Tuesday schedule.', refs: ['d2', 'a2'] }],
    scope: { mode: 'full', omitted: {} }, updates: [{ section: 'saved', source: 'site_read', turn: 20 }],
  };
  assert.equal(validate(bigState), true, ajv.errorsText(validate.errors));
  assert.equal(TRIP_STATE_TARGET_TOKENS, 2400);
  assert.equal(TRIP_STATE_MAX_TOKENS, 4800);
  const fullTokens = estimateTripStateTokens(stringifyTripState(bigState));
  const bounded = selectBoundedTripState(bigState, { customerTurn: 'How does Tuesday look?', targetTokens: Math.floor(fullTokens * 0.65), maxTokens: fullTokens });
  assert.equal(validate(bounded), true, ajv.errorsText(validate.errors));
  assert.equal(bounded.scope.mode, 'focus');
  assert.ok(Object.keys(bounded.scope.omitted).length >= 1);
  assert.equal(bounded.saved.days.d2.assigned.length, 2);
  assert.ok(bounded.saved.items.i2 && bounded.saved.items.i3);
  assert.deepEqual(bounded.last_actions, bigState.last_actions);
  assert.deepEqual(bounded.tool_status, bigState.tool_status);
  assert.ok(estimateTripStateTokens(stringifyTripState(bounded)) < fullTokens);
}

console.log('Trip State model context tests passed.');
