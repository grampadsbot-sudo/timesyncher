#!/usr/bin/env node
import assert from 'node:assert/strict';
import { queueVacationAppTurn } from '../routes/vacation-app-chat-queue.mjs';
import { runVacationAppInTurnSearch } from '../src/vacation/chat-place-search.mjs';
import { liveTranscriptFromRows, liveTurnRecord } from '../src/vacation/live-app-turn.mjs';
import { TavilySearchError } from '../src/vacation/poi-search.mjs';
import {
  inTurnPlaceSearchSoftNoResults,
  recoverSoftSearchReply,
  replyPlaceSearchProviderLeakReason,
} from '../src/vacation/place-search-reply-facts.mjs';
import { persistVacationAppOutboundReply } from '../src/vacation/reply-ship.mjs';
import { readStoredCost, rollupCost } from './harness/cost.mjs';
import { confirmStoredTurns } from './harness/stored-turn.mjs';

const LEAK_RE = /\b(?:tavily|brave|nominatim|openstreetmap|prior_db|osm|place_search_failed|web_search_failed)\b|HTTP\s*[45]\d{2}/i;
const ORLANDO_TRIP = { id: 'trip-orlando', title: 'Orlando family vacation', destination: 'Orlando', start_date: '2027-04-05', end_date: '2027-04-09', status: 'planning', metadata: {} };
const LOPEZ_SESSION = { id: 'sess-lopez', token: 'tok-lopez', customer_id: 'cust-lopez', first_name: 'Sofia', last_name: 'Lopez', display_name: 'Sofia Lopez', metadata: { replyBackend: 'vk_bot_mcp' } };
const QUEUE_HOOKS = { recordCustomerThingNotes: async () => [], publishIntakeShare: async () => {}, vacationAppTripSummary: (row) => row };

function makeSearchDb() {
  const insertedAppTurns = [];
  const db = async (strings, ...values) => {
    const sql = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (/select count\(\*\)::int as n/i.test(sql) && /from transcript_turns/i.test(sql)) return [{ n: 2, started_at: new Date().toISOString() }];
    if (/select speaker, body, payload/i.test(sql) && /from transcript_turns/i.test(sql)) return [];
    if (/select id, body/i.test(sql) && /from transcript_turns/i.test(sql)) return [];
    if (/insert into vacation_requests/i.test(sql)) return [{ id: 'req-search-soft', received_at: new Date().toISOString(), queued_at: new Date().toISOString() }];
    if (/insert into transcript_turns/i.test(sql) && /returning id/i.test(sql)) return [{ id: 'turn-cust-soft' }];
    if (/insert into transcript_turns/i.test(sql)) {
      insertedAppTurns.push({ body: values[3], payload: values[4] });
      return [];
    }
    if (/insert into worker_jobs/i.test(sql)) return [{ id: 'job-search-soft' }];
    if (/select metadata from trips/i.test(sql)) return [{ metadata: {} }];
    if (/select id, title, destination/i.test(sql) && /from trips/i.test(sql)) return [ORLANDO_TRIP];
    if (/select destination, metadata from trips/i.test(sql)) return [{ destination: 'Orlando', metadata: {} }];
    return [];
  };
  return { db, insertedAppTurns };
}

for (const status of [433, 503]) {
  const { db } = makeSearchDb();
  const res = await runVacationAppInTurnSearch({
    db,
    tripId: ORLANDO_TRIP.id,
    requestId: `req-${status}`,
    customerTurn: 'Are there evening fireworks at Epcot in April?',
    tripDestination: 'Orlando',
    classification: { ok: true, turnKind: 'web_research', question: 'Epcot evening fireworks April', things: [], roster: [], routerModel: 'router-test' },
    payload: {},
    customerLive: {},
    turnId: `turn-${status}`,
    env: { TAVILI_API_KEY: 'test-tavily-key' },
    placeSearchTurn: false,
    webResearchTurn: true,
    tavilyImpl: async () => {
      throw new TavilySearchError(`Tavily search failed with HTTP ${status}.`, { code: 'TAVILY_HTTP_ERROR', status });
    },
  });
  assert.equal(res.ok, true, `web_research HTTP ${status} must soft-fail to ok:true, got ${JSON.stringify(res)}`);
  assert.equal(res.enforceInTurnSearch, false);
  assert.equal(res.webResearchTurn, false);
  assert.equal(res.placeSearchReplyFacts?.webSearch?.outcome, 'search_unavailable');
  assert.doesNotMatch(JSON.stringify(res.placeSearchReplyFacts), LEAK_RE);
}

{
  const { db } = makeSearchDb();
  let tavilyCalls = 0;
  const mars = await runVacationAppInTurnSearch({
    db,
    tripId: ORLANDO_TRIP.id,
    requestId: 'req-mars',
    customerTurn: 'Unrelated: what is the weather on Mars next Tuesday?',
    tripDestination: 'Orlando',
    classification: { ok: true, turnKind: 'web_research', question: 'weather on Mars next Tuesday', things: [], roster: [], routerModel: 'router-test' },
    payload: {},
    customerLive: {},
    turnId: 'turn-mars',
    env: {},
    placeSearchTurn: false,
    webResearchTurn: true,
    tavilyImpl: async () => {
      tavilyCalls += 1;
      throw new TavilySearchError('Tavily search failed with HTTP 433.', { code: 'TAVILY_HTTP_ERROR', status: 433 });
    },
  });
  assert.equal(mars.ok, true, `off-topic Mars turn must return ok:true, got ${JSON.stringify(mars)}`);
  assert.equal(tavilyCalls, 0, 'off-topic Mars query should not require a Tavily provider call');
  assert.equal(mars.placeSearchReplyFacts?.webSearch?.outcome, 'off_topic');
  assert.doesNotMatch(JSON.stringify(mars.placeSearchReplyFacts), LEAK_RE);
}

{
  const placeHttpSoft = inTurnPlaceSearchSoftNoResults({
    classification: { target: 'family restaurants', category: 'restaurant', anchor: 'Orlando' },
    tripDestination: 'Orlando',
    placeSearch: {
      status: 'failed',
      reason: 'all_providers_failed',
      providers: [
        { provider: 'osm', status: 'error', reason: 'HTTP 504' },
        { provider: 'brave', status: 'error', reason: 'HTTP 503' },
      ],
      error: 'Brave Place Search failed: HTTP 503',
    },
  });
  assert.ok(placeHttpSoft, 'place search provider HTTP failure must soft-fail');
  assert.equal(placeHttpSoft.enforceInTurnSearch, false);
  assert.equal(placeHttpSoft.placeSearchReplyFacts?.placeSearch?.outcome, 'search_unavailable');
  assert.doesNotMatch(JSON.stringify(placeHttpSoft.placeSearchReplyFacts), LEAK_RE);

  const { db } = makeSearchDb();
  const place503 = await runVacationAppInTurnSearch({
    db,
    tripId: ORLANDO_TRIP.id,
    requestId: 'req-place-503',
    customerTurn: 'Find kid-friendly lunch spots near Orlando',
    tripDestination: 'Orlando',
    classification: { ok: true, turnKind: 'place_search', target: 'kid-friendly lunch spots', category: 'restaurant', targetKind: 'category', anchor: 'Orlando', anchorIsLodging: false, things: [], roster: [], routerModel: 'router-test' },
    payload: {},
    customerLive: {},
    turnId: 'turn-place-503',
    env: { BRAVE_SEARCH_API_KEY: 'test-brave', OPENROUTER_API_KEY: 'test-or' },
    placeSearchTurn: true,
    webResearchTurn: false,
    searchImpl: async () => {
      const error = new Error('Brave Place Search failed: HTTP 503');
      error.code = 'all_providers_failed';
      error.providers = [{ provider: 'brave', status: 'error', reason: 'HTTP 503' }];
      throw error;
    },
  });
  assert.equal(place503.ok, true, `in-turn place search HTTP 503 must return ok:true, got ${JSON.stringify(place503)}`);
  assert.equal(place503.placeSearchReplyFacts?.placeSearch?.outcome, 'search_unavailable');
  assert.doesNotMatch(JSON.stringify(place503.placeSearchReplyFacts), LEAK_RE);
}

assert.equal(replyPlaceSearchProviderLeakReason('Sorry, Tavily returned HTTP 433.'), 'reply_place_search_provider_leak');
assert.equal(replyPlaceSearchProviderLeakReason('Error: web_search_failed on lookup.'), 'reply_place_search_provider_leak');
assert.equal(replyPlaceSearchProviderLeakReason('Error: place_search_failed on lookup.'), 'reply_place_search_provider_leak');
assert.equal(replyPlaceSearchProviderLeakReason('Lookup failed with HTTP 503.'), 'reply_place_search_provider_leak');
assert.equal(replyPlaceSearchProviderLeakReason('That is outside this vacation plan. Let us keep building your Orlando vacation days.'), '');

{
  const { db, insertedAppTurns } = makeSearchDb();
  const originalFetch = globalThis.fetch;
  const savedEnv = { TAVILI_API_KEY: process.env.TAVILI_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY };
  process.env.TAVILI_API_KEY = 'test-tavily';
  process.env.OPENROUTER_API_KEY = '';
  globalThis.fetch = async () => ({ ok: false, status: 433, json: async () => ({}), text: async () => 'blocked' });
  try {
    const runQueue = (requestText, question) => queueVacationAppTurn(
      db,
      LOPEZ_SESSION,
      ORLANDO_TRIP,
      { text: requestText },
      QUEUE_HOOKS,
      {
        requestText,
        classification: { ok: true, intake: false, turnKind: 'web_research', question, things: [], roster: [], routerModel: 'router-test' },
        placeSearchTurn: false,
        webResearchTurn: true,
      },
    );
    const marsQueued = await runQueue('Unrelated: what is the weather on Mars next Tuesday?', 'weather on Mars next Tuesday');
    assert.equal(marsQueued.ok, true, `queueVacationAppTurn Mars must return ok:true, got ${JSON.stringify(marsQueued)}`);
    assert.equal(marsQueued.status, 'replied');
    assert.match(marsQueued.reply, /\bvacation\b/i);
    assert.doesNotMatch(marsQueued.reply, LEAK_RE);
    assert.doesNotMatch(marsQueued.reply, /\btrips?\b/i);

    const realWeb433 = await runQueue('Are there evening fireworks at Epcot in April?', 'Epcot evening fireworks April');
    assert.equal(realWeb433.ok, true, `queueVacationAppTurn Tavily 433 must return ok:true, got ${JSON.stringify(realWeb433)}`);
    assert.equal(realWeb433.status, 'replied');
    assert.match(realWeb433.reply, /could not look that up right now/i);
    assert.match(realWeb433.reply, /\bvacation\b/i);
    assert.doesNotMatch(realWeb433.reply, LEAK_RE);
    assert.doesNotMatch(realWeb433.reply, /\btrips?\b/i);
    assert.equal(insertedAppTurns.length, 2, 'both app replies must be persisted to transcript_turns');

    const leakSanitized = recoverSoftSearchReply(
      { reply: 'Sorry, Tavily search failed with HTTP 433 (web_search_failed).', model: { backend: 'vk_bot_mcp' } },
      { webSearch: { outcome: 'search_unavailable', query: 'fireworks', detail: 'could not look that up' } },
      { backend: 'vk_bot_mcp', destination: 'Orlando' },
    );
    assert.ok(leakSanitized);
    assert.doesNotMatch(leakSanitized.reply, LEAK_RE);
    assert.match(leakSanitized.reply, /\bvacation\b/i);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

{
  const turn3CostObj = {
    source: 'openrouter_usage_cost',
    status: 'measured',
    wallMs: null,
    dollars: 0.0002285,
    currency: 'USD',
    replyCount: null,
    totalTokens: 1753,
    promptTokens: 1620,
    completionTokens: 133,
    usagePercentDelta: null,
  };
  const r2Turn3Fixture = {
    turnIndex: 3,
    role: 'app',
    text: "Hi Sofia, I'm building your Orlando theme parks vacation now.",
    replyProducer: 'vacation-app-reply-rules',
    fixedOpener: false,
    modelId: 'anthropic/claude-haiku-5.5',
    backend: 'vk_bot_mcp',
    jev: { jevRan: true, modelTier: 3, responseModel: 'anthropic/claude-haiku-5.5' },
    quality: { judged: true, score: 3.18 },
    cost: turn3CostObj,
    model: { via: 'openrouter-chat', cost: turn3CostObj, called: true, backend: 'vk_bot_mcp', modelTier: 3, genLatencyMs: 1119, responseModel: 'anthropic/claude-haiku-5.5' },
  };
  const turn3Cost = readStoredCost(r2Turn3Fixture, 'vk_bot_mcp');
  assert.equal(turn3Cost.state, 'measured', `r2 turn 3 fixture must read as measured, got ${JSON.stringify(turn3Cost)}`);
  assert.equal(turn3Cost.gap, '');
  assert.equal(turn3Cost.unit, 'tokens');
  assert.equal(turn3Cost.amount, 1753);

  const dollarsOnlyMcp = readStoredCost({ backend: 'vk_bot_mcp', cost: { status: 'measured', dollars: 0.0012, currency: 'USD', totalTokens: null, usagePercentDelta: null } }, 'vk_bot_mcp');
  assert.equal(dollarsOnlyMcp.state, 'measured');
  assert.equal(dollarsOnlyMcp.gap, '');
  assert.equal(dollarsOnlyMcp.unit, 'usd');
  assert.equal(dollarsOnlyMcp.amount, 0.0012);

  const turn5CostObj = { ...turn3CostObj, totalTokens: 9997, promptTokens: 6478, completionTokens: 3519, dollars: 0.0024073 };
  const r2Turn5Fixture = {
    ...r2Turn3Fixture,
    turnIndex: 5,
    cost: turn5CostObj,
    model: { ...r2Turn3Fixture.model, cost: turn5CostObj, usage: { total_tokens: 9997, prompt_tokens: 6478, completion_tokens: 3519 } },
  };
  const confirmed = confirmStoredTurns({ turns: [r2Turn3Fixture, r2Turn5Fixture] }, '', 'vk_bot_mcp');
  assert.equal(confirmed.rows[0].stored_backend, 'vk_bot_mcp');
  assert.equal(confirmed.rows[0].cost_state, 'measured');
  assert.equal(confirmed.rows[0].cost_amount, 1753);
  assert.equal(confirmed.gaps.includes('stored-cost-missing'), false);
  const rolled = rollupCost(confirmed.rows);
  assert.equal(rolled.state, 'measured');
  assert.equal(rolled.unit, 'tokens');
  assert.equal(rolled.amount, 1753 + 9997);
  assert.equal(rolled.gap, '');

  const firstIntakeModel = {
    called: true,
    via: 'openrouter-chat',
    backend: 'openrouter',
    modelTier: 3,
    responseModel: 'anthropic/claude-haiku-5.5',
    genLatencyMs: 1119,
    cost: turn3CostObj,
    quality: { judged: true, score: 3.18, disposition: 'keep', jevFocus: 'keep' },
  };
  const firstRecord = liveTurnRecord({
    turnIndex: 3,
    role: 'app',
    modality: 'text',
    text: "Hi Sofia, I'm building your Orlando theme parks vacation now.",
    at: '2026-11-24T22:31:51.570Z',
    latencyMs: 1545,
    sessionE2eMs: 20994,
    jev: { jevRan: true, modelTier: 3, responseModel: 'anthropic/claude-haiku-5.5', jevBeforeModel: true },
    model: firstIntakeModel,
    backend: 'vk_bot_mcp',
  });
  assert.equal(firstRecord.backend, 'vk_bot_mcp');
  assert.equal(firstRecord.model.backend, 'vk_bot_mcp');
  assert.deepEqual(firstRecord.model.usage, { total_tokens: 1753, prompt_tokens: 1620, completion_tokens: 133 });
  assert.equal(firstRecord.cost.totalTokens, 1753);

  const reread = liveTranscriptFromRows({ session: { token: 'tok-lopez' }, rows: [{ body: firstRecord.text, payload: { liveTranscript: firstRecord } }] });
  assert.equal(reread.turns[0].backend, 'vk_bot_mcp');
  assert.equal(reread.turns[0].model.usage.total_tokens, 1753);

  const { db, insertedAppTurns } = makeSearchDb();
  const shipped = await persistVacationAppOutboundReply({
    db,
    transcriptOwnerId: 'cust-lopez',
    tripId: ORLANDO_TRIP.id,
    requestId: 'req-first-intake',
    jobId: 'job-first-intake',
    produced: { reply: firstRecord.text, jev: { jevRan: true, modelTier: 3, responseModel: 'anthropic/claude-haiku-5.5', jevBeforeModel: true }, model: firstIntakeModel, rules: { ok: true, via: 'bundled-get_page', slug: 'rules' } },
    base: { requestId: 'req-first-intake' },
    exchangeLatency: 1545,
    sessionE2eMs: 20994,
    customerTurnIndex: 2,
    speakerName: 'Sofia Lopez',
    seat: null,
    classification: { ok: true, roster: [] },
    jobFields: { destination: 'Orlando', title: 'Orlando vacation', wantedThings: [] },
    firstIntake: true,
    requestText: 'Hi, I am Sofia Lopez...',
    intakeThings: [],
    customerTurnId: 'turn-2',
    ...QUEUE_HOOKS,
    replyBackend: 'vk_bot_mcp',
  });
  assert.equal(shipped.ok, true);
  const persistedLive = insertedAppTurns[0].payload.liveTranscript;
  assert.equal(persistedLive.backend, 'vk_bot_mcp');
  assert.equal(persistedLive.model.backend, 'vk_bot_mcp');
  assert.equal(persistedLive.model.usage.total_tokens, 1753);
  assert.equal(persistedLive.model.usage.prompt_tokens, 1620);
  assert.equal(persistedLive.model.usage.completion_tokens, 133);
}

console.log('test_search_fail_stored_reply: ok');
