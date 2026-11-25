#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachIntakeItineraryFromReply } from '../routes/vacation-itinerary.mjs';
import { queueVacationAppTurn } from '../routes/vacation-app-chat-queue.mjs';
import { PLANNING_ERROR_REPLY, plannedItineraryItems } from '../src/vacation/chat-plan-persist.mjs';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import {
  DEFAULT_JEV_DECISIONS_URL,
  TIERED_REPLY_TIMEOUT_MS,
  callTieredModel,
} from './vacation-app-reply-rules.mjs';
import {
  openRouterShouldCompactRetry,
  openRouterTierReplyTimeoutMs,
} from './openrouter-tier-provider.mjs';

const r6Fixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/harness/lopez-r6-dialog-transcript.redacted.json', import.meta.url), 'utf8'),
);
const priorTurns = r6Fixture.turns
  .filter((turn) => turn.turnIndex <= 5)
  .map((turn) => ({ role: turn.role, text: turn.text, intake: turn.intake === true }));
const turn6 = r6Fixture.turns.find((turn) => turn.turnIndex === 6 && turn.role === 'customer');
assert.ok(turn6 && turn6.text.includes("Disney's Pop Century Resort"));

assert.equal(TIERED_REPLY_TIMEOUT_MS, 20000);
assert.ok(openRouterTierReplyTimeoutMs(4, 0, TIERED_REPLY_TIMEOUT_MS) >= 35000);
assert.equal(openRouterTierReplyTimeoutMs(3, 0, TIERED_REPLY_TIMEOUT_MS), 20000);
assert.equal(openRouterTierReplyTimeoutMs(4, 28000, TIERED_REPLY_TIMEOUT_MS), 28000);
assert.equal(
  openRouterShouldCompactRetry({ modelTier: 4, tier1CompactReasoning: false, result: { called: false, reason: 'The operation was aborted due to timeout' } }),
  true,
);
assert.equal(
  openRouterShouldCompactRetry({ modelTier: 4, tier1CompactReasoning: false, result: { called: false, reason: 'tiered model returned an empty reply' } }),
  true,
);
assert.equal(
  openRouterShouldCompactRetry({ modelTier: 4, tier1CompactReasoning: true, result: { called: false, reason: 'The operation was aborted due to timeout' } }),
  false,
);
assert.equal(
  openRouterShouldCompactRetry({ modelTier: 4, tier1CompactReasoning: false, result: { called: false, reason: 'model_not_in_bakeoff_map' } }),
  false,
);

const ORLANDO_PLAN_REPLY = [
  "Here's your relaxed five-day Orlando family plan for Sofia Lopez, Mateo Lopez, Leo Lopez, and Lily Lopez from Monday, April 5 through Friday, April 9, 2027, balancing morning parks with pool breaks.",
  "Monday, April 5: Check in at Disney's Pop Century Resort, Afternoon pool break",
  'Tuesday, April 6: Magic Kingdom, Afternoon resort swim',
  'Wednesday, April 7: Resort Pool Day',
  'Thursday, April 8: Animal Kingdom, Quiet family dinner',
  'Friday, April 9: Check-out from Pop Century Resort',
  'With edit access, collaborators can add notes and help update the vacation once they approve an email invite, while view access lets them look at the plans and photos without signing in.',
  'BEAT: Built Orlando five-day plan',
].join('\n');

const weekdayItems = plannedItineraryItems(ORLANDO_PLAN_REPLY, { startDate: '2027-04-05' });
assert.ok(weekdayItems.some((item) => /Magic Kingdom/i.test(item.title) && item.dayNumber === 2 && item.customerWhen === '2027-04-06'));
assert.ok(weekdayItems.some((item) => /Resort Pool Day/i.test(item.title) && item.dayNumber === 3 && item.customerWhen === '2027-04-07'));
assert.ok(weekdayItems.some((item) => /Animal Kingdom/i.test(item.title) && item.dayNumber === 4 && item.customerWhen === '2027-04-08'));

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

const session = {
  id: 'sess-lopez-r6',
  token: 'tok-lopez-r6',
  customer_id: 'cust-lopez-r6',
  trip_id: 'trip-lopez-r6',
  first_name: 'Sofia',
  last_name: 'Lopez',
  display_name: 'Sofia Lopez',
  metadata: { replyBackend: 'vk_bot_mcp' },
};

const savedTrip = {
  destination: 'Orlando, FL',
  start: '2027-04-05',
  end: '2027-04-09',
  things: [],
  party: {
    primary: { name: 'Sofia Lopez', role: 'Owner' },
    collaborators: [{ name: 'Mateo Lopez', payer: 'owner' }],
    preference_subjects: [
      { name: 'Leo Lopez', age: 6 },
      { name: 'Lily Lopez', age: 9 },
    ],
    viewers: [],
    editors: [],
  },
};

const env = {
  OPENROUTER_API_KEY: 'test-key-offline',
  TIMESYNCHER_JEV_CLASSIFY_URL: DEFAULT_JEV_DECISIONS_URL,
};

const originalFetch = globalThis.fetch;

async function runScenario(tier4FailureMode) {
  const chatRequests = [];
  let chatAttempt = 0;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const body = JSON.parse(String(init.body || '{}'));
    if (href.includes('/api/alpha/decisions')) {
      if (body.questions?.model_tier) {
        return jsonResponse({
          answers: {
            model_tier: { score: 2.55, confidence: 0.54 },
            route_type: { choice: 'itinerary_advice' },
            needs_day_for_note: { noul: 0.26 },
          },
        });
      }
      if (body.questions?.overall_quality) {
        return jsonResponse({
          answers: {
            overall_quality: { score: 3.6 },
            disposition: { choice: 'keep' },
            fix_focus: { choice: 'keep' },
          },
        });
      }
    }
    if (href.includes('/api/v1/chat/completions')) {
      const sys = String(body.messages?.[0]?.content || '');
      if (sys.includes('Return one JSON object. Do not write a customer reply.')) {
        return jsonResponse({
          model: 'anthropic/claude-haiku-5.5',
          choices: [{ message: { content: JSON.stringify({ asksPrice: false, asksAccess: true, pullsAccess: false, seats: [], ask: false }) } }],
        });
      }
      chatRequests.push(body);
      chatAttempt += 1;
      if (chatAttempt === 1) {
        assert.deepEqual(body.reasoning, { effort: 'high' });
        assert.equal(body.max_tokens, 6144);
        if (tier4FailureMode === 'timeout') {
          const timeoutErr = new Error('The operation was aborted due to timeout');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        }
        return jsonResponse({
          model: 'anthropic/claude-haiku-5.5',
          choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'deep chain of thought that filled max_tokens' } }],
          usage: { prompt_tokens: 4800, completion_tokens: 6144, total_tokens: 10944, cost: 0.0035 },
        });
      }
      if (chatAttempt === 2) {
        assert.deepEqual(body.reasoning, { enabled: false, effort: 'low' });
        assert.equal(body.max_tokens, 900);
      }
      return jsonResponse({
        model: 'anthropic/claude-haiku-5.5',
        choices: [{ finish_reason: 'stop', message: { content: ORLANDO_PLAN_REPLY } }],
        usage: { prompt_tokens: 4800, completion_tokens: 210, total_tokens: 5010, cost: 0.000585 },
      });
    }
    throw new Error(`Unexpected fetch URL in offline test: ${href}`);
  };
  try {
    const produced = await produceLiveAppReply({
      customerTurn: turn6.text,
      session,
      priorTurns,
      tripTitle: 'Orlando family vacation',
      env,
      loadSavedTripRecordFn: async () => savedTrip,
      loadOwnerPlan: async () => ({ checkout_plan: 'single', plan_id: 'single', plan_name: 'Single Vacation', order_bump_owned: false }),
    });
    return { produced, chatRequests };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

for (const mode of ['timeout', 'empty-reasoning']) {
  const { produced, chatRequests } = await runScenario(mode);
  assert.ok(chatRequests.length >= 2, `${mode}: expected tier-4 attempt + compact retry`);
  assert.deepEqual(chatRequests[0].reasoning, { effort: 'high' });
  assert.equal(chatRequests[0].max_tokens, 6144);
  assert.deepEqual(chatRequests[1].reasoning, { enabled: false, effort: 'low' });
  assert.equal(chatRequests[1].max_tokens, 900);
  assert.equal(produced.jev?.modelTier, 4, `${mode}: tier 4 preserved`);
  assert.equal(produced.jev?.routeType, 'itinerary_advice');
  assert.equal(produced.model?.called, true, `${mode}: model called`);
  assert.equal(produced.model?.modelTier, 4);
  assert.ok(produced.reply && produced.reply.length > 80, `${mode}: real reply produced`);
  assert.notEqual(produced.reply, PLANNING_ERROR_REPLY, `${mode}: must not fall back to PLANNING_ERROR_REPLY`);
  assert.match(produced.reply, /Magic Kingdom/i);
  assert.match(produced.reply, /Animal Kingdom/i);
  assert.equal(produced.quality?.judged, true);
  assert.notEqual(produced.quality?.disposition, 'planning_error_stored');
}

function makeQueueDb() {
  const insertedAppTurns = [];
  const savedThings = [];
  const db = async (strings, ...values) => {
    const query = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (/select count\(\*\)::int as n/i.test(query) && /from transcript_turns/i.test(query)) return [{ n: 5, started_at: '2026-11-25T05:15:04.024Z' }];
    if (/select speaker, body, payload/i.test(query) && /from transcript_turns/i.test(query)) {
      return [...priorTurns].reverse().map((turn) => ({
        speaker: turn.role === 'app' ? 'app' : 'customer',
        body: turn.text,
        payload: { liveTranscript: { role: turn.role, intake: turn.intake } },
      }));
    }
    if (/select id, body/i.test(query) && /from transcript_turns/i.test(query)) return [];
    if (/insert into vacation_requests/i.test(query)) return [{ id: 'req-r6-t6', received_at: '2026-11-25T05:17:23.923Z', queued_at: '2026-11-25T05:17:23.923Z' }];
    if (/insert into transcript_turns/i.test(query) && /returning id/i.test(query)) return [{ id: 'turn-r6-cust-6' }];
    if (/insert into transcript_turns/i.test(query)) {
      insertedAppTurns.push({ body: values[3], payload: values[4] });
      return [];
    }
    if (/insert into worker_jobs/i.test(query)) return [{ id: 'job-r6-6' }];
    if (/select start_date, end_date/i.test(query) && /from trips/i.test(query)) return [{ start_date: '2027-04-05', end_date: '2027-04-09' }];
    if (/select metadata from trips/i.test(query)) return [{ metadata: { dialogParty: savedTrip.party } }];
    if (/select destination, metadata from trips/i.test(query)) return [{ destination: 'Orlando, FL', metadata: { dialogParty: savedTrip.party } }];
    if (/select id, title, destination/i.test(query) && /from trips/i.test(query)) {
      return [{ id: 'trip-lopez-r6', title: 'Orlando family vacation', destination: 'Orlando, FL', start_date: '2027-04-05', end_date: '2027-04-09', status: 'planning', metadata: { dialogParty: savedTrip.party } }];
    }
    if (/select id, category, title, description, metadata, location/i.test(query) && /from trip_things/i.test(query)) return savedThings;
    if (/insert into trip_things/i.test(query)) {
      const id = `thing-${savedThings.length + 1}`;
      savedThings.push({ id, category: values[2] || 'activity', title: values[4] || '', description: '', metadata: {}, location: {} });
      return [{ id }];
    }
    if (/select count\(\*\)::int as n from trip_things/i.test(query)) return [{ n: savedThings.length }];
    return [];
  };
  return { db, insertedAppTurns, savedThings };
}

const savedEnv = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  TIMESYNCHER_JEV_CLASSIFY_URL: process.env.TIMESYNCHER_JEV_CLASSIFY_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.OPENROUTER_API_KEY = 'test-key-offline';
process.env.TIMESYNCHER_JEV_CLASSIFY_URL = DEFAULT_JEV_DECISIONS_URL;
delete process.env.DATABASE_URL;

try {
  const { db, insertedAppTurns, savedThings } = makeQueueDb();
  let queueChatAttempt = 0;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const body = JSON.parse(String(init.body || '{}'));
    if (href.includes('/api/alpha/decisions')) {
      if (body.questions?.model_tier) {
        return jsonResponse({
          answers: {
            model_tier: { score: 2.55, confidence: 0.54 },
            route_type: { choice: 'itinerary_advice' },
            needs_day_for_note: { noul: 0.26 },
          },
        });
      }
      return jsonResponse({
        answers: {
          overall_quality: { score: 3.8 },
          disposition: { choice: 'keep' },
          fix_focus: { choice: 'keep' },
        },
      });
    }
    if (href.includes('/api/v1/chat/completions')) {
      const sys = String(body.messages?.[0]?.content || '');
      if (sys.includes('Return one JSON object. Do not write a customer reply.')) {
        return jsonResponse({
          model: 'anthropic/claude-haiku-5.5',
          choices: [{ message: { content: JSON.stringify({ asksPrice: false, asksAccess: true, pullsAccess: false, seats: [], ask: false }) } }],
        });
      }
      queueChatAttempt += 1;
      if (queueChatAttempt === 1) {
        const timeoutErr = new Error('The operation was aborted due to timeout');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }
      return jsonResponse({
        model: 'anthropic/claude-haiku-5.5',
        choices: [{ finish_reason: 'stop', message: { content: ORLANDO_PLAN_REPLY } }],
        usage: { prompt_tokens: 4800, completion_tokens: 210, total_tokens: 5010, cost: 0.000585 },
      });
    }
    throw new Error(`Unexpected fetch URL in queue test: ${href}`);
  };
  const queued = await queueVacationAppTurn(
    db,
    session,
    { id: 'trip-lopez-r6', title: 'Orlando family vacation', destination: 'Orlando, FL', start_date: '2027-04-05', end_date: '2027-04-09', status: 'planning', metadata: { dialogParty: savedTrip.party } },
    { text: turn6.text },
    {
      recordCustomerThingNotes: (conn, tripId, reqText, opts, intakeText, extracted) => attachIntakeItineraryFromReply(
        conn,
        tripId,
        reqText,
        {
          ...opts,
          searchPlacesImpl: async () => {
            const err = new Error('Brave Place Search failed: HTTP 402 {"error":{"status":402,"detail":"Prepaid credit balance is insufficient"}}');
            err.providers = [{ provider: 'brave', status: 'error', reason: 'HTTP 402' }];
            throw err;
          },
        },
        intakeText,
        extracted,
      ),
      publishIntakeShare: async () => {},
      vacationAppTripSummary: (row) => row,
    },
    {
      requestText: turn6.text,
      classification: {
        ok: true,
        intake: true,
        turnKind: 'trip_intake',
        destination: 'Orlando, FL',
        hasDates: true,
        startDate: '2027-04-05',
        endDate: '2027-04-09',
        title: 'Orlando family vacation',
        things: [{ title: "Disney's Pop Century Resort", kind: 'hotel' }],
        roster: [
          { name: 'Sofia Lopez', role: 'owner' },
          { name: 'Mateo Lopez', role: 'collaborator' },
          { name: 'Leo Lopez', role: 'child' },
          { name: 'Lily Lopez', role: 'child' },
        ],
        routerModel: 'typesafe/jev-1.13',
      },
      placeSearchTurn: false,
      webResearchTurn: false,
    },
  );
  assert.equal(queued.ok, true, `expected queued.ok=true, got ${JSON.stringify(queued)}`);
  assert.equal(queued.status, 'replied');
  assert.notEqual(queued.reply, PLANNING_ERROR_REPLY);
  assert.match(queued.reply, /Magic Kingdom/i);
  assert.equal(insertedAppTurns.length, 1);
  assert.equal(insertedAppTurns[0].body, queued.reply);
  assert.ok(savedThings.length >= 3, `expected planned itinerary items persisted even after Brave 402, got ${savedThings.length}`);
  assert.ok(savedThings.some((thing) => /Magic Kingdom/i.test(thing.title)));
  assert.ok(savedThings.some((thing) => /Animal Kingdom/i.test(thing.title)));

  let nonRetryCalls = 0;
  globalThis.fetch = async () => {
    nonRetryCalls += 1;
    return jsonResponse({ model: 'qwen/qwen3-max', choices: [{ message: { content: 'wrong model' } }] });
  };
  const refused = await callTieredModel({
    rules: {},
    jev: { jevRan: true, modelTier: 4 },
    customerTurn: turn6.text,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination: 'Orlando, FL',
    memory: priorTurns,
    upsell: 'forbidden',
    env,
  });
  assert.equal(refused.called, false);
  assert.equal(refused.reason, 'model_not_in_bakeoff_map');
  assert.equal(nonRetryCalls, 1);
} finally {
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

console.log('test_lopez_r6_planning_fallback: ok');
