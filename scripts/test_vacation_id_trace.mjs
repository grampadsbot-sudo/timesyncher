#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { queueVacationAppTurnForTests } from '../routes/vacation-itinerary.mjs';
import { liveTranscriptFromRows } from '../src/vacation/live-app-turn.mjs';
import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { openRouterChatVisibleText, DEFAULT_JEV_DECISIONS_URL, INTERIM_MODEL } from './vacation-app-reply-rules.mjs';
import { renderDialog } from './harness/live-outputs.mjs';
import { confirmStoredTurns } from './harness/stored-turn.mjs';
import { buildScorecard } from './harness/scorecard.mjs';
import { writeOutcomes } from './harness/runtime.mjs';
import { runWave } from './harness/wave.mjs';

const fakeKey = 'fixture-key-private-1156';
const intake = 'We are planning a short Bend stay from March 4 to March 8 2027. Keep the days light.';
const draft = 'Thursday stays open for the neighborhood afternoon.\nBEAT: shaped the day';
const rewrite = 'The walk you named for Thursday can stay, and the rest of that day stays unscheduled.';
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
const usage = {
  cost: 0.00013, prompt_tokens: 43, completion_tokens: 15,
  prompt_tokens_details: { cached_tokens: 10 },
  completion_tokens_details: { reasoning_tokens: 4 },
};
const savedEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalLog = console.log;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const decision = (answers) => json({ answers });

async function mockFetch(url, init = {}) {
  if (String(url) === rulesUrl) return json({ frontmatter: { smoke_bar_phrase: 'Fixture rules loaded' } });
  const route = new URL(url).pathname;
  const body = init.body ? JSON.parse(init.body) : {};
  if (route === '/api/v1/models') {
    return json({ data: [{ id: INTERIM_MODEL, pricing: { prompt: '0.000001', completion: '0.000004' } }] });
  }
  if (String(url) === DEFAULT_JEV_DECISIONS_URL) {
    const questions = body.questions;
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
  assert.equal(init.headers.authorization, `Bearer ${fakeKey}`);
  assert.deepEqual(body.usage, { include: true });
  const [system, user] = body.messages.map((part) => openRouterChatVisibleText(part.content));
  const chat = (content, reportedUsage = usage) => json({
    model: body.model, usage: reportedUsage,
    choices: [{ finish_reason: 'stop', message: { content } }],
  });
  if (body.response_format) {
    const first = JSON.parse(user).sentences.join(' ') === intake;
    return chat(JSON.stringify({
      turnKind: first ? 'trip_intake' : 'itinerary_advice', things: [], roster: [], target: '', anchor: '',
      destination: 'Bend', title: 'Bend spring vacation', hasDates: true, startDate: '2027-03-04', endDate: '2027-03-08',
    }));
  }
  if (system.includes('Return one JSON object.')) {
    if (user.includes('For each sentence')) return chat('{"sentences":[]}', { prompt_tokens: 100, completion_tokens: 25 });
    if (user.includes('Choose tags')) return chat('{"tags":[],"ask":true}');
    return chat('{"asksPrice":false,"asksAccess":false,"pullsAccess":false,"seats":[],"ask":false}');
  }
  if (system.includes('reply with only that place')) return chat('Bend');
  if (system.includes('"template":boolean')) return chat('{"template":false,"canShip":false}');
  if (system.includes('one or two sentence holding line')) return chat('Thursday town walk can wait a moment.\nBEAT: holding the walk');
  if (user.includes('WHAT_I_CHANGED')) return chat(`${rewrite}\nWHAT_I_CHANGED: Named only the walk from this turn.\nBEAT: named the walk`);
  if (user.includes(intake)) return chat('Avery, I am building a light Bend vacation from March 4 to March 8, 2027. Who is coming with you?');
  return chat(draft);
}

function makeDb(trip) {
  const stored = [];
  const db = async (strings, ...values) => {
    const query = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (/select count\(\*\)::int as n.*from transcript_turns/i.test(query)) return [{ n: stored.length }];
    if (/select request_id, speaker, body, channel, payload, direction/i.test(query)) return [...stored].reverse();
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
      return [];
    }
    if (/insert into worker_jobs/i.test(query)) return [{ id: `job-${stored.length}` }];
    if (/select e.plan, e.status, e.metadata, e.trip_id/i.test(query)) return [{ plan: 'single', status: 'active', trip_id: trip.id, metadata: {} }];
    if (query.startsWith('select count(*)::int as n from trip_things')) return [{ n: 0 }];
    if (/from trips where id/i.test(query) && query.startsWith('select')) return [trip];
    if (query.startsWith('update trips set title')) trip.destination = 'Bend';
    if (/from customers where id/i.test(query)) return [{ id: values[0], display_name: 'Avery', first_name: 'Avery', last_name: '', metadata: {} }];
    if (/from vacation_collaborators/i.test(query)) return [];
    return [];
  };
  return { db, stored };
}

const session = { customer_id: 'fixture-owner', first_name: 'Avery', display_name: 'Avery', metadata: { replyBackend: 'openrouter' } };
async function loadTranscriptAuthorPeople() {
  return [];
}

const tripA = { id: 'trip-1156-a', title: 'Bend A', start_date: '2027-03-04', end_date: '2027-03-08', destination: '', metadata: {} };
const tripB = { id: 'trip-1156-b', title: 'Bend B', start_date: '2027-03-04', end_date: '2027-03-08', destination: '', metadata: {} };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-id-trace-'));
try {
  Object.assign(process.env, env);
  delete process.env.DATABASE_URL;
  globalThis.fetch = mockFetch;
  console.log = () => {};

  const harnessA = makeDb(tripA);
  const harnessB = makeDb(tripB);
  const firstA = await queueVacationAppTurnForTests(harnessA.db, session, tripA, { text: intake });
  assert.equal(firstA.ok, true, firstA.error);
  const firstB = await queueVacationAppTurnForTests(harnessB.db, session, tripB, { text: intake });
  assert.equal(firstB.ok, true, firstB.error);

  for (const [turn, trip] of [[firstA, tripA], [firstB, tripB]]) {
    assert.ok(turn.openrouterCalls.length > 0);
    for (const row of turn.openrouterCalls) {
      assert.equal(row.tripId, trip.id);
      assert.ok(row.requestId != null && String(row.requestId).length > 0);
    }
  }
  assert.notEqual(firstA.openrouterCalls[0].tripId, firstB.openrouterCalls[0].tripId);

  const apiTurns = await loadTripScopedVacationAppTurns(harnessA.db, session, tripA.id, { loadTranscriptAuthorPeople });
  assert.ok(apiTurns.length > 0);
  for (const turn of apiTurns) assert.equal(turn.tripId, tripA.id);

  const doc = liveTranscriptFromRows({ session: { ...session, trip_id: tripA.id }, rows: harnessA.stored });
  await renderDialog({
    outDir: dir, secrets: [fakeKey], loadTranscript: async () => doc,
    spawnImpl: () => ({ status: 0, stdout: '{"ok":false}' }),
  });
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'dialog-transcript.json'), 'utf8'));
  const appTurns = written.turns.filter((turn) => turn.role === 'app' && Array.isArray(turn.openrouterCalls));
  assert.ok(appTurns.length > 0);
  for (const turn of appTurns) {
    for (const row of turn.openrouterCalls) {
      assert.equal(row.tripId, tripA.id);
      assert.ok(row.requestId);
    }
  }

  const { rows: scoreRows } = confirmStoredTurns(written, '', 'openrouter');
  const appScore = scoreRows.filter((row) => row.role === 'app' && row.openrouterCalls);
  assert.ok(appScore.length > 0);
  assert.ok(appScore[0].openrouterCalls.length > 0);

  writeOutcomes(dir, { ...firstA, tripId: tripA.id, keepsakeOk: true });
  const outcomes = JSON.parse(fs.readFileSync(path.join(dir, 'outcomes.json'), 'utf8'));
  assert.equal(outcomes.tripId, tripA.id);

  const card = buildScorecard({
    run_id: 'trace-1156',
    story_id: 'vk-trace',
    tripId: tripA.id,
    reply_backend: 'openrouter',
    checks: [],
    gaps: [],
    reason: '',
    turns: scoreRows,
    cost: { state: 'measured', amount: 0.00013, unit: 'usd', gap: '', per_customer: null },
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
  });
  fs.writeFileSync(path.join(dir, 'scorecard.json'), `${JSON.stringify(card, null, 2)}\n`);
  const scorecard = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'));
  assert.equal(scorecard.tripId, tripA.id);

  const docB = liveTranscriptFromRows({ session: { ...session, trip_id: tripB.id }, rows: harnessB.stored });
  const dirB = path.join(dir, 'dialog-b');
  await renderDialog({
    outDir: dirB, secrets: [fakeKey], loadTranscript: async () => docB,
    spawnImpl: () => ({ status: 0, stdout: '{"ok":false}' }),
  });
  const writtenB = JSON.parse(fs.readFileSync(path.join(dirB, 'dialog-transcript.json'), 'utf8'));
  const byStory = {
    'vk-trace-a': { trip: tripA, transcript: written },
    'vk-trace-b': { trip: tripB, transcript: writtenB },
  };
  const stories = Object.keys(byStory).map((storyId) => ({
    story_id: storyId,
    reply_backend: 'openrouter',
    customer: { name: 'Harness Fixture', email_alias: `${storyId}@example.test` },
    turns: [],
  }));
  const wave = await runWave(stories, {
    runId: 'trace-1156-wave',
    outRoot: path.join(dir, 'wave'),
    concurrency: 2,
    continueOnFail: true,
    play: async (story, opts) => {
      const { trip, transcript } = byStory[story.story_id];
      return writeOutcomes(opts.outDir, { tripId: trip.id, transcript, pdfText: '', liveShaStart: 'fixture', liveShaEnd: 'fixture' });
    },
  });
  assert.equal(wave.cards.length, 2);
  const waveIds = [];
  for (const [storyId, { trip }] of Object.entries(byStory)) {
    const storyDir = path.join(dir, 'wave', 'trace-1156-wave', storyId);
    const storyOutcomes = JSON.parse(fs.readFileSync(path.join(storyDir, 'outcomes.json'), 'utf8'));
    const storyCard = JSON.parse(fs.readFileSync(path.join(storyDir, 'scorecard.json'), 'utf8'));
    assert.equal(storyOutcomes.tripId, trip.id);
    assert.equal(storyCard.tripId, trip.id);
    const cardCalls = storyCard.turns.filter((turn) => turn.role === 'app').flatMap((turn) => turn.openrouterCalls || []);
    assert.ok(cardCalls.length > 0);
    for (const row of cardCalls) {
      assert.equal(row.tripId, trip.id);
      assert.ok(row.requestId != null && String(row.requestId).length > 0);
    }
    waveIds.push(storyCard.tripId);
  }
  assert.equal(new Set(waveIds).size, 2);

  console.log = originalLog;
  console.log('test_vacation_id_trace: ok');
} finally {
  globalThis.fetch = originalFetch;
  console.log = originalLog;
  for (const key of [...Object.keys(env), 'DATABASE_URL']) {
    if (savedEnv[key] == null) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(dir, { recursive: true, force: true });
}