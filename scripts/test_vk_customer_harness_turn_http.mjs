#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { playCustomerTurns, turnFailure } from './harness/live-play.mjs';
import { runCustomer } from './harness/customer.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
story.reply_backend = 'openrouter';
story.turns = [story.turns[0]];
const origin = 'https://vacation-staging.timesyncher.com';
const tripId = '11111111-2222-4333-8444-555555555555';
const sessionToken = 'fixture-session-token-value-123';
const shareSlug = 'intake-throwaway-slug';
const failed = {
  ok: false,
  status: 'reply_unavailable',
  error: 'The operation was aborted.',
  code: '',
  modelId: null,
  responseModel: null,
  shareToken: shareSlug,
  publicUrl: `https://vacation-staging.timesyncher.com/shared/${shareSlug}`,
  session: { token: sessionToken },
  echo: sessionToken,
};

const played = await playCustomerTurns(story, {
  origin,
  token: sessionToken,
  tripId,
  hosts: [],
  waitMs: 0,
  secrets: [sessionToken, shareSlug],
  fetchImpl: async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'abc123' }) };
    if (init?.method === 'POST') return { status: 502, text: async () => JSON.stringify(failed) };
    return {
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        eula: { accepted: true },
        turns: [{ speaker: 'app', modelId: null, payload: { liveTranscript: { fixedOpener: true, replyProducer: 'vacation-app-onboarding-opener', jev: { reason: 'fixed_onboarding_opener' } } } }],
        itinerary: [],
        trip: { id: tripId },
      }),
    };
  },
});
assert.equal(turnFailure(502, failed), 'turn-not-stored');
assert.equal(played.reason, 'turn-not-stored');
assert.equal(played.storedTurns, 0);
assert.equal(played.exchange.post_status, 502);
assert.equal(played.exchange.body.status, 'reply_unavailable');
assert.equal(played.exchange.body.error, 'The operation was aborted.');
assert.equal(played.exchange.body.modelId, null);
assert.equal(played.exchange.body.responseModel, null);
assert.deepEqual(played.exchange.polls, []);
assert.equal(played.exchange.timeline.length, 1);
assert.equal(played.exchange.timeline[0].kind, 'post');
assert.equal(played.exchange.timeline[0].status, 502);
const packed = JSON.stringify(played.exchange);
assert.equal(packed.includes(sessionToken), false);
assert.equal(packed.includes(shareSlug), false);
assert.equal(packed.includes('/shared/'), false);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-turn-http-'));
const card = await runCustomer(story, {
  runId: 'r1',
  outDir: dir,
  secrets: [sessionToken],
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
  play: async () => played,
});
assert.equal(card.reason, 'turn-not-stored');
assert.equal(card.turns.length, 1);
assert.equal(card.turns[0].app_status, 'reply_unavailable');
assert.equal(card.turns[0].app_error, 'The operation was aborted.');
assert.equal(card.turns[0].stored_model, '');
assert.equal(card.cost.state, 'not-run');
assert.equal(card.turn_http.post_status, 502);
assert.equal(card.turn_http.body.error, 'The operation was aborted.');
assert.deepEqual(card.turn_http.polls, []);
const written = fs.readFileSync(path.join(dir, 'scorecard.json'), 'utf8');
assert.equal(written.includes(sessionToken), false);
assert.equal(written.includes(shareSlug), false);
assert.match(written, /reply_unavailable/);
assert.match(written, /The operation was aborted/);
fs.rmSync(dir, { recursive: true, force: true });

const flaggedBody = {
  ok: false,
  status: 'reply_unavailable',
  error: 'first_intake_reply_flagged',
  modelId: null,
  responseModel: null,
};
const flagged = await playCustomerTurns(story, {
  origin,
  token: sessionToken,
  tripId,
  hosts: [],
  waitMs: 0,
  secrets: [sessionToken],
  fetchImpl: async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'abc123' }) };
    if (init?.method === 'POST') return { status: 502, text: async () => JSON.stringify(flaggedBody) };
    return {
      status: 200,
      text: async () => JSON.stringify({ ok: true, eula: { accepted: true }, turns: [], itinerary: [], trip: { id: tripId } }),
    };
  },
});
assert.equal(turnFailure(502, flaggedBody), 'first-intake-reply-flagged');
assert.equal(flagged.reason, 'first-intake-reply-flagged');
assert.equal(flagged.exchange.post_status, 502);
assert.equal(flagged.exchange.body.error, 'first_intake_reply_flagged');
assert.equal(turnFailure(502, { ok: false, error: 'The operation was aborted.' }), 'turn-not-stored');
const flaggedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-intake-flag-'));
const flaggedCard = await runCustomer(story, {
  runId: 'r2',
  outDir: flaggedDir,
  secrets: [sessionToken],
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
  play: async () => flagged,
});
assert.equal(flaggedCard.reason, 'first-intake-reply-flagged');
assert.equal(flaggedCard.turn_http.body.error, 'first_intake_reply_flagged');
fs.rmSync(flaggedDir, { recursive: true, force: true });

const renderer = fs.readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.match(renderer, /app text did not come from \$\{LIVE_REPLY_PRODUCER\}/);

console.log('test_vk_customer_harness_turn_http: ok');
