import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { queueVacationAppTurnForTests } from '../routes/vacation-itinerary.mjs';
import { customerIntent, activityCommits } from '../src/vacation/customer-intent.mjs';
import { liveTranscriptFromRows } from '../src/vacation/live-app-turn.mjs';
import { bindOpenRouterLedger, openRouterTurnTelemetry, withOpenRouterLedger } from '../src/vacation/openrouter-call-ledger.mjs';
import { jevRelevanceScore } from '../src/vacation/place-relevance-judge.mjs';
import { persistVacationAppOutboundReply } from '../src/vacation/reply-ship.mjs';
import { openRouterChatVisibleText, DEFAULT_JEV_DECISIONS_URL, INTERIM_MODEL, JEV_QUALITY_MODEL } from './vacation-app-reply-rules.mjs';
import { customerSection } from './harness/findings.mjs';
import { renderDialog } from './harness/live-outputs.mjs';
import { confirmStoredTurns } from './harness/stored-turn.mjs';

const fakeKey = 'fixture-key-private-1148';
const intake = 'We are planning a short Bend stay from March 4 to March 8 2027. Keep the days light.';
const followup = 'Thursday is a town walk.';
const draft = 'Thursday stays open for the neighborhood afternoon.\nBEAT: shaped the day';
const rewrite = 'The walk you named for Thursday can stay, and the rest of that day stays unscheduled.';
const usage = {
  cost: 0.00013, prompt_tokens: 43, completion_tokens: 15,
  prompt_tokens_details: { cached_tokens: 10 },
  completion_tokens_details: { reasoning_tokens: 4 },
};
const rulesUrl = 'https://rules.example.test/page';
const env = {
  OPENROUTER_API_KEY: fakeKey,
  TIMESYNCHER_OPENROUTER_API_KEY: fakeKey,
  TIMESYNCHER_JEV_CLASSIFY_TOKEN: fakeKey,
  TIMESYNCHER_JEV_CLASSIFY_URL: DEFAULT_JEV_DECISIONS_URL,
  TIMESYNCHER_GBRAIN_GET_PAGE_URL: rulesUrl,
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900',
  TIMESYNCHER_SINGLE_NAME: 'TimeSyncher Vacation Single',
  CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1',
};
const savedEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalLog = console.log;
const logs = [];
const fetches = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const decision = (answers) => json({ answers });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function mockFetch(url, init = {}) {
  if (String(url) === rulesUrl) return json({ frontmatter: { smoke_bar_phrase: 'Fixture rules loaded' } });
  const route = new URL(url).pathname;
  const body = init.body ? JSON.parse(init.body) : {};
  if (route === '/api/v1/models') {
    return json({ data: [{ id: INTERIM_MODEL, pricing: { prompt: '0.000001', completion: '0.000004' } }] });
  }
  if (String(url) === DEFAULT_JEV_DECISIONS_URL) {
    fetches.push('decisions');
    const questions = body.questions;
    if (questions.model_tier && questions.overall_quality) {
      const low = String(body.state.draft).includes('neighborhood');
      return decision({
        model_tier: { score: 1 },
        route_type: { choice: 'general' },
        overall_quality: { score: low ? 0 : 3.9 },
        disposition: { choice: low ? 'rewrite' : 'keep' },
        fix_focus: { choice: low ? 'misses_ask' : 'keep' },
      });
    }
    if (questions.model_tier) return decision({
      model_tier: { score: 1 }, route_type: { choice: 'general' },
      trip_intake: { noul: body.state.current_turn === intake ? 0.95 : 0.04 },
    });
    if (questions.relevance) return decision({ relevance: { type: 'score', score: 3.2 } });
    assert.ok(questions.overall_quality);
    const low = String(body.state.draft).includes('neighborhood');
    return decision({
      overall_quality: { score: low ? 0 : 3.9 },
      disposition: { choice: low ? 'rewrite' : 'keep' },
      fix_focus: { choice: low ? 'misses_ask' : 'keep' },
    });
  }
  assert.equal(route, '/api/v1/chat/completions');
  fetches.push('chat');
  assert.equal(init.headers.authorization, `Bearer ${fakeKey}`);
  assert.deepEqual(body.usage, { include: true });
  const [system, user] = body.messages.map((part) => openRouterChatVisibleText(part.content));
  const chat = (content, reportedUsage = usage) => json({ model: body.model, usage: reportedUsage, choices: [{ finish_reason: 'stop', message: { content } }] });
  if (body.response_format) {
    const first = JSON.parse(user).sentences.join(' ') === intake;
    return chat(JSON.stringify({
      turnKind: first ? 'trip_intake' : 'itinerary_advice', things: [], roster: [], target: '', anchor: '',
      destination: 'Bend', title: 'Bend spring vacation', hasDates: true, startDate: '2027-03-04', endDate: '2027-03-08',
    }));
  }
  if (system.includes('Return one JSON object.')) {
    if (user.includes('fixture transport failure')) throw new Error(`fixture transport failure ${fakeKey}`);
    if (user.includes('fixture HTTP failure')) return json({ error: { message: fakeKey } }, 429);
    if (user.includes('For each sentence')) return chat('{"sentences":[]}', { prompt_tokens: 100, completion_tokens: 25 });
    if (user.includes('Choose tags')) return chat('{"tags":[],"ask":true}');
    return chat('{"asksPrice":false,"asksAccess":false,"pullsAccess":false,"seats":[],"ask":false}');
  }
  if (system.includes('reply with only that place')) return chat('Bend');
  if (system.includes('"template":boolean')) return chat('{"template":false,"canShip":false}');
  if (system.includes('one or two sentence holding line')) return chat('Thursday town walk can wait a moment.\nBEAT: holding the walk');
  if (user.includes('WHAT_I_CHANGED')) return chat(`${rewrite}\nWHAT_I_CHANGED: Named only the walk from this turn.\nBEAT: named the walk`);
  if (user.includes(intake) && !user.includes(followup)) return chat('Avery, I am building a light Bend vacation from March 4 to March 8, 2027. Who is coming with you?');
  return chat(draft);
}

const session = { customer_id: 'fixture-owner', first_name: 'Avery', display_name: 'Avery', metadata: { replyBackend: 'openrouter' } };
const trip = { id: 'trip-1148', title: 'Bend spring vacation', start_date: '2027-03-04', end_date: '2027-03-08', destination: '', metadata: {} };
const stored = [];
const lateWrite = deferred();
const db = async (strings, ...values) => {
  const query = strings.join(' ? ').replace(/\s+/g, ' ').trim();
  if (/select count\(\*\)::int as n.*from transcript_turns/i.test(query)) return [{ n: stored.length }];
  if (/select speaker, body, payload.*from transcript_turns/i.test(query)) return [...stored].reverse();
  if (/insert into vacation_requests/i.test(query)) return [{ id: `request-${stored.length + 1}`, received_at: new Date().toISOString() }];
  if (/insert into transcript_turns/i.test(query)) {
    const speaker = /'customer'/.test(query) ? 'customer' : 'app';
    stored.push({ speaker, request_id: values[2], body: values[3], payload: structuredClone(values[4]) });
    return [{ id: `turn-${stored.length}` }];
  }
  if (query.startsWith('update transcript_turns set payload = jsonb_set')) {
    const app = stored.find((row) => row.request_id === values[1] && row.speaker === 'app');
    Object.assign(app.payload.liveTranscript, structuredClone(values[0]));
    if (app.request_id === 'late-request') lateWrite.resolve(app.payload.liveTranscript);
    return [];
  }
  if (/insert into worker_jobs/i.test(query)) return [{ id: `job-${stored.length}` }];
  if (/select e.plan, e.status, e.metadata, e.trip_id/i.test(query)) return [{ plan: 'single', status: 'active', trip_id: trip.id, metadata: {} }];
  if (query.startsWith('select count(*)::int as n from trip_things')) return [{ n: 0 }];
  if (/from trips where id/i.test(query) && query.startsWith('select')) return [trip];
  if (query.startsWith('update trips set title')) trip.destination = 'Bend';
  return [];
};

function checkRows(turn, expectedPurposes) {
  assert.deepEqual([...new Set(turn.openrouterCalls.map((row) => row.purpose))].sort(), [...expectedPurposes].sort());
  const { openrouterCalls: rows, openrouterTotals: totals } = turn;
  assert.equal(rows.length, expectedPurposes.length);
  assert.equal(totals.calls, rows.length);
  const chats = rows.filter((row) => row.endpoint === 'chat');
  const decisions = rows.filter((row) => row.endpoint === 'decisions');
  assert.equal(totals.measuredUsd, Number((chats.length * usage.cost).toFixed(8)));
  assert.equal(totals.estimatedUsd, 0);
  assert.equal(totals.unpricedCalls, decisions.length);
  for (const row of chats) {
    assert.equal(row.model, INTERIM_MODEL);
    assert.equal(row.costSource, 'openrouter_usage_cost');
    assert.equal(row.costUsd, usage.cost);
    assert.equal(row.promptTokens, 43);
    assert.equal(row.completionTokens, 15);
    assert.equal(row.cachedTokens, 10);
    assert.equal(row.reasoningTokens, 4);
  }
  for (const row of decisions) {
    assert.equal(row.model, JEV_QUALITY_MODEL);
    assert.equal(row.costSource, 'unpriced');
    for (const key of ['costUsd', 'promptTokens', 'completionTokens', 'cachedTokens', 'reasoningTokens']) assert.equal(row[key], null);
  }
  for (const row of rows) {
    assert.equal(row.ok, true);
    assert.equal(row.httpStatus, 200);
    assert.ok(row.latencyMs >= 0);
    assert.equal(totals.byPurpose[row.purpose].calls, rows.filter((r) => r.purpose === row.purpose).length);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-call-cost-'));
try {
  Object.assign(process.env, env);
  delete process.env.DATABASE_URL;
  globalThis.fetch = mockFetch;
  console.log = (line) => {
    if (String(line).includes('"event":"openrouter_call"')) logs.push(JSON.parse(line));
  };

  const first = await queueVacationAppTurnForTests(db, session, trip, { text: intake });
  assert.equal(first.ok, true, first.error);
  checkRows(first, ['reply_draft', 'jev_turn']);
  const second = await queueVacationAppTurnForTests(db, session, trip, { text: followup });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.reply, rewrite);
  checkRows(second, ['reply_draft', 'jev_turn', 'reply_interim', 'interim_judge', 'reply_rewrite', 'jev_quality_rewrite']);

  const doc = liveTranscriptFromRows({ session: { ...session, trip_id: trip.id }, rows: stored });
  await renderDialog({
    outDir: dir, secrets: [fakeKey], loadTranscript: async () => doc,
    spawnImpl: () => ({ status: 0, stdout: '{"ok":false}' }),
  });
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'dialog-transcript.json'), 'utf8'));
  assert.equal(written.turns[0].openrouterCalls, undefined);
  const app = written.turns.filter((turn) => turn.role === 'app');
  for (const [index, returned] of [first, second].entries()) {
    assert.deepEqual(app[index].openrouterCalls, returned.openrouterCalls);
    assert.deepEqual(app[index].openrouterTotals, returned.openrouterTotals);
    assert.deepEqual(logs.filter((row) => row.requestId === returned.requestId).map(({ event, tripId, requestId, ...row }) => {
      assert.equal(tripId, trip.id);
      return row;
    }), returned.openrouterCalls);
  }
  assert.equal(app[0].cost.dollars, usage.cost);
  assert.equal(app[1].cost.dollars, 0.00026);
  const { rows: scoreRows } = confirmStoredTurns(written, '', 'openrouter');
  assert.deepEqual(scoreRows.filter((row) => row.role === 'app').map((row) => row.openrouterTotals), [first.openrouterTotals, second.openrouterTotals]);
  assert.match(customerSection({ turns: scoreRows, verdict: 'PASS' }, { wave: 'fixture' }), /OpenRouter per app turn: T2 \$0\.000130 measured, \$0\.000000 estimated, 1 unpriced calls \| T4 \$0\.000520 measured, \$0\.000000 estimated, 2 unpriced calls/);

  const [extras, failures] = await Promise.all([
    withOpenRouterLedger(async () => {
      bindOpenRouterLedger({ tripId: trip.id, requestId: 'extras' });
      await activityCommits([followup], { env });
      await jevRelevanceScore({ name: 'Town walk' }, { apiKey: fakeKey, env });
      return openRouterTurnTelemetry();
    }),
    withOpenRouterLedger(async () => {
      bindOpenRouterLedger({ tripId: trip.id, requestId: 'failures' });
      await assert.rejects(customerIntent('fixture transport failure', { env }), /transport failure/);
      await assert.rejects(customerIntent('fixture HTTP failure', { env }));
      return openRouterTurnTelemetry();
    }),
  ]);
  assert.deepEqual(extras.openrouterCalls.map((row) => row.purpose), ['activity_commits', 'place_relevance_jev']);
  assert.equal(extras.openrouterCalls[0].costSource, 'openrouter_listed_price');
  assert.equal(extras.openrouterCalls[0].costUsd, 0.0002);
  assert.equal(extras.openrouterTotals.estimatedUsd, 0.0002);
  assert.equal(extras.openrouterTotals.unpricedCalls, 1);
  assert.deepEqual(failures.openrouterCalls.map((row) => [row.ok, row.httpStatus, row.costSource]), [[false, null, 'unpriced'], [false, 429, 'unpriced']]);
  assert.equal(failures.openrouterTotals.unpricedCalls, 2);

  const finishFetch = deferred();
  let lateCall;
  await withOpenRouterLedger(async () => {
    bindOpenRouterLedger({ tripId: trip.id, requestId: 'late-request' });
    const shipped = await persistVacationAppOutboundReply({
      db, tripId: trip.id, requestId: 'late-request', transcriptOwnerId: session.customer_id,
      produced: { reply: rewrite, quality: { judged: true } },
      classification: {}, jobFields: {}, customerTurnIndex: 5,
      vacationAppTripSummary: (row) => row,
      recordCustomerThingNotes: async () => {
        lateCall = customerIntent(followup, { env, fetchImpl: async (...args) => {
          await finishFetch.promise;
          return mockFetch(...args);
        } });
        return [];
      },
    });
    assert.equal(shipped.ok, true);
    assert.equal(openRouterTurnTelemetry().openrouterTotals.calls, 0);
  });
  finishFetch.resolve();
  await lateCall;
  const lateTurn = await lateWrite.promise;
  assert.deepEqual(lateTurn.openrouterCalls.map((row) => row.purpose), ['intent']);
  assert.equal(lateTurn.openrouterTotals.measuredUsd, usage.cost);
  assert.equal(logs.at(-1).requestId, 'late-request');

  assert.equal(logs.length, fetches.length, 'one structured event per attempted inference call');
  const output = JSON.stringify([first.openrouterCalls, second.openrouterCalls, extras, failures, logs]);
  for (const privateText of [fakeKey, intake, followup, 'fixture transport failure']) assert.ok(!output.includes(privateText));
} finally {
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  for (const key of [...Object.keys(env), 'DATABASE_URL']) {
    if (savedEnv[key] == null) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('test_openrouter_call_cost_log: ok');
