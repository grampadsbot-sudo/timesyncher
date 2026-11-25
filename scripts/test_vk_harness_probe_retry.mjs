#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCustomer } from './harness/customer.mjs';
import { customerSection, rescuedTimeoutFinding } from './harness/findings.mjs';
import {
  STORED_TURN_PROBE_DELAYS_MS,
  playCustomerTurns,
  storedTurnProbeDelays,
} from './harness/live-play.mjs';
import { writeOutcomes } from './harness/runtime.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
const origin = 'https://vacation-staging.timesyncher.com';
const tripId = '33333333-4444-4555-8666-777777777777';
const MODEL = 'anthropic/claude-haiku-5.5';
const VERCEL_504 = { error: { code: '504', message: 'An error occurred with your deployment' } };

assert.deepEqual([...STORED_TURN_PROBE_DELAYS_MS], [0, 10000, 20000], 'default: 3 GETs over ~30 s with backoff');
assert.equal(STORED_TURN_PROBE_DELAYS_MS.reduce((a, b) => a + b, 0), 30000);
assert.deepEqual(storedTurnProbeDelays(null), [0, 10000, 20000]);
assert.deepEqual(storedTurnProbeDelays([]), [0]);

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
  let postIndex = 0;
  let pending = null;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'sha-1141' }) };
    if (init.method === 'POST') {
      log.posts += 1;
      const step = plan[postIndex] || plan[plan.length - 1];
      postIndex += 1;
      if (step.timeout) {
        pending = step.storeOnGet ? { text: step.reply, getsLeft: step.storeOnGet } : null;
        log.getsAfterPost.push(0);
        return { status: 504, text: async () => JSON.stringify(VERCEL_504) };
      }
      stored.push(appTurn(stored, step.reply));
      log.getsAfterPost.push(0);
      return {
        status: 201,
        text: async () => JSON.stringify({ ok: true, status: 'replied', reply: step.reply, modelId: MODEL, itinerary: [{ id: 'thing-1', title: 'Magic Kingdom' }], turns: stored, trip: { id: tripId } }),
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
      text: async () => JSON.stringify({ ok: true, eula: { accepted: true }, itinerary: stored.length > 1 ? [{ id: 'thing-1', title: 'Magic Kingdom' }] : [], turns: stored, trip: { id: tripId } }),
    };
  };
  return { fetchImpl, log };
}

const sleeps = [];
const fakeSleep = async (ms) => { sleeps.push(ms); };

for (const storeOnGet of [2, 3]) {
  sleeps.length = 0;
  const server = makeServer([
    { reply: 'Day 1: Magic Kingdom is saved.' },
    { timeout: true, storeOnGet, reply: 'Day 2: Animal Kingdom is saved.' },
    { reply: 'Day 3: Resort pool day is saved.' },
  ]);
  const played = await playCustomerTurns(
    { ...story, reply_backend: 'vk_bot_mcp' },
    {
      origin,
      token: `tok-probe-${storeOnGet}`,
      tripId,
      hosts: [],
      waitMs: 0,
      secrets: [],
      liveCustomer: true,
      maxTurns: 3,
      customerAsk: async ({ index }) => ({ text: `Customer turn ${index + 1} for Orlando days.`, model: 'gemini-test', cost: null }),
      fetchImpl: server.fetchImpl,
      sleepImpl: fakeSleep,
    },
  );
  assert.equal(played.reason, '', `reply stored on GET ${storeOnGet}: run must continue, got ${played.reason} ${played.detail}`);
  assert.equal(played.customerTurnCount, 3, 'all three customer turns ran');
  assert.equal(server.log.posts, 3);
  assert.equal(server.log.getsAfterPost[1], storeOnGet, `probe retried until the stored reply appeared (GET ${storeOnGet})`);
  assert.deepEqual(sleeps, [10000, 20000].slice(0, storeOnGet - 1), 'backoff between probe GETs');
  assert.equal(played.rescuedTimeouts.count, 1, 'rescued 504 recorded as a finding');
  assert.deepEqual(played.rescuedTimeouts.turns, [2]);
  assert.equal(played.rescuedTimeouts.timeouts, 1);
  const detail = played.rescuedTimeouts.details[0];
  assert.equal(detail.http_status, 504);
  assert.equal(detail.timeout, true);
  assert.equal(detail.probe_attempts, storeOnGet);
  assert.equal(detail.probes.length, storeOnGet);
  assert.deepEqual(detail.probes.map((p) => p.attempt), Array.from({ length: storeOnGet }, (_, i) => i + 1));
  assert.deepEqual(detail.probes.map((p) => p.stored_reply), Array.from({ length: storeOnGet }, (_, i) => i === storeOnGet - 1));
  assert.ok(detail.probes.every((p) => p.kind === 'probe' && p.status === 200));
  assert.equal(played.timings[1].http_status, 504);
  assert.equal(played.timings[1].rescued_by_probe, storeOnGet);
  assert.ok(played.customerTurns.some((t) => t.role === 'app' && /Animal Kingdom/.test(t.text)), 'rescued stored reply fed back into the conversation');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-probe-retry-'));
  try {
    writeOutcomes(dir, { ...played, keepsakeOk: true });
    const outcomes = JSON.parse(fs.readFileSync(path.join(dir, 'outcomes.json'), 'utf8'));
    assert.deepEqual(outcomes.rescuedTimeouts, { count: 1, turns: [2], timeouts: 1 }, 'outcomes record rescued count and turn numbers');
    const card = await runCustomer({ ...story, reply_backend: 'openrouter' }, {
      runId: `probe-${storeOnGet}`,
      outDir: dir,
      secrets: [],
      cleanup: async () => ({ deleted: {}, remaining: 0 }),
      play: async () => played,
    });
    assert.deepEqual(card.rescued_timeouts, { count: 1, turns: [2], timeouts: 1 }, 'scorecard records rescued count and turn numbers');
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8'));
    assert.deepEqual(written.rescued_timeouts.turns, [2]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

{
  sleeps.length = 0;
  const server = makeServer([
    { reply: 'Day 1: Magic Kingdom is saved.' },
    { timeout: true, storeOnGet: 0, reply: 'never stored' },
  ]);
  const played = await playCustomerTurns(
    { ...story, reply_backend: 'vk_bot_mcp' },
    {
      origin,
      token: 'tok-probe-never',
      tripId,
      hosts: [],
      waitMs: 0,
      secrets: [],
      liveCustomer: true,
      maxTurns: 3,
      customerAsk: async ({ index }) => ({ text: `Customer turn ${index + 1} for Orlando days.`, model: 'gemini-test', cost: null }),
      fetchImpl: server.fetchImpl,
      sleepImpl: fakeSleep,
    },
  );
  assert.equal(played.reason, 'turn-not-stored', 'no stored reply after every probe still aborts with turn-not-stored');
  assert.equal(server.log.getsAfterPost[1], 3, 'all three probe GETs ran');
  assert.deepEqual(sleeps, [10000, 20000]);
  assert.equal(played.exchange.post_status, 504);
  assert.equal(played.exchange.probes.length, 3, 'each probe recorded on the exchange');
  assert.ok(played.exchange.probes.every((p) => p.stored_reply === false));
  assert.equal(played.exchange.timeline[0].kind, 'post');
  assert.equal(played.rescuedTimeouts.count, 0);
}

{
  const server = makeServer([{ timeout: true, storeOnGet: 1, reply: 'Day 1: Magic Kingdom is saved.' }, { reply: 'Day 2: Epcot.' }]);
  let realSleeps = 0;
  const played = await playCustomerTurns(
    { ...story, reply_backend: 'vk_bot_mcp' },
    {
      origin, token: 'tok-probe-first', tripId, hosts: [], waitMs: 0, secrets: [], liveCustomer: true, maxTurns: 2,
      customerAsk: async ({ index }) => ({ text: `Customer turn ${index + 1}.`, model: 'gemini-test', cost: null }),
      fetchImpl: server.fetchImpl,
      sleepImpl: async () => { realSleeps += 1; },
    },
  );
  assert.equal(played.reason, '');
  assert.equal(realSleeps, 0, 'reply visible on the first probe: no backoff wait');
  assert.deepEqual(played.rescuedTimeouts.turns, [1]);
}

assert.equal(rescuedTimeoutFinding({ rescued_timeouts: { count: 2, turns: [29, 47] } }), 'POST failed/timed out but reply was stored x2 (turns 29, 47)');
const md = customerSection({
  story_id: 'vk-lopez-r7', reply_backend: 'vk_bot_mcp', mode: 'live', verdict: 'PASS', reason: '', checks: [],
  turns: [{ wall_ms: 60200 }], cost: { state: 'not-run' }, rescued_timeouts: { count: 33, turns: [29, 47], timeouts: 33 }, roster: { id: 7, edge_case: '' },
}, { wave: 'r7', at: new Date('2026-11-25T05:00:00Z') });
assert.match(md, /What broke or confused: POST failed\/timed out but reply was stored x33 \(turns 29, 47\)/);

console.log('test_vk_harness_probe_retry: ok');
