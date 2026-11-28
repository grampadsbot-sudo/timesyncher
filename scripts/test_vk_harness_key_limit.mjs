#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyAppFailure, isSpendLimitReason, redactUrls } from './harness/backends.mjs';
import { runCustomer } from './harness/customer.mjs';
import { customerSection, implicationOf, severityOf } from './harness/findings.mjs';
import { playCustomerTurns, turnFailure } from './harness/live-play.mjs';
import { buildScorecard } from './harness/scorecard.mjs';
import { runWave } from './harness/wave.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
const origin = 'https://vacation-staging.timesyncher.com';
const tripId = '44444444-5555-4666-8777-888888888888';
const MODEL = 'anthropic/claude-haiku-5.5';
const PROVIDER_URL = 'https://provider.example/settings/keys';
const KEY_LIMIT_BODY = Object.freeze({
  ok: false,
  status: 'turn_classifier_failed',
  error: `Key limit exceeded (daily limit). Manage it using ${PROVIDER_URL}. $1.00 of $1.00 used; resets 2026-11-26T00:00:00.000Z.`,
  reply: null,
  latencyMs: 98,
});
const PLAIN_502 = Object.freeze({ ok: false, status: 'reply_unavailable', error: 'Bad gateway', reply: null });

function appTurn(stored, text) {
  return {
    speaker: 'app',
    body: text,
    modelId: MODEL,
    payload: { liveTranscript: { turnIndex: stored.length + 2, text, modelId: MODEL } },
  };
}

function makeServer(plan) {
  const stored = [
    { speaker: 'app', body: 'Welcome! Tell me about your vacation.', payload: { liveTranscript: { fixedOpener: true, replyProducer: 'vacation-app-onboarding-opener', jev: { reason: 'fixed_onboarding_opener' } } } },
  ];
  const log = { posts: 0, gets: 0, getsAfterPost: [] };
  const cap = { n: 0 };
  let postIndex = 0;
  let pending = null;
  let shown = false;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'sha-1147' }) };
    if (init.method === 'POST') {
      log.posts += 1;
      const step = plan(postIndex);
      postIndex += 1;
      log.getsAfterPost.push(0);
      if (step.fail) {
        pending = step.storeOnGet ? { text: step.reply, getsLeft: step.storeOnGet } : null;
        return { status: step.status || 502, text: async () => JSON.stringify(step.fail) };
      }
      stored.push(appTurn(stored, step.reply));
      const itinerary = cap.n > 0 && log.posts === cap.n ? [{ id: 'thing-1', title: 'Hilo farmers market' }] : [];
      if (itinerary.length) shown = true;
      return {
        status: 201,
        text: async () => JSON.stringify({ ok: true, status: 'replied', reply: step.reply, modelId: MODEL, itinerary, turns: stored, trip: { id: tripId } }),
      };
    }
    log.gets += 1;
    if (log.getsAfterPost.length) log.getsAfterPost[log.getsAfterPost.length - 1] += 1;
    if (pending) {
      pending.getsLeft -= 1;
      if (pending.getsLeft <= 0) {
        stored.push(appTurn(stored, pending.text));
        pending = null;
      }
    }
    return {
      status: 200,
      text: async () => JSON.stringify({ ok: true, eula: { accepted: true }, itinerary: shown ? [{ id: 'thing-1', title: 'Hilo farmers market' }] : [], turns: stored, trip: { id: tripId } }),
    };
  };
  return { fetchImpl, log, cap };
}

async function play(plan, maxTurns, token) {
  const server = makeServer(plan);
  server.cap.n = maxTurns;
  const sleeps = [];
  const played = await playCustomerTurns(
    { ...story, reply_backend: 'vk_bot_mcp' },
    {
      origin,
      token,
      tripId,
      hosts: [],
      waitMs: 0,
      secrets: [token],
      liveCustomer: true,
      maxTurns,
      customerAsk: async ({ index }) => ({ text: `Customer turn ${index + 1} about Hilo days.`, model: 'gemini-test', cost: null }),
      fetchImpl: server.fetchImpl,
      sleepImpl: async (ms) => { sleeps.push(ms); },
    },
  );
  return { played, server, sleeps };
}

function assertNoUrl(text, label) {
  assert.equal(text.includes(PROVIDER_URL), false, `${label}: provider URL must be redacted`);
  assert.equal(text.includes('provider.example'), false, `${label}: provider host must be redacted`);
  assert.equal(/https?:\/\//i.test(text), false, `${label}: no URL may survive`);
}

function assertKeyLimitPlay({ played, server, sleeps }, failedTurn) {
  assert.equal(played.reason, 'key-limit', `turn ${failedTurn}: spend/quota wall must not be turn-not-stored, got ${played.reason}`);
  assert.equal(played.waveStop, true, `turn ${failedTurn}: spend/quota wall stops the wave`);
  assert.equal(server.log.posts, failedTurn, 'no POST after the wall');
  assert.equal(server.log.getsAfterPost[failedTurn - 1], 0, `turn ${failedTurn}: zero stored-turn probe GETs after the wall`);
  assert.deepEqual(sleeps, [], 'no probe backoff waits');
  assert.equal(played.exchange.probes, undefined, 'no probes recorded on the exchange');
  assert.equal(played.rescuedTimeouts.count, 0);
  assert.equal(played.timings.length, failedTurn);
  assert.equal(played.timings.at(-1).http_status, 502);
  assert.equal(played.exchange.post_status, 502);
  assert.equal(played.exchange.body.status, 'turn_classifier_failed');
  assert.match(played.exchange.body.error, /Key limit exceeded \(daily limit\)/);
  assert.match(played.exchange.body.error, /\[redacted-url\]/);
  assertNoUrl(JSON.stringify(played.exchange), 'exchange');
  assert.match(played.detail, /spend\/quota limit/);
  assertNoUrl(played.detail, 'detail');
}

assert.equal(classifyAppFailure(502, KEY_LIMIT_BODY), 'key-limit');
assert.equal(turnFailure(502, KEY_LIMIT_BODY), 'key-limit');
assert.equal(isSpendLimitReason('key-limit'), true);
assert.equal(isSpendLimitReason('turn-not-stored'), false);
for (const field of ['error', 'reason', 'status', 'intentError', 'titleError', 'intakeError', 'rosterError']) {
  assert.equal(classifyAppFailure(502, { ok: false, [field]: 'Key limit exceeded (daily limit).' }), 'key-limit', `matches ${field}`);
}
assert.equal(classifyAppFailure(500, { ok: false, code: 'credits_required' }), 'key-limit');
assert.equal(classifyAppFailure(429, { ok: false, error: 'Rate limit exceeded: free-models-per-day (daily limit reached)' }), 'key-limit');
assert.equal(classifyAppFailure(429, { ok: false, intentError: 'rate_limited: monthly allowance used' }), 'key-limit');
assert.equal(classifyAppFailure(502, { ok: false, error: { message: 'Key limit exceeded (monthly limit)' } }), 'key-limit');
assert.equal(classifyAppFailure(502, { ok: false, error: 'credit exhausted' }), 'credit-exhausted');
assert.equal(classifyAppFailure(402, {}), 'payment-required');
assert.equal(classifyAppFailure(502, PLAIN_502), '');
assert.equal(classifyAppFailure(504, { error: { code: '504', message: 'An error occurred with your deployment' } }), '');
assert.equal(classifyAppFailure(502, { ok: false, error: 'The operation was aborted.' }), '');
assert.equal(classifyAppFailure(200, { ok: true, reason: 'daily limit' }), '', 'a successful reply is never a spend wall');
assert.equal(turnFailure(502, PLAIN_502), 'turn-not-stored');
assert.equal(redactUrls(`see ${PROVIDER_URL} now`), 'see [redacted-url] now');

const turn1 = await play(() => ({ fail: KEY_LIMIT_BODY }), 3, 'tok-key-limit-turn-1');
assertKeyLimitPlay(turn1, 1);

const turn42 = await play((i) => (i === 41 ? { fail: KEY_LIMIT_BODY } : { reply: `Day ${i + 1}: Hilo plan item saved.` }), 60, 'tok-key-limit-turn-42');
assertKeyLimitPlay(turn42, 42);
assert.equal(turn42.played.customerTurnCount, 42);
assert.equal(turn42.played.storedTurns, 41, 'stored count stays at the last good reply');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-key-limit-'));
try {
  const card = await runCustomer({ ...story, reply_backend: 'openrouter' }, {
    runId: 'key-limit',
    outDir: dir,
    secrets: [],
    cleanup: async () => ({ deleted: {}, remaining: 0 }),
    play: async () => turn42.played,
  });
  assert.equal(card.verdict, 'FAIL');
  assert.equal(card.reason, 'key-limit', 'scorecard reason is the spend/quota class');
  assert.equal(card.wave_stop, true);
  assert.equal(card.cost.state, 'not-run');
  const billing = card.checks.find((check) => check.id === 'app-billing');
  assert.ok(billing, 'app-billing check present');
  assert.equal(billing.pass, false);
  assert.match(billing.detail, /app hit a spend\/quota limit/);
  assert.ok(card.turn_http, 'redacted exchange kept on the scorecard');
  assert.match(card.turn_http.body.error, /Key limit exceeded/);
  const written = fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8');
  assertNoUrl(written, 'scorecard.json');
  assert.match(written, /spend\/quota limit/);

  assert.equal(severityOf(card), 'blocker');
  assert.match(implicationOf(card), /spend\/quota limit/);
  const md = customerSection({ ...card, roster: { id: 9, edge_case: '' } }, { wave: 'r9', at: new Date('2026-11-25T15:41:37Z') });
  assert.match(md, /What broke or confused: key-limit; .*spend\/quota limit/);
  assert.match(md, /Severity \(blocker\/major\/minor\): blocker/);
  assertNoUrl(md, 'finding');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

const ranked = buildScorecard({ run_id: 'r', story_id: 's', reply_backend: 'openrouter', checks: [], reason: 'key-limit', gaps: ['stored-cost-missing'] });
assert.equal(ranked.reason, 'key-limit', 'key-limit outranks downstream gaps');
assert.equal(ranked.wave_stop, true);

const waveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-key-limit-wave-'));
try {
  const ran = [];
  const stories = [1, 2, 3].map((n) => ({ ...story, story_id: `kl-${n}`, reply_backend: 'openrouter' }));
  const wave = await runWave(stories, {
    runId: 'kl-wave',
    outRoot: waveRoot,
    continueOnFail: true,
    run: async (one) => {
      ran.push(one.story_id);
      return buildScorecard({ run_id: 'kl-wave', story_id: one.story_id, reply_backend: one.reply_backend, checks: [], reason: 'key-limit' });
    },
  });
  assert.deepEqual(ran, ['kl-1'], 'wave stops after the first spend/quota wall even with continueOnFail');
  assert.equal(wave.cards[0].reason, 'key-limit');
} finally {
  fs.rmSync(waveRoot, { recursive: true, force: true });
}

{
  const rescued = await play((i) => (i === 1 ? { fail: PLAIN_502, storeOnGet: 2, reply: 'Day 2: Volcano park saved.' } : { reply: `Day ${i + 1}: Hilo plan item saved.` }), 3, 'tok-plain-502-rescued');
  assert.equal(rescued.played.reason, '', `plain 502 with a stored reply is rescued, got ${rescued.played.reason}`);
  assert.equal(rescued.played.waveStop, false);
  assert.equal(rescued.server.log.getsAfterPost[1], 2, 'plain 502 still probes for the stored reply');
  assert.deepEqual(rescued.sleeps, [10000]);
  assert.deepEqual(rescued.played.rescuedTimeouts.turns, [2]);
}

{
  const lost = await play((i) => (i === 0 ? { reply: 'Day 1: Hilo plan item saved.' } : { fail: PLAIN_502 }), 3, 'tok-plain-502-lost');
  assert.equal(lost.played.reason, 'turn-not-stored', 'plain 502 with nothing stored keeps turn-not-stored');
  assert.equal(lost.played.waveStop, false);
  assert.equal(lost.server.log.getsAfterPost[1], 3, 'all three probe GETs ran');
  assert.equal(lost.played.exchange.probes.length, 3);
}

console.log('test_vk_harness_key_limit: ok');
