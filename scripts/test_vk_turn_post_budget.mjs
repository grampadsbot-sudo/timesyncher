#!/usr/bin/env node
import assert from 'node:assert/strict';
import { attachIntakeItineraryFromReply } from '../routes/vacation-itinerary.mjs';
import { queueVacationAppTurn } from '../routes/vacation-app-chat-queue.mjs';
import {
  DEFAULT_TURN_POST_BUDGET_MS,
  VERCEL_FUNCTION_LIMIT_MS,
  createTurnPostBudget,
  needsActivityCommitDecisions,
  orderPlaceRefreshRotation,
  placeRefreshUntouchedMax,
  turnPostBudgetMs,
  wrapBoundedPlaceSearch,
} from '../src/vacation/turn-post-budget.mjs';
import { DEFAULT_JEV_DECISIONS_URL } from './vacation-app-reply-rules.mjs';

const SEARCH_DELAY_MS = 2000;
const COMMIT_DELAY_MS = 3000;
const POST_BUDGET_MS = 9000;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

assert.equal(VERCEL_FUNCTION_LIMIT_MS, 60000);
assert.equal(DEFAULT_TURN_POST_BUDGET_MS, 45000);
assert.equal(turnPostBudgetMs({}), 45000);
assert.equal(turnPostBudgetMs({ VK_TURN_POST_BUDGET_MS: '90000' }), 55000, 'budget can never reach the 60 s function limit');
assert.equal(placeRefreshUntouchedMax({}), 12);
{
  const ordered = orderPlaceRefreshRotation([
    { id: 'a', metadata: { placeRefreshAttemptedAt: '2027-01-02T00:00:00Z' } },
    { id: 'b', metadata: {} },
    { id: 'c', metadata: { placeRefreshAttemptedAt: '2027-01-01T00:00:00Z' } },
    { id: 'd', metadata: {} },
  ]);
  assert.deepEqual(ordered.map((t) => t.id), ['b', 'd', 'c', 'a']);
}
{
  const budget = createTurnPostBudget({ startedAt: Date.now(), budgetMs: 600, reserveMs: 100, minSearchSliceMs: 50 });
  let deferred = null;
  const bounded = wrapBoundedPlaceSearch(async () => { await sleep(2000); return { places: [{ title: 'late' }] }; }, budget, { onDeferred: (info) => { deferred = info; } });
  const t0 = Date.now();
  const out = await bounded({ relevanceTarget: 'Slow Spot' });
  assert.ok(Date.now() - t0 < 1000, 'bounded search returns at the budget, not when the provider answers');
  assert.equal(out.outcomeStatus, 'budget_deferred');
  assert.equal(deferred?.title, 'Slow Spot');
}
assert.equal(needsActivityCommitDecisions([{ title: 'Spot 03' }], 'Hello there.'), false);
assert.equal(needsActivityCommitDecisions([{ title: 'Spot 03' }], 'On Tuesday, April 6 we want Spot 03.'), true);

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload, text: async () => JSON.stringify(payload) };
}

const session = {
  id: 'sess-1141',
  token: 'tok-1141',
  customer_id: 'cust-1141',
  first_name: 'Sofia',
  last_name: 'Lopez',
  display_name: 'Sofia Lopez',
  metadata: { replyBackend: 'vk_bot_mcp' },
};

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

function makeTripDb({ tripId, things }) {
  const state = {
    things,
    insertedAppTurns: [],
    insertedThings: [],
    noteUpdates: [],
    upgrades: [],
    workerJobs: [],
    workerJobUpdates: [],
    handledJobs: [],
    tripMetaUpdates: [],
    customerTurnUpdates: [],
    unknown: new Set(),
  };
  let jobSeq = 0;
  const db = async (strings, ...values) => {
    const q = strings.join(' ? ').replace(/\s+/g, ' ').trim();
    if (/select count\(\*\)::int as n/i.test(q) && /from transcript_turns/i.test(q)) return [{ n: 123, started_at: '2026-11-24T18:00:00.000Z' }];
    if (/select speaker, body, payload/i.test(q) && /from transcript_turns/i.test(q)) return [];
    if (/select id, body/i.test(q) && /from transcript_turns/i.test(q)) return [];
    if (/insert into vacation_requests/i.test(q)) return [{ id: `req-${tripId}`, received_at: new Date().toISOString(), queued_at: new Date().toISOString() }];
    if (/insert into transcript_turns/i.test(q) && /returning id/i.test(q)) return [{ id: `turn-cust-${tripId}` }];
    if (/insert into transcript_turns/i.test(q)) {
      state.insertedAppTurns.push({ body: values[3], payload: values[4], at: Date.now() });
      return [];
    }
    if (/update transcript_turns/i.test(q) && /coalesce\(payload/i.test(q)) {
      state.customerTurnUpdates.push(values[0]);
      return [];
    }
    if (/insert into worker_jobs/i.test(q) && /chat_place_refresh|job_type, priority/i.test(q)) {
      jobSeq += 1;
      const row = { id: `job-refresh-${jobSeq}`, request_id: values[0], trip_id: values[1], job_type: values[2], priority: values[3], input: values[4], status: 'pending' };
      state.workerJobs.push(row);
      return [{ id: row.id }];
    }
    if (/insert into worker_jobs/i.test(q)) return [{ id: `job-turn-${tripId}` }];
    if (/select id, input from worker_jobs/i.test(q)) {
      return state.workerJobs.filter((job) => job.trip_id === values[0] && job.job_type === values[1] && ['pending', 'retry'].includes(job.status)).slice(-1);
    }
    if (/update worker_jobs set input/i.test(q)) {
      const job = state.workerJobs.find((row) => row.id === values[1]);
      if (job) job.input = values[0];
      state.workerJobUpdates.push({ id: values[1], input: values[0] });
      return [];
    }
    if (/update worker_jobs set status = 'completed'/i.test(q)) {
      state.handledJobs.push(values[1]);
      return [];
    }
    if (/update trips set metadata/i.test(q)) {
      state.tripMetaUpdates.push(values[0]);
      return [];
    }
    if (/select start_date, end_date/i.test(q) && /from trips/i.test(q)) return [{ start_date: '2027-04-05', end_date: '2027-04-09' }];
    if (/select metadata from trips/i.test(q)) return [{ metadata: {} }];
    if (/select destination, metadata from trips/i.test(q)) return [{ destination: 'Orlando, FL', metadata: {} }];
    if (/select title, destination, metadata from trips/i.test(q)) return [{ title: 'Orlando family vacation', destination: 'Orlando, FL', metadata: {} }];
    if (/select id, title, destination/i.test(q) && /from trips/i.test(q)) {
      return [{ id: tripId, title: 'Orlando family vacation', destination: 'Orlando, FL', start_date: '2027-04-05', end_date: '2027-04-09', status: 'planning', metadata: {} }];
    }
    if (/select count\(\*\)::int as n from trip_things/i.test(q)) return [{ n: state.things.length }];
    if (/from trip_things/i.test(q) && /^select/i.test(q)) return state.things.map((row) => ({ ...row }));
    if (/insert into trip_things/i.test(q)) {
      const id = `${tripId}-new-${state.insertedThings.length + 1}`;
      const row = { id, category: values[2], title: values[4], description: values[5] || '', location: parseJson(values[10]), metadata: parseJson(values[13]), source: values[14] || null };
      state.things.push(row);
      state.insertedThings.push(row);
      return [{ id }];
    }
    if (/update trip_things set category/i.test(q)) {
      const row = state.things.find((thing) => thing.id === values[10]);
      if (row) {
        row.location = parseJson(values[4]);
        row.metadata = parseJson(values[7]);
        row.source = values[8];
      }
      state.upgrades.push(values[10]);
      return [];
    }
    if (/update trip_things set description = ''/i.test(q)) {
      const id = values[values.length - 1];
      const row = state.things.find((thing) => thing.id === id);
      if (row) row.metadata = { ...(row.metadata || {}), ...(values[1] || {}) };
      state.noteUpdates.push(id);
      return row ? [{ id }] : [];
    }
    state.unknown.add(q.slice(0, 80));
    return [];
  };
  return { db, state };
}

function unresolvedThing(id, title) {
  return { id, category: 'activity', title, description: '', location: {}, source: null, metadata: { source: 'chat_extraction', intakeSource: 'chat_extraction', needsDetails: true } };
}

function installFetch(replyText) {
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const body = parseJson(init.body);
    if (href.includes('/api/alpha/decisions')) {
      if (body.questions?.model_tier) {
        return jsonResponse({ answers: { model_tier: { score: 2.2, confidence: 0.6 }, route_type: { choice: 'itinerary_advice' }, needs_day_for_note: { noul: 0.2 } } });
      }
      return jsonResponse({ answers: { overall_quality: { score: 3.9 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' } } });
    }
    if (href.includes('/api/v1/chat/completions')) {
      const sys = String(body.messages?.[0]?.content || '');
      if (sys.includes('Return one JSON object. Do not write a customer reply.')) {
        return jsonResponse({ model: 'anthropic/claude-haiku-5.5', choices: [{ message: { content: JSON.stringify({ asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: false }) } }] });
      }
      return jsonResponse({
        model: 'anthropic/claude-haiku-5.5',
        choices: [{ finish_reason: 'stop', message: { content: replyText } }],
        usage: { prompt_tokens: 4000, completion_tokens: 120, total_tokens: 4120, cost: 0.0004 },
      });
    }
    return jsonResponse({}, 404);
  };
}

async function runTurn({ db, tripId, text, searchImpl, commitImpl, postBudgetMs = null }) {
  const started = Date.now();
  const queued = await queueVacationAppTurn(
    db,
    { ...session, trip_id: tripId },
    { id: tripId, title: 'Orlando family vacation', destination: 'Orlando, FL', start_date: '2027-04-05', end_date: '2027-04-09', status: 'planning', metadata: {} },
    { text },
    {
      recordCustomerThingNotes: (conn, id, reqText, opts, intakeText, extracted) => attachIntakeItineraryFromReply(
        conn,
        id,
        reqText,
        { ...opts, searchPlacesImpl: searchImpl },
        intakeText,
        extracted,
      ),
      publishIntakeShare: async () => {},
      vacationAppTripSummary: (row) => row,
    },
    {
      requestText: text,
      classification: { ok: true, intake: false, turnKind: 'itinerary_advice', destination: 'Orlando, FL', things: [], roster: [], routerModel: 'typesafe/jev-1.13' },
      placeSearchTurn: false,
      webResearchTurn: false,
      postStartedMs: started,
      postBudgetMs,
      activityCommitDecisionsImpl: commitImpl,
    },
  );
  return { queued, wallMs: Date.now() - started, started };
}

const savedEnv = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  TIMESYNCHER_JEV_CLASSIFY_URL: process.env.TIMESYNCHER_JEV_CLASSIFY_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
const originalFetch = globalThis.fetch;
process.env.OPENROUTER_API_KEY = 'test-key-offline';
process.env.TIMESYNCHER_JEV_CLASSIFY_URL = DEFAULT_JEV_DECISIONS_URL;
delete process.env.DATABASE_URL;

try {
  const bigTripId = 'trip-big-1141';
  const titles = Array.from({ length: 70 }, (_, i) => `Spot ${String(i + 1).padStart(2, '0')}`);
  const { db, state } = makeTripDb({ tripId: bigTripId, things: titles.map((title, i) => unresolvedThing(`big-${i + 1}`, title)) });
  const searched = [];
  const slowSearch = async (args) => {
    searched.push(String(args?.relevanceTarget || ''));
    await sleep(SEARCH_DELAY_MS);
    return { places: [], outcomeStatus: 'no_results', providers: [] };
  };
  let commitCalls = 0;
  const slowCommits = async (text, options = {}) => {
    commitCalls += 1;
    assert.ok(!options || !options.fetchImpl, 'activity commit call keeps its own fetch/env');
    await sleep(COMMIT_DELAY_MS);
    return { [String(text).trim()]: { commits: true, ask: false } };
  };
  installFetch('Saved Spot 03 and Spot 07 for Tuesday, April 6 on your Orlando vacation.');

  const turnText = 'On Tuesday, April 6 we want Spot 03 and Spot 07.';
  const first = await runTurn({ db, tripId: bigTripId, text: turnText, searchImpl: slowSearch, commitImpl: slowCommits, postBudgetMs: POST_BUDGET_MS });
  assert.equal(first.queued.ok, true, `big trip turn must ship, got ${JSON.stringify(first.queued).slice(0, 400)}`);
  assert.equal(first.queued.status, 'replied');
  assert.ok(first.wallMs <= POST_BUDGET_MS + 1000, `70-Thing turn returned in ${first.wallMs} ms, budget ${POST_BUDGET_MS} ms`);
  const oldBehaviourMs = titles.length * SEARCH_DELAY_MS;
  assert.ok(oldBehaviourMs > 60000, 'fixture reproduces a refresh-all turn that would exceed the 60 s function limit');
  assert.equal(state.insertedAppTurns.length, 1, 'reply row committed');
  assert.equal(state.insertedAppTurns[0].body, first.queued.reply);
  assert.equal(commitCalls, 1);
  assert.ok(searched.length < titles.length / 4, `only a bounded number of searches ran (${searched.length})`);
  assert.ok(searched.includes('Spot 03') && searched.includes('Spot 07'), 'Things changed this turn are refreshed first');
  assert.ok(state.noteUpdates.includes('big-3') && state.noteUpdates.includes('big-7'), 'customer-visible thing saves are committed in the turn');
  assert.ok(state.things.find((t) => t.id === 'big-3').metadata.customerWhen, 'dated note saved on Spot 03');

  assert.equal(state.workerJobs.length, 1, 'deferred work recorded as one chat_place_refresh job');
  const job = state.workerJobs[0];
  assert.equal(job.job_type, 'chat_place_refresh');
  assert.equal(job.request_id, null, 'refresh job never rewrites the customer request status');
  assert.equal(job.trip_id, bigTripId);
  assert.ok(job.input.thingIds.length >= 60, `pending thing ids recorded (${job.input.thingIds.length})`);
  assert.ok(!job.input.thingIds.includes('big-3') || searched.filter((t) => t === 'Spot 03').length === 1);
  const meta = state.tripMetaUpdates.find((m) => m?.deferredPlaceRefresh)?.deferredPlaceRefresh;
  assert.equal(meta?.pending, true, 'trip metadata marks deferred place refresh pending');
  assert.equal(meta?.workerJobId, job.id);
  const turnPayload = state.customerTurnUpdates.find((u) => u?.deferredWork);
  assert.ok(turnPayload, 'customer turn payload records the deferred work');
  assert.equal(turnPayload.deferredWork.deferred, true);
  assert.ok(turnPayload.postReplyTimings?.totalMs >= 0, 'post-reply step timings stored on the turn');
  assert.ok(first.queued.deferredWork?.deferred, 'client payload reports deferred work');
  assert.ok(state.handledJobs.includes(`job-turn-${bigTripId}`), 'turn worker job marked handled');

  const firstSearched = new Set(searched);
  searched.length = 0;
  installFetch('Sounds good, your Orlando vacation is coming together.');
  const second = await runTurn({ db, tripId: bigTripId, text: 'Sounds good, thanks.', searchImpl: slowSearch, commitImpl: slowCommits, postBudgetMs: POST_BUDGET_MS });
  assert.equal(second.queued.ok, true);
  assert.ok(second.wallMs <= POST_BUDGET_MS + 1000, `follow-up turn returned in ${second.wallMs} ms`);
  assert.equal(commitCalls, 1, 'no activity-commit model call when no dated sentence names a Thing');
  assert.ok(searched.length >= 1, 'next turn picks up deferred place refresh work');
  for (const title of searched) assert.ok(!firstSearched.has(title), `rotation picks never-attempted Things first (${title})`);
  assert.equal(state.workerJobs.length, 1, 'pending job reused, not duplicated');
  assert.ok(state.workerJobUpdates.length >= 1, 'pending job input refreshed with the remaining Things');
  const remaining = state.workerJobs[0].input.thingIds;
  const lastSearched = searched[searched.length - 1];
  for (const title of searched) {
    const id = state.things.find((t) => t.title === title).id;
    if (title === lastSearched && remaining.includes(id)) {
      assert.equal(remaining[remaining.length - 1], id, `budget-cut search ${title} stays pending at the back of the queue`);
      continue;
    }
    assert.ok(!remaining.includes(id), `Thing ${title} searched this turn leaves the pending list`);
    assert.ok(state.things.find((t) => t.id === id).metadata.placeRefreshAttemptedAt, `Thing ${title} stamped for rotation`);
  }
  assert.ok(remaining.length >= titles.length - firstSearched.size - searched.length - 2, 'Things not reached stay pending');
  assert.equal(state.handledJobs.length, 2);
  assert.deepEqual([...state.unknown].filter((q) => /trip_things|worker_jobs/.test(q)), [], 'no unhandled trip_things/worker_jobs SQL');

  const smallTripId = 'trip-small-1141';
  const small = makeTripDb({
    tripId: smallTripId,
    things: [
      { id: 'small-1', category: 'activity', title: 'Magic Kingdom', description: '', location: { lat: 28.4177, lng: -81.5812 }, source: 'osm', metadata: { source: 'osm' } },
      unresolvedThing('small-2', 'Disney Springs'),
    ],
  });
  const fastSearched = [];
  const fastSearch = async (args) => {
    const target = String(args?.relevanceTarget || '');
    fastSearched.push(target);
    await sleep(10);
    if (target === 'Animal Kingdom') {
      return { places: [{ title: 'Animal Kingdom', lat: 28.3553, lon: -81.5901, lng: -81.5901, address: 'Bay Lake, FL', source: 'osm', category: 'activity' }], outcomeStatus: 'ok', providers: [] };
    }
    return { places: [], outcomeStatus: 'no_results', providers: [] };
  };
  installFetch([
    'Here is the next piece of your Orlando vacation.',
    'Thursday, April 8: Animal Kingdom',
  ].join('\n'));
  const smallRun = await runTurn({ db: small.db, tripId: smallTripId, text: 'Can we add Animal Kingdom on Thursday?', searchImpl: fastSearch, commitImpl: async () => ({}) });
  assert.equal(smallRun.queued.ok, true, `small trip turn must ship, got ${JSON.stringify(smallRun.queued).slice(0, 400)}`);
  const animal = small.state.things.find((t) => t.title === 'Animal Kingdom');
  assert.ok(animal, 'small trip saves the new Thing in the same turn');
  assert.ok(Number.isFinite(Number(animal.location?.lat)), 'new Thing is resolved in the same turn');
  assert.ok(fastSearched.includes('Disney Springs'), 'small trip still refreshes its unresolved Thing in the same turn');
  assert.equal(small.state.workerJobs.length, 0, 'small trip defers nothing');
  assert.equal(smallRun.queued.deferredWork, undefined);
  assert.ok(small.state.handledJobs.includes(`job-turn-${smallTripId}`));
  assert.ok((smallRun.queued.savedThings || []).length >= 1 || small.state.customerTurnUpdates.some((u) => (u.savedThings || []).length), 'saved Things reported for the turn');
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('test_vk_turn_post_budget: ok');
