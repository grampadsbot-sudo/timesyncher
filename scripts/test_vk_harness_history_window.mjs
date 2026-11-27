#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APP_HISTORY_WINDOW_ROWS,
  historyWindowFull,
  latestStoredAppTurn,
  ruledReplyCount,
  storedAppTurnChanged,
} from './harness/app-history.mjs';
import { playCustomerTurns } from './harness/live-play.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
const origin = 'https://vacation-staging.timesyncher.com';
const tripId = '44444444-5555-4666-8777-888888888888';
const MODEL = 'anthropic/claude-haiku-5.5';
const VERCEL_504 = { error: { code: '504', message: 'An error occurred with your deployment' } };
const T0 = Date.parse('2026-11-25T10:00:00Z');

assert.equal(APP_HISTORY_WINDOW_ROWS, 120, 'mirrors the app history GET limit 120 (src/vacation/vacation-app-transcript.mjs)');

function makeServer(plan = () => undefined) {
  let clock = 0;
  let liveIndex = 0;
  const cap = { n: 0 };
  let shown = false;
  const rows = [
    { speaker: 'app', body: 'Welcome! Tell me about your vacation.', at: new Date(T0).toISOString(), payload: { liveTranscript: { fixedOpener: true, replyProducer: 'vacation-app-onboarding-opener', jev: { reason: 'fixed_onboarding_opener' } } } },
  ];
  const addRow = (speaker, text, { unruled = false } = {}) => {
    clock += 1;
    liveIndex += 1;
    const app = speaker === 'app' && !unruled;
    const row = {
      speaker,
      body: text,
      at: new Date(T0 + clock * 1000).toISOString(),
      payload: { liveTranscript: { turnIndex: liveIndex, text, ...(app ? { modelId: MODEL } : {}) } },
      ...(app ? { modelId: MODEL } : {}),
    };
    rows.push(row);
    return row;
  };
  const window = () => rows.slice(-APP_HISTORY_WINDOW_ROWS);
  const log = { posts: 0, gets: 0, getsAfterPost: [], ruledAtGet: [], ruledAfterPost: [] };
  let pending = null;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'sha-1144' }) };
    if (init.method === 'POST') {
      log.posts += 1;
      const n = log.posts;
      const step = plan(n) || {};
      const payload = JSON.parse(init.body);
      addRow('customer', payload.text);
      log.getsAfterPost.push(0);
      log.ruledAfterPost.push([]);
      const reply = `Day ${n}: saved stop ${n} on the itinerary.`;
      if (step.timeout) {
        pending = step.storeOnGet ? { text: reply, getsLeft: step.storeOnGet } : null;
        return { status: 504, text: async () => JSON.stringify(VERCEL_504) };
      }
      const appTurnIndex = liveIndex + 1;
      const itinerary = cap.n > 0 && n === cap.n && !step.notStored ? [{ id: 'thing-1', title: 'Rainbow Falls' }] : [];
      if (itinerary.length) shown = true;
      if (step.upsell) {
        const line = 'TimeSyncher doesn\'t book reservations directly, but I can keep the plan ready.';
        addRow('app', line, { unruled: true });
        return { status: 201, text: async () => JSON.stringify({ ok: true, status: 'replied', reply: line, itinerary, trip: { id: tripId } }) };
      }
      if (!step.notStored) addRow('app', reply);
      return {
        status: 201,
        text: async () => JSON.stringify({ ok: true, status: 'replied', reply, modelId: MODEL, appTurnIndex, itinerary, trip: { id: tripId } }),
      };
    }
    log.gets += 1;
    if (log.getsAfterPost.length) log.getsAfterPost[log.getsAfterPost.length - 1] += 1;
    if (pending) {
      pending.getsLeft -= 1;
      if (pending.getsLeft <= 0) {
        addRow('app', pending.text);
        pending = null;
      }
    }
    const turns = window();
    log.ruledAtGet.push(ruledReplyCount({ turns }));
    if (log.ruledAfterPost.length) log.ruledAfterPost.at(-1).push(ruledReplyCount({ turns }));
    return {
      status: 200,
      text: async () => JSON.stringify({ ok: true, eula: { accepted: true }, itinerary: shown ? [{ id: 'thing-1', title: 'Rainbow Falls' }] : [], turns, trip: { id: tripId } }),
    };
  };
  return { fetchImpl, log, rows, window, cap };
}

const sleeps = [];
async function play(server, maxTurns, token) {
  sleeps.length = 0;
  server.cap.n = maxTurns;
  return playCustomerTurns(
    { ...story, reply_backend: 'vk_bot_mcp' },
    {
      origin,
      token,
      tripId,
      hosts: [],
      waitMs: 0,
      secrets: [],
      liveCustomer: true,
      maxTurns,
      customerAsk: async ({ index }) => ({ text: `Customer turn ${index + 1}: add another Hilo stop.`, model: 'gemini-test', cost: null }),
      fetchImpl: server.fetchImpl,
      sleepImpl: async (ms) => { sleeps.push(ms); },
    },
  );
}

{
  const opener = { speaker: 'app', body: 'Welcome', payload: { liveTranscript: { fixedOpener: true } } };
  const app = (n, text) => ({ speaker: 'app', body: text, modelId: MODEL, at: `t${n}`, payload: { liveTranscript: { turnIndex: n } } });
  const before = { turns: [opener, { speaker: 'customer', body: 'hi' }, app(2, 'one')] };
  assert.equal(storedAppTurnChanged(before, null), true, 'first ruled app turn is new');
  const seen = latestStoredAppTurn(before, { ruledOnly: true });
  assert.equal(storedAppTurnChanged(before, seen), false, 'same newest app turn: not stored');
  assert.equal(storedAppTurnChanged({ turns: [...before.turns, { speaker: 'customer', body: 'q' }] }, seen), false, 'customer row only: not stored');
  assert.equal(storedAppTurnChanged({ turns: [{ speaker: 'customer', body: 'q' }, app(4, 'two')] }, seen), true, 'new newest app turn even though the count is unchanged');
  assert.equal(storedAppTurnChanged({ turns: [{ speaker: 'customer', body: 'q' }, app(4, 'two'), { speaker: 'app', body: 'unruled' }] }, seen), true, 'un-ruled tail does not hide the new ruled turn');
  assert.equal(storedAppTurnChanged({ turns: [app(1, 'older')] }, seen), false, 'an older visible app turn does not count');
  assert.equal(storedAppTurnChanged(before, seen, { replyBody: { appTurnIndex: 2 } }), false, 'POST index of an old turn does not count');
  assert.equal(storedAppTurnChanged(before, seen, { replyBody: { appTurnIndex: 4 } }), false, 'POST index absent from the GET does not count');
  assert.equal(storedAppTurnChanged({ turns: [app(4, 'two'), app(2, 'one')] }, seen, { replyBody: { appTurnIndex: 4 } }), true, 'the POST index can identify a stored reply if display order differs');
  const unindexed = (at) => ({ turns: [{ speaker: 'app', body: 'same text', at, modelId: MODEL }] });
  const previous = latestStoredAppTurn(unindexed('t1'));
  assert.equal(storedAppTurnChanged(unindexed('t1'), previous), false, 'same timestamp and text do not count');
  assert.equal(storedAppTurnChanged(unindexed('t2'), previous), true, 'a new timestamp identifies an unindexed reply with repeated text');
  assert.equal(historyWindowFull({ turns: new Array(119).fill({}) }), false);
  assert.equal(historyWindowFull({ turns: new Array(120).fill({}) }), true);
  assert.equal(historyWindowFull({}), false);
}

{
  const server = makeServer();
  const played = await play(server, 70, 'tok-window-70');
  assert.equal(played.reason, '', `70-turn trip must not abort, got ${played.reason} at turn ${played.customerTurnCount}: ${played.detail}`);
  assert.equal(played.customerTurnCount, 70, 'played to the turn cap');
  assert.equal(played.hitTurnCap, true);
  assert.equal(server.log.posts, 70);
  assert.equal(server.rows.length, 1 + 70 * 2, 'server stored opener + 2 rows per turn');
  assert.equal(server.window().length, 120, 'GET capped at 120 rows');
  assert.equal(server.log.ruledAtGet.at(-1), 60, 'ruled app count in the window saturates at 60');
  assert.ok(server.log.ruledAtGet.filter((n) => n === 60).length > 5, 'several turns ran with the count stuck at 60');
  assert.equal(played.storedTurns, 70, 'stored reply tally keeps counting past the window');
  assert.equal(played.customerTurns.filter((t) => t.role === 'app').length, 70);
}

{
  const server = makeServer((n) => (n === 65 ? { notStored: true } : undefined));
  const played = await play(server, 70, 'tok-window-missing');
  assert.equal(played.reason, 'reply-not-stored', `missing reply in a full window must fail, got ${played.reason}`);
  assert.equal(played.customerTurnCount, 65, 'fails on the turn whose reply was not stored');
  assert.equal(server.log.posts, 65);
}

{
  const server = makeServer((n) => (n === 64 ? { timeout: true, storeOnGet: 0 } : undefined));
  const played = await play(server, 70, 'tok-window-504-none');
  assert.equal(played.reason, 'turn-not-stored', `504 with no stored reply must fail, got ${played.reason}`);
  assert.equal(played.customerTurnCount, 64);
  assert.equal(server.log.getsAfterPost[63], 3, 'all three probe GETs ran');
  assert.deepEqual(sleeps, [10000, 20000]);
  assert.equal(played.exchange.probes.length, 3);
  assert.ok(played.exchange.probes.every((p) => p.stored_reply === false));
  assert.equal(played.rescuedTimeouts.count, 0);
}

{
  const server = makeServer((n) => (n === 64 ? { timeout: true, storeOnGet: 2 } : undefined));
  const played = await play(server, 70, 'tok-window-504-rescued');
  assert.equal(played.reason, '', `rescued 504 in a full window must continue, got ${played.reason} ${played.detail}`);
  assert.equal(played.customerTurnCount, 70);
  assert.equal(server.log.getsAfterPost[63], 2, 'stopped probing once the new app turn appeared');
  assert.deepEqual(played.rescuedTimeouts.turns, [64]);
  assert.equal(played.rescuedTimeouts.details[0].probe_attempts, 2);
  assert.ok(played.customerTurns.some((t) => t.role === 'app' && /saved stop 64/.test(t.text)), 'rescued reply fed back into the conversation');
  assert.deepEqual(server.log.ruledAfterPost[62], [60], 'window already saturated before the 504 turn');
  assert.deepEqual(server.log.ruledAfterPost[63], [60, 60], 'ruled count stayed at 60 on the rescuing probe');
}

{
  const server = makeServer((n) => {
    if (n === 63) return { upsell: true };
    if (n === 64) return { timeout: true, storeOnGet: 0 };
    return undefined;
  });
  const played = await play(server, 70, 'tok-window-upsell-504');
  assert.equal(played.reason, 'turn-not-stored', `stale upsell row must not rescue a 504, got ${played.reason}`);
  assert.equal(played.customerTurnCount, 64);
  assert.equal(played.rescuedTimeouts.count, 0);
}

{
  const server = makeServer((n) => (n === 63 ? { upsell: true } : undefined));
  const played = await play(server, 70, 'tok-window-upsell-ok');
  assert.equal(played.reason, '', `got ${played.reason} at ${played.customerTurnCount}`);
  assert.equal(played.customerTurnCount, 70);
}

{
  const server = makeServer((n) => (n === 2 ? { notStored: true } : undefined));
  const played = await play(server, 3, 'tok-small-missing');
  assert.equal(played.reason, 'reply-not-stored');
  assert.equal(played.customerTurnCount, 2);
  assert.equal(played.storedTurns, 1);
}

{
  const server = makeServer((n) => (n === 2 ? { timeout: true } : undefined));
  const played = await play(server, 3, 'tok-small-504-missing');
  assert.equal(played.reason, 'turn-not-stored', 'a customer row alone cannot rescue a 504');
  assert.equal(server.log.getsAfterPost[1], 3);
  assert.equal(played.storedTurns, 1);
}

{
  const server = makeServer();
  const played = await play(server, 5, 'tok-small-ok');
  assert.equal(played.reason, '');
  assert.equal(played.customerTurnCount, 5);
  assert.equal(played.storedTurns, 5);
}

console.log('test_vk_harness_history_window: ok');
