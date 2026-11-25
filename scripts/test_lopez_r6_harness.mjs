#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PLANNING_ERROR_REPLY } from '../src/vacation/chat-plan-persist.mjs';
import {
  MODEL_TOKEN_RATES_USD_PER_M,
  modelTokenRates,
  readStoredCost,
  rollupCost,
  sumUsageUsd,
  tokenUsageToUsd,
} from './harness/cost.mjs';
import {
  customerAskFromEnv,
  formatCustomerTranscript,
  personaSeed,
  speakCustomer,
} from './harness/customer-live.mjs';
import { loadBannedHosts } from './harness/fetch-guard.mjs';
import { customerSection, replyCostLabel } from './harness/findings.mjs';
import {
  PLANNING_FALLBACK_ABORT_LIMIT,
  appStatedPlanPricing,
  chatGoalsReached,
  isPlanningFallbackTurn,
  playCustomerTurns,
  pricingReactionCaptured,
} from './harness/live-play.mjs';
import { writeOutcomes } from './harness/runtime.mjs';
import { confirmStoredTurns } from './harness/stored-turn.mjs';
import { DEFAULT_JEV_DECISIONS_URL, jevPrecall } from './vacation-app-reply-rules.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
const r5Fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/lopez-r5-dialog-transcript.redacted.json', import.meta.url), 'utf8'));
const seed = personaSeed(story);
const origin = 'https://vacation-staging.timesyncher.com';
const tripId = '22222222-3333-4444-8555-666666666666';
const GEMINI_CUSTOMER_MODEL = 'gemini-test';
const CLAUDE_FAMILY_MODEL = 'claude-test';
const GPT_FAMILY_MODEL = 'gpt-test';

assert.equal(isPlanningFallbackTurn(PLANNING_ERROR_REPLY), true);
assert.equal(isPlanningFallbackTurn('Day 1: Magic Kingdom'), false);

function makeLiveServerMock(replyPlan) {
  const stored = [
    { speaker: 'app', body: 'Welcome, Sofia! Tell me about your vacation.', payload: { liveTranscript: { fixedOpener: true, replyProducer: 'vacation-app-onboarding-opener', jev: { reason: 'fixed_onboarding_opener' } } } },
  ];
  let postIndex = 0;
  return async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/version') {
      return { status: 200, text: async () => JSON.stringify({ sha: 'sha-r6' }) };
    }
    if (init.method === 'POST') {
      const step = replyPlan[postIndex] || replyPlan[replyPlan.length - 1];
      postIndex += 1;
      if (step.storeBeforeError) {
        stored.push({
          speaker: 'app',
          body: step.reply,
          modelId: 'anthropic/claude-haiku-5.5',
          payload: {
            liveTranscript: {
              turnIndex: stored.length + 2,
              text: step.reply,
              modelId: 'anthropic/claude-haiku-5.5',
              quality: step.disposition ? { disposition: step.disposition } : null,
            },
          },
        });
        return {
          status: step.status || 400,
          text: async () => JSON.stringify({ ok: false, error: step.error || 'Brave Place Search failed: HTTP 402' }),
        };
      }
      stored.push({
        speaker: 'app',
        body: step.reply,
        modelId: 'anthropic/claude-haiku-5.5',
        payload: { liveTranscript: { turnIndex: stored.length + 2, text: step.reply, modelId: 'anthropic/claude-haiku-5.5' } },
      });
      return {
        status: 201,
        text: async () => JSON.stringify({
          ok: true,
          status: 'replied',
          reply: step.reply,
          appTurnIndex: step.appTurnIndex || postIndex,
          modelId: 'anthropic/claude-haiku-5.5',
          itinerary: step.itinerary || [{ id: 'thing-1', title: 'Magic Kingdom' }],
          turns: stored,
          trip: { id: tripId, shareToken: 'share-r6' },
        }),
      };
    }
    return {
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        eula: { accepted: true },
        itinerary: stored.length > 1 ? [{ id: 'thing-1', title: 'Magic Kingdom' }] : [],
        turns: stored,
        trip: { id: tripId, shareToken: 'share-r6' },
      }),
    };
  };
}

const recordedTranscripts = [];
const recoveredPlay = await playCustomerTurns(
  { ...story, reply_backend: 'vk_bot_mcp' },
  {
    origin,
    token: 'tok-r6-recover',
    tripId,
    hosts: loadBannedHosts(),
    waitMs: 0,
    secrets: [],
    liveCustomer: true,
    maxTurns: 6,
    customerAsk: async ({ index, transcript, isFirstTurn }) => {
      recordedTranscripts.push({ index, transcript, isFirstTurn });
      if (index === 4) {
        return { text: '$129 a year for the household plan sounds reasonable and works for us.', model: GEMINI_CUSTOMER_MODEL, cost: { input_tokens: 10500, output_tokens: 900, thinking_tokens: 700, cache_read_tokens: 0, total_tokens: 11400 } };
      }
      return { text: `Customer planning turn ${index + 1} for Orlando family days.`, model: GEMINI_CUSTOMER_MODEL, cost: { input_tokens: 10500, output_tokens: 900, thinking_tokens: 700, cache_read_tokens: 0, total_tokens: 11400 } };
    },
    fetchImpl: makeLiveServerMock([
      { reply: PLANNING_ERROR_REPLY, appTurnIndex: 3 },
      { reply: PLANNING_ERROR_REPLY, appTurnIndex: 5 },
      { reply: 'Day 1: Check in at Pop Century Resort. Day 2: Magic Kingdom.', appTurnIndex: 7 },
      { reply: 'The household plan is $129 per year for unlimited vacations.', appTurnIndex: 9 },
      { reply: 'Great, your Orlando days and household plan choice are noted.', appTurnIndex: 11 },
    ]),
  },
);
assert.equal(recoveredPlay.reason, '', '2 consecutive fallbacks followed by recovery must not abort');
assert.equal(recoveredPlay.planningFallbacks.count, 2);
assert.deepEqual(recoveredPlay.planningFallbacks.turns, [3, 5]);
assert.equal(recoveredPlay.pricingReactionCaptured, true);
assert.equal(recordedTranscripts[0].isFirstTurn, true);
assert.equal(recordedTranscripts[1].isFirstTurn, false);
assert.ok(recordedTranscripts[1].transcript.some((t) => t.role === 'customer'));
assert.ok(recordedTranscripts[1].transcript.some((t) => t.role === 'app'));

const storedBehindError = await playCustomerTurns(
  { ...story, reply_backend: 'vk_bot_mcp' },
  {
    origin,
    token: 'tok-r6-stored-err',
    tripId,
    hosts: loadBannedHosts(),
    waitMs: 0,
    secrets: [],
    liveCustomer: true,
    maxTurns: 2,
    customerAsk: async ({ index }) => ({
      text: `Orlando turn ${index + 1} with Pop Century Resort.`,
      model: GEMINI_CUSTOMER_MODEL,
      cost: null,
    }),
    fetchImpl: makeLiveServerMock([
      {
        storeBeforeError: true,
        status: 400,
        error: 'Brave Place Search failed: HTTP 402 {"error":{"status":402,"detail":"Prepaid credit balance is insufficient"}}',
        reply: PLANNING_ERROR_REPLY,
        disposition: 'planning_error_stored',
      },
      { reply: 'Day 2: Magic Kingdom is saved.', appTurnIndex: 9 },
    ]),
  },
);
assert.notEqual(storedBehindError.reason, 'turn-not-stored', 'a stored turn must never abort with turn-not-stored');
assert.equal(storedBehindError.reason, '');
assert.equal(storedBehindError.planningFallbacks.count, 1);
assert.equal(storedBehindError.customerTurnCount, 2);

const abortedPlay = await playCustomerTurns(
  { ...story, reply_backend: 'vk_bot_mcp' },
  {
    origin,
    token: 'tok-r6-x3',
    tripId,
    hosts: loadBannedHosts(),
    waitMs: 0,
    secrets: [],
    liveCustomer: true,
    maxTurns: 6,
    customerAsk: async ({ index }) => ({
      text: `Customer turn ${index + 1} asking for Orlando itinerary.`,
      model: GEMINI_CUSTOMER_MODEL,
      cost: null,
    }),
    fetchImpl: makeLiveServerMock([
      { reply: PLANNING_ERROR_REPLY, appTurnIndex: 3 },
      { reply: PLANNING_ERROR_REPLY, appTurnIndex: 5 },
      { reply: PLANNING_ERROR_REPLY, appTurnIndex: 7 },
      { reply: 'Too late.', appTurnIndex: 9 },
    ]),
  },
);
assert.equal(abortedPlay.reason, 'planning-fallback-x3');
assert.equal(abortedPlay.planningFallbacks.count, PLANNING_FALLBACK_ABORT_LIMIT);
assert.deepEqual(abortedPlay.planningFallbacks.turns, [3, 5, 7]);
assert.equal(abortedPlay.customerTurnCount, 3);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lopez-r6-harness-'));
try {
  writeOutcomes(tmpDir, {
    ...recoveredPlay,
    keepsakeOk: true,
  });
  const outcomes = JSON.parse(fs.readFileSync(path.join(tmpDir, 'outcomes.json'), 'utf8'));
  assert.equal(outcomes.planningFallbacks.count, 2);
  assert.deepEqual(outcomes.planningFallbacks.turns, [3, 5]);
  assert.equal(outcomes.costUsd.status, 'priced');
  assert.ok(outcomes.costUsd.dollars > 0 && outcomes.costUsd.dollars < 1);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const findingMd = customerSection({
  story_id: 'vk-lopez-r6',
  reply_backend: 'vk_bot_mcp',
  ab_arm: 'B vk_bot_mcp',
  mode: 'live',
  verdict: 'PASS',
  reason: '',
  checks: [],
  turns: [{ wall_ms: 1200 }],
  cost: { state: 'measured', amount: 14288, unit: 'tokens', usd_state: 'priced', usd_amount: 0.002993 },
  planning_fallbacks: { count: 2, turns: [3, 5] },
  media: { gb: 0.1 },
  roster: { id: 1, edge_case: '' },
}, { wave: 'r6', at: new Date('2026-11-25T05:00:00Z') });
assert.match(findingMd, /planning fallback x2 \(turns 3, 5\)/);
assert.match(findingMd, /\$0\.0030 replies/);
assert.doesNotMatch(findingMd, /\$14288/);

assert.equal(appStatedPlanPricing("The household plan covers the family's vacations for the whole year."), false);
assert.equal(appStatedPlanPricing('A mid-range hotel near Lake Buena Vista runs about $180 per night.'), false);
assert.equal(appStatedPlanPricing('The household plan is $129 per year for unlimited vacations.'), true);
assert.equal(pricingReactionCaptured(r5Fixture.turns), false, 'r5 transcript has no app dollar quote so pricingReactionCaptured must be false');
assert.equal(pricingReactionCaptured([
  { role: 'app', text: 'The household plan is $129 per year for unlimited vacations.' },
  { role: 'customer', odd: false, text: 'We are aiming for a mid-range budget and want to watch the cost; is Magic Kingdom worth it?' },
]), false, 'generic budget/cost/mid-range/worth it must not count');
assert.equal(pricingReactionCaptured([
  { role: 'customer', odd: false, text: '$129 per year sounds fair and works for us.' },
  { role: 'app', text: 'The household plan is $129 per year for unlimited vacations.' },
]), false, 'customer reaction before app states price must not count');
const syntheticPriced = [
  { role: 'app', text: 'The household plan is $129 per year for unlimited vacations.' },
  { role: 'customer', odd: false, text: '$129 per year for the household plan sounds reasonable, that works for us.' },
];
assert.equal(pricingReactionCaptured(syntheticPriced), true);
assert.equal(chatGoalsReached({ itineraryCount: 2, customerTurns: r5Fixture.turns, index: 2, maxTurns: 10 }).done, false);
assert.equal(chatGoalsReached({ itineraryCount: 2, customerTurns: syntheticPriced, index: 2, maxTurns: 10 }).done, true);

const longHistory = Array.from({ length: 16 }, (_, idx) => ({
  role: idx % 2 === 0 ? 'customer' : 'app',
  text: `Turn ${idx + 1} ${'x'.repeat(1500)}`,
}));
const formatted = formatCustomerTranscript(longHistory);
assert.equal(formatted.length, 12);
assert.match(formatted[0].text, /^Turn 5 /);
assert.ok(formatted.every((entry) => entry.text.length <= 1200));

const postedBodies = [];
const customerServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    postedBodies.push(body);
    const out = JSON.stringify({ text: `Reply for turn ${body.index}`, model: GEMINI_CUSTOMER_MODEL, cost: null });
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(out) });
    res.end(out);
  });
});
await new Promise((resolve) => customerServer.listen(0, '127.0.0.1', resolve));
const { port } = customerServer.address();
try {
  const ask = customerAskFromEnv({ HARNESS_CUSTOMER_MODEL_URL: `http://127.0.0.1:${port}/` }, loadBannedHosts());
  await speakCustomer({ persona: seed, appReply: 'Welcome!', index: 0, transcript: [{ role: 'app', text: 'Welcome!' }], ask });
  await speakCustomer({ persona: seed, appReply: 'Great!', index: 1, transcript: longHistory, ask });
  assert.equal(postedBodies.length, 2);
  assert.equal(postedBodies[0].isFirstTurn, true);
  assert.deepEqual(postedBodies[0].transcript, [{ role: 'app', text: 'Welcome!' }]);
  assert.equal(postedBodies[1].isFirstTurn, false);
  assert.equal(postedBodies[1].transcript.length, 12);
  assert.equal(postedBodies[1].transcript[0].role, 'customer');
  assert.ok(postedBodies[1].transcript.every((item) => item.text.length <= 1200));
  assert.equal(postedBodies[1].persona, seed.name);
  assert.equal(postedBodies[1].destination, seed.destination);
} finally {
  await new Promise((resolve) => customerServer.close(resolve));
}

assert.ok(MODEL_TOKEN_RATES_USD_PER_M.length >= 12);
for (const modelId of ['gemini', GEMINI_CUSTOMER_MODEL, 'anthropic/claude-haiku-5.5', CLAUDE_FAMILY_MODEL, GPT_FAMILY_MODEL, 'composer-2.5']) {
  assert.ok(modelTokenRates(modelId), `expected rate table entry for ${modelId}`);
}
assert.equal(modelTokenRates('mystery/unlisted-99'), null);

const r5LastApp = [...r5Fixture.turns].reverse().find((turn) => turn.role === 'app' && Array.isArray(turn.customerCost));
assert.ok(r5LastApp && r5LastApp.customerCost.length === 3);
const r5CustomerUsd = sumUsageUsd(r5LastApp.customerCost.map((usage) => ({ usage, model: GEMINI_CUSTOMER_MODEL })));
assert.equal(r5CustomerUsd.status, 'priced');
assert.ok(r5CustomerUsd.dollars > 0.01 && r5CustomerUsd.dollars < 1, `r5 3-turn customer USD must be well under $1, got ${r5CustomerUsd.dollars}`);

const r5Confirmed = confirmStoredTurns(r5Fixture, '', 'vk_bot_mcp');
const r5AppRollup = rollupCost(r5Confirmed.rows);
assert.equal(r5AppRollup.amount, 14288);
assert.equal(r5AppRollup.unit, 'tokens');
assert.equal(r5AppRollup.usd_state, 'priced');
assert.ok(r5AppRollup.usd_amount > 0 && r5AppRollup.usd_amount < 0.05, `r5 app USD should be ~$0.003, got ${r5AppRollup.usd_amount}`);
assert.equal(replyCostLabel(r5AppRollup), `$${r5AppRollup.usd_amount.toFixed(4)} replies`);
assert.doesNotMatch(replyCostLabel(r5AppRollup), /14288/);

const unknownUsd = tokenUsageToUsd({ input_tokens: 10000, output_tokens: 2000, total_tokens: 12000 }, 'vendor/unknown-model');
assert.equal(unknownUsd.status, 'unpriced');
assert.equal(unknownUsd.dollars, null);
const unknownStored = readStoredCost({ modelId: 'vendor/unknown-model', total_tokens: 14288 }, 'vk_bot_mcp');
assert.equal(unknownStored.usd_state, 'unpriced');
assert.equal(replyCostLabel({ state: 'measured', amount: 14288, unit: 'tokens', usd_state: 'unpriced', usd_amount: null }), 'unpriced replies');

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      answers: {
        model_tier: { score: 2.0, confidence: 0.8 },
        route_type: { choice: 'itinerary_advice' },
        needs_day_for_note: { noul: 0.1 },
      },
    }),
  });
  const orDecisions = await jevPrecall({
    customerTurn: 'Plan Magic Kingdom on Tuesday.',
    env: { OPENROUTER_API_KEY: 'test-key', TIMESYNCHER_JEV_CLASSIFY_URL: DEFAULT_JEV_DECISIONS_URL },
  });
  assert.equal(orDecisions.jevRan, true);
  assert.equal(orDecisions.via, 'openrouter-decisions');

  const nonOrDecisions = await jevPrecall({
    customerTurn: 'Plan Magic Kingdom on Tuesday.',
    env: { OPENROUTER_API_KEY: 'test-key', TIMESYNCHER_JEV_CLASSIFY_URL: 'https://jev.example/api/alpha/decisions' },
  });
  assert.equal(nonOrDecisions.jevRan, true);
  assert.equal(nonOrDecisions.via, 'http-decisions');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('test_lopez_r6_harness: ok');
