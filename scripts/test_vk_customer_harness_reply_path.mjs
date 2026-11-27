#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTurnPayload, playCustomerTurns, replyModelStamp, ruledReplyCount } from './harness/live-play.mjs';
import { chatLeftNoThing } from './harness/runtime.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
story.reply_backend = 'openrouter';
story.turns = [story.turns[0]];
const origin = 'https://vacation-staging.timesyncher.com';
const tripId = '11111111-2222-4333-8444-555555555555';
const hosts = [];
const opener = {
  speaker: 'app',
  body: 'Welcome, Avery.',
  modelId: null,
  payload: { liveTranscript: { fixedOpener: true, replyProducer: 'vacation-app-onboarding-opener', jev: { jevRan: false, reason: 'fixed_onboarding_opener' } } },
};
const ruled = {
  speaker: 'app',
  body: 'Hilo stays light from March 4 to March 8.',
  modelId: 'anthropic/claude-haiku-5.5',
  responseModel: 'anthropic/claude-haiku-5.5',
};
const thing = { id: 'thing-hilo', title: 'Hilo stay' };

function scriptedFetch({ replyBody, historyTurns }) {
  const calls = [];
  let posted = false;
  const fetchImpl = async (url, init) => {
    const parsed = new URL(String(url));
    const method = init?.method || 'GET';
    calls.push({ url: parsed, method, body: init?.body ? JSON.parse(init.body) : null });
    if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'abc123' }) };
    if (method === 'GET') {
      const turns = posted ? (historyTurns || replyBody.turns || [opener]) : [opener];
      return { status: 200, text: async () => JSON.stringify({ ok: true, eula: { accepted: true }, turns, itinerary: [], trip: { id: tripId, shareToken: 'throwaway' } }) };
    }
    posted = true;
    return { status: 201, text: async () => JSON.stringify(replyBody) };
  };
  return { calls, fetchImpl };
}

const canned = scriptedFetch({
  replyBody: { ok: true, status: 'replied', reply: 'Welcome, Avery.', turns: [opener], itinerary: [] },
});
const cannedPlay = await playCustomerTurns(story, { origin, token: 'fixture-session', tripId, hosts, waitMs: 0, fetchImpl: canned.fetchImpl });
assert.equal(cannedPlay.reason, 'reply-not-from-rules');
assert.equal(cannedPlay.storedTurns, 0);
assert.match(cannedPlay.detail, /modelId/);
assert.equal(replyModelStamp(canned.calls.find((call) => call.method === 'POST') ? { reply: 'Welcome, Avery.' } : {}).modelId, '');
assert.equal(ruledReplyCount({ turns: [opener] }), 0);

const posted = scriptedFetch({
  replyBody: {
    ok: true,
    status: 'replied',
    reply: ruled.body,
    modelId: ruled.modelId,
    responseModel: ruled.responseModel,
    itinerary: [thing],
    turns: [{ speaker: 'customer', body: story.turns[0].text }, opener, ruled],
  },
});
const played = await playCustomerTurns(story, { origin, token: 'fixture-session', tripId, hosts, waitMs: 0, fetchImpl: posted.fetchImpl });
assert.equal(played.reason, '');
assert.equal(played.storedTurns, 1);
assert.equal(played.observedItineraryCount, 1);
assert.equal(chatLeftNoThing({ itineraryCount: 1, itineraryCountSource: 'db' }), false);
const post = posted.calls.filter((call) => call.method === 'POST');
assert.equal(post.length, 1);
assert.equal(post[0].url.pathname, '/api/vacation-itinerary');
assert.equal(post[0].url.searchParams.get('app'), '1');
assert.equal(post[0].url.searchParams.get('session'), 'fixture-session');
assert.equal(post[0].url.searchParams.get('tripId'), null);
assert.equal(post[0].body.tripId, tripId);
assert.equal(post[0].body.text, story.turns[0].text);
assert.deepEqual(post[0].body.attachments, []);
assert.equal(post[0].body.voiceMode, false);
assert.equal(post[0].body.browserTranscription, false);
assert.equal(buildTurnPayload(story.turns[0], tripId).voiceMode, false);
const gets = posted.calls.filter((call) => call.method === 'GET' && call.url.pathname === '/api/vacation-itinerary');
assert.ok(gets.every((call) => call.url.searchParams.get('tripId') === tripId));

const emptyThings = scriptedFetch({
  replyBody: {
    ok: true,
    status: 'replied',
    reply: ruled.body,
    modelId: ruled.modelId,
    responseModel: ruled.responseModel,
    itinerary: [],
    turns: [{ speaker: 'customer', body: story.turns[0].text }, opener, ruled],
  },
});
const noThing = await playCustomerTurns(story, { origin, token: 'fixture-session', tripId, hosts, waitMs: 0, fetchImpl: emptyThings.fetchImpl });
assert.equal(noThing.reason, '');
assert.equal(noThing.observedItineraryCount, 0);
assert.equal(chatLeftNoThing(noThing), true);
const runtime = fs.readFileSync(new URL('./harness/runtime.mjs', import.meta.url), 'utf8');
assert.match(runtime, /chatLeftNoThing\(played\)/);
assert.match(runtime, /no-thing-after-chat/);
const renderer = fs.readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8');
assert.match(renderer, /app text did not come from \$\{LIVE_REPLY_PRODUCER\}/);

console.log('test_vk_customer_harness_reply_path: ok');
