#!/usr/bin/env node
/**
 * Route path for D-d2. vacation-itinerary.mjs maps any queued.ok false to HTTP 502
 * (`const postStatus = queued.ok ? (selected ? 201 : 200) : 502`).
 * Before the rewrite, a draft that trips replyActionClaimReason came back from
 * blockVacationAppReplyActionClaim as ok false, status reply_unavailable, reply null.
 * This drives queueVacationAppTurn (the handler's queue) with a stubbed model:
 * the first customer reply is an unbacked collaborator claim, and the same-tier
 * rewrite must replace it with a non-empty model reply. Never 502.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queueVacationAppTurnForTests } from '../routes/vacation-itinerary.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';

const TRIP_ID = 'd3e19eb8-56c4-45a3-8cf0-008b99b9366e';
const TURN_ID = '95db8a4a-8a91-4d3b-8f3d-f8a4766db2c8';
const CUSTOMER = 'save Paia Fish Market';
const BLOCKED = "I'll go ahead and add your wife as a collaborator on the trip.";
const CLEAN = 'Paia Fish Market Restaurant is saved and not on a day yet.';

const savedEnv = {};
for (const key of ['DATABASE_URL', 'OPENROUTER_API_KEY', ...Object.keys(testPlanEnv)]) {
  savedEnv[key] = process.env[key];
}
delete process.env.DATABASE_URL;
Object.assign(process.env, testPlanEnv, { OPENROUTER_API_KEY: 'test-key' });

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

const state = { chats: [] };

function db(strings) {
  const text = sqlText(strings);
  if (/welcomeAudience/.test(text) && /select id/.test(text)) return [{ id: 'welcome-1' }];
  if (/count\(\*\)/.test(text) && /trip_things/.test(text)) return [{ n: 0 }];
  if (/count\(\*\)/.test(text)) return [{ n: 1, started_at: '2026-10-01T00:00:00.000Z' }];
  if (/select speaker, body, payload/.test(text)) {
    return [{
      speaker: 'customer',
      body: 'Maui March 10-17 2027 with my wife',
      payload: { liveTranscript: { intake: true, role: 'customer', text: 'Maui March 10-17 2027 with my wife' } },
    }];
  }
  if (/insert into vacation_requests/i.test(text)) {
    return [{ id: '8c7a9304-0000-4000-8000-000000000001', received_at: '2026-10-03T12:25:29.000Z', queued_at: '2026-10-03T12:25:29.000Z' }];
  }
  if (/insert into transcript_turns/i.test(text)) return [{ id: TURN_ID }];
  if (/insert into worker_jobs/i.test(text)) return [{ id: 'job-d2' }];
  if (/from entitlements/i.test(text)) {
    return [{
      plan: 'single',
      status: 'active',
      trip_id: TRIP_ID,
      metadata: { product: 'timesyncher_vacation_single' },
    }];
  }
  if (/from trips/i.test(text) && /select/i.test(text)) {
    return [{
      id: TRIP_ID,
      title: 'Maui',
      destination: 'Maui',
      start_date: '2027-03-10',
      end_date: '2027-03-17',
      status: 'onboarding',
      metadata: {},
    }];
  }
  return [];
}

function jsonResponse(body, model) {
  return {
    ok: true,
    json: async () => (model ? { ...body, model } : body),
  };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = String(url);
  const body = init?.body ? JSON.parse(init.body) : {};
  if (target.includes('/api/alpha/decisions')) {
    const questions = body.questions || {};
    if (questions.trip_intake) return jsonResponse({ ok: true, answers: { trip_intake: { noul: 0.95 } } });
    if (questions.overall_quality) return jsonResponse({ ok: true, answers: {} });
    if (questions.model_tier) {
      return jsonResponse({
        ok: true,
        answers: {
          model_tier: { score: 1 },
          route_type: { choice: 'general' },
          needs_day_for_note: { noul: 0.1 },
        },
      });
    }
    return jsonResponse({ ok: true, answers: {} });
  }
  if (target.includes('/chat/completions')) {
    const blob = JSON.stringify(body.messages || []);
    state.chats.push(blob);
    const model = body.model;
    if (blob.includes('Do not write a customer reply')) {
      return jsonResponse({
        choices: [{ message: { content: '{"asksPrice":false,"asksAccess":false,"pullsAccess":false,"seats":[],"ask":false}' } }],
      }, model);
    }
    if (blob.includes('Return JSON only') || blob.includes('turnKind')) {
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({
          turnKind: 'trip_intake',
          target: '',
          anchor: '',
          anchorIsLodging: false,
          category: '',
          targetKind: '',
          question: '',
          things: [],
          roster: [],
          inviteeName: '',
          inviteeEmail: '',
          destination: 'Maui',
          hasDates: true,
          startDate: '2027-03-10',
          endDate: '2027-03-17',
          title: 'Maui',
        }) } }],
      }, model);
    }
    if (blob.includes('Fact-check flags') || blob.includes('Rewrite the draft')) {
      return jsonResponse({ choices: [{ message: { content: CLEAN } }] }, model);
    }
    return jsonResponse({ choices: [{ message: { content: BLOCKED } }] }, model);
  }
  throw new Error(`unexpected ${target}`);
};

const logs = [];
const originalError = console.error;
console.error = (...args) => {
  logs.push(args.map((part) => String(part)).join(' '));
  originalError(...args);
};

let queued;
try {
  queued = await queueVacationAppTurnForTests(db, {
    id: 'session-d2',
    token: 'tok-d2',
    customer_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    trip_id: TRIP_ID,
    order_id: '22222222-3333-4444-8555-666666666666',
    first_name: 'D',
    last_name: 'Trip',
    display_name: 'D Trip',
  }, {
    id: TRIP_ID,
    title: 'Maui',
    destination: 'Maui',
  }, { text: CUSTOMER });
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

const route = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(route, /const postStatus = queued\.ok \? \(selected \? 201 : 200\) : 502/);
const postStatus = queued.ok ? 201 : 502;
assert.equal(postStatus, 201);
assert.equal(queued.ok, true);
assert.equal(queued.reply, CLEAN);
assert.notEqual(queued.status, 'reply_unavailable');
assert.equal(String(queued.reply || '').trim().length > 0, true);
assert.equal(state.chats.some((blob) => blob.includes('reply_action_claim_unbacked')), true);
assert.equal(logs.some((line) => line.includes(TURN_ID) && line.includes(BLOCKED)), true);

console.log(JSON.stringify({
  ok: true,
  checked: 'reply-action-claim-d2-paia-save-route',
  postStatus,
  reply: queued.reply,
}));
