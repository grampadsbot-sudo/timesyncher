import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ensureOnboardingOpener,
  queueVacationAppTurnForTests,
  useVacationAppDatabase,
} from '../routes/vacation-itinerary.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { welcomeBeforeFirstTurn } from '../.cursor/skills/verify-timesyncher-vacation/scripts/onboarding-welcome-precheck.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';

const api = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(api, /if \(eula\.accepted && !seatFromSession\(session\)\)/);
assert.match(api, /await ensureOnboardingOpener\(db, session, selected \|\| null\)/);
assert.match(api, /insert into vacation_onboarding_welcomes/);
assert.match(api, /on conflict do nothing/);
assert.doesNotMatch(api, /ensureOwnerShellTrip/);

const templates = JSON.parse(await readFile(new URL('../content/onboarding-welcome.json', import.meta.url), 'utf8'));
const firstName = 'leaabc12';
const welcomeText = renderOnboardingWelcome({ audience: 'owner_no_site', firstName });
assert.equal(welcomeText, templates.owner_no_site.replace('{firstName}', firstName));
assert.match(welcomeText, /hold the mic button/i);
assert.doesNotMatch(welcomeText, /https?:\/\//);

const session = {
  id: 'session-1',
  customer_id: 'owner-1',
  trip_id: null,
  order_id: 'order-1',
  first_name: firstName,
  display_name: firstName,
  metadata: {},
};

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function createWelcomeDb(state) {
  const claimKey = (sessionId, welcomeFor, tripId) => `${sessionId}|${welcomeFor}|${tripId ?? ''}`;
  return async (strings, ...values) => {
    const text = sqlText(strings);
    if (/insert into vacation_onboarding_welcomes/i.test(text)) {
      const sessionId = values[0];
      const welcomeFor = values[1];
      const tripId = values[2];
      const key = claimKey(sessionId, welcomeFor, tripId);
      if (state.welcomeClaims.has(key)) return [];
      state.welcomeClaims.add(key);
      return [{ id: 'welcome-claim-1' }];
    }
    if (/insert into transcript_turns/i.test(text)) {
      const payload = values.find((v) => v && typeof v === 'object' && v.liveTranscript);
      if (payload?.liveTranscript?.jev?.reason === 'fixed_onboarding_opener') {
        state.welcomeTurns.push(payload);
        return [{ id: `welcome-turn-${state.welcomeTurns.length}` }];
      }
      state.transcriptTurns.push({ id: `turn-${state.transcriptTurns.length + 1}` });
      return [{ id: state.transcriptTurns.at(-1).id }];
    }
    if (/from customers/i.test(text)) return [{ first_name: firstName, display_name: firstName }];
    if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) {
      const welcomeCount = state.welcomeTurns.length;
      return [{ n: welcomeCount + state.transcriptTurns.length, started_at: new Date().toISOString() }];
    }
    if (/from transcript_turns/i.test(text) && /payload->'liveTranscript'/i.test(text)) {
      return state.welcomeTurns.map((payload) => ({
        speaker: 'app',
        body: payload.liveTranscript.text,
        payload,
      }));
    }
    if (/insert into vacation_requests/i.test(text)) {
      return [{ id: 'req-1', received_at: new Date().toISOString(), queued_at: new Date().toISOString() }];
    }
    if (/insert into vacation_request_events/i.test(text)) return [];
    if (/insert into worker_jobs/i.test(text)) return [{ id: 'job-1' }];
    if (/update transcript_turns/i.test(text)) return [];
    if (/update worker_jobs/i.test(text)) return [];
    if (/from entitlements/i.test(text)) {
      return [{
        plan: 'single',
        status: 'active',
        metadata: { product: 'timesyncher_vacation_single' },
      }];
    }
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected ${text.slice(0, 200)}`);
  };
}

const state = {
  welcomeClaims: new Set(),
  welcomeTurns: [],
  transcriptTurns: [],
  logs: [],
};
const db = createWelcomeDb(state);
const originalLog = console.log;
console.log = (...args) => {
  state.logs.push(args.map((item) => String(item)).join(' '));
};

try {
  // (a) GET after EULA, then POST "hi" path: exactly one welcome row.
  await ensureOnboardingOpener(db, session, null, {});
  await ensureOnboardingOpener(db, session, null, {});

  assert.equal(state.welcomeTurns.length, 1);
  assert.equal(state.welcomeTurns[0].welcomeAudience, 'owner');
  assert.equal(state.welcomeTurns[0].selectedTripId, null);
  assert.equal(state.welcomeTurns[0].liveTranscript.text, welcomeText);
  assert.equal(state.welcomeTurns[0].liveTranscript.jev.reason, 'fixed_onboarding_opener');

  const cannedLogsAfterLanding = state.logs
    .map((line) => JSON.parse(line))
    .filter((row) => row.event === 'canned_welcome');
  assert.equal(cannedLogsAfterLanding.length, 1);
  assert.equal(cannedLogsAfterLanding[0].tripId, null);
  assert.equal(cannedLogsAfterLanding[0].welcomeAudience, 'owner');

  // (b) Two concurrent ensureOnboardingOpener calls for the same session: one row, one log.
  const concurrentState = {
    welcomeClaims: new Set(),
    welcomeTurns: [],
    transcriptTurns: [],
    logs: [],
  };
  const concurrentDb = createWelcomeDb(concurrentState);
  const concurrentSession = {
    ...session,
    id: 'session-concurrent',
    customer_id: 'owner-concurrent',
  };
  const concurrentLog = [];
  console.log = (...args) => {
    concurrentLog.push(args.map((item) => String(item)).join(' '));
  };
  await Promise.all([
    ensureOnboardingOpener(concurrentDb, concurrentSession, null, {}),
    ensureOnboardingOpener(concurrentDb, concurrentSession, null, {}),
  ]);
  assert.equal(concurrentState.welcomeTurns.length, 1);
  const concurrentCanned = concurrentLog
    .map((line) => JSON.parse(line))
    .filter((row) => row.event === 'canned_welcome');
  assert.equal(concurrentCanned.length, 1);

  // (c) Conflict path does not throw; reply to "hi" still goes out.
  console.log = (...args) => {
    state.logs.push(args.map((item) => String(item)).join(' '));
  };
  await ensureOnboardingOpener(db, session, null, {});
  const savedEnv = {};
  const fixtureEnv = {
    ...testPlanEnv,
    OPENROUTER_API_KEY: 'test-key',
    JEV_ROUTER_MODEL: 'test/jev-router',
    DATABASE_URL: 'postgres://owner-welcome-on-landing-test',
  };
  for (const key of Object.keys(fixtureEnv)) savedEnv[key] = process.env[key];
  Object.assign(process.env, fixtureEnv);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (href.includes('/decisions')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
        }),
      };
    }
    const corpus = JSON.stringify(body?.messages || []);
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
  };
  useVacationAppDatabase(db);
  const turn = await queueVacationAppTurnForTests(db, session, null, { text: 'hi' });
  assert.equal(turn.ok, true);
  assert.match(turn.reply || '', /\?/);
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(fixtureEnv)) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
} finally {
  console.log = originalLog;
}

const turns = [{ speaker: 'app', body: welcomeText, at: '2026-10-01T00:00:00.000Z' }];
const order = welcomeBeforeFirstTurn(turns);
assert.equal(order.ok, false);
assert.equal(order.reason, 'no_customer_turn');

console.log('owner welcome on landing passed');
