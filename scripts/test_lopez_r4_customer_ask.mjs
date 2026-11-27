#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  assertCouponCode,
  createCouponLedger,
  dryRosterCoupon,
  redeemRosterCoupon,
} from './harness/coupon.mjs';
import {
  customerAskFromEnv,
  isOddCustomerIndex,
  oddEvery,
  personaSeed,
  speakCustomer,
} from './harness/customer-live.mjs';
import { loadBannedHosts } from './harness/fetch-guard.mjs';
import {
  chatGoalsReached,
  playCustomerTurns,
  pricingReactionCaptured,
} from './harness/live-play.mjs';
import { couponPaymentSteps } from './harness/onboarding-capture.mjs';
import { maxTurnsFromEnv, writeOutcomes } from './harness/runtime.mjs';

const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url), 'utf8'));
const seed = personaSeed(story);
assert.ok(seed.goals.length > 0);

const requests = [];
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    requests.push({ method: req.method, contentType: req.headers['content-type'], body });
    const payload = body.index === 1
      ? { reply: 'Could we keep Friday afternoon open for pool time?', model: 'gemini-test', cost: { amount: 2, unit: 'tokens' } }
      : { text: 'We are planning five relaxed days in Orlando with two kids.', model: 'gemini-test', cost: { amount: 3, unit: 'tokens' } };
    const raw = JSON.stringify(payload);
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) });
    res.end(raw);
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const modelUrl = `http://127.0.0.1:${port}/`;

try {
  const ask = customerAskFromEnv({ HARNESS_CUSTOMER_MODEL_URL: modelUrl }, loadBannedHosts());
  const first = await ask({
    lane: 'gemini',
    persona: seed,
    appReply: 'Welcome! Tell me about your vacation.',
    goal: seed.goals[0],
    index: 0,
  });
  assert.equal(first.text, 'We are planning five relaxed days in Orlando with two kids.');
  assert.equal(first.model, 'gemini-test');
  assert.deepEqual(first.cost, { amount: 3, unit: 'tokens' });
  assert.equal(first.url, modelUrl);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.match(requests[0].contentType, /application\/json/);
  assert.ok(requests[0].body.goal.startsWith(seed.goals[0]));
  assert.deepEqual(requests[0].body.disclosure.customerTurns, []);
  assert.ok(requests[0].body.goal.includes(requests[0].body.disclosure.instructions));
  assert.equal(requests[0].body.persona?.name, seed.name);
  assert.deepEqual(requests[0].body.persona?.party?.collaborators, seed.party.collaborators);
  assert.equal(requests[0].body.destination, seed.destination);

  const viaSpeak = await speakCustomer({
    persona: seed,
    appReply: 'Here is a draft for Friday.',
    index: 1,
    ask,
  });
  assert.equal(viaSpeak.kind, 'goal');
  assert.equal(viaSpeak.text, 'Could we keep Friday afternoon open for pool time?');
  assert.equal(viaSpeak.model, 'gemini-test');
  assert.deepEqual(viaSpeak.cost, { amount: 2, unit: 'tokens' });
  assert.equal(requests.length, 2);

  await assert.rejects(
    () => speakCustomer({
      persona: seed,
      appReply: '',
      index: 0,
      ask: async () => ({ text: seed.goals[0], model: 'gemini-test', cost: null, url: modelUrl }),
    }),
    /replayed a seed/,
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const missingAsk = customerAskFromEnv({}, loadBannedHosts());
await assert.rejects(
  () => missingAsk({ lane: 'gemini', persona: seed, appReply: '', goal: seed.goals[0], index: 0 }),
  /harness preflight missing HARNESS_CUSTOMER_MODEL_URL/,
);
await assert.rejects(
  () => speakCustomer({ persona: seed, index: 0 }),
  /harness preflight missing HARNESS_CUSTOMER_MODEL_URL/,
);

const bannedHosts = loadBannedHosts();
assert.ok(bannedHosts.length > 0);
const bannedAsk = customerAskFromEnv({ HARNESS_CUSTOMER_MODEL_URL: `https://${bannedHosts[0]}/v1/chat` }, bannedHosts);
await assert.rejects(
  () => bannedAsk({ lane: 'gemini', persona: seed, appReply: '', goal: seed.goals[0], index: 0 }),
  /harness blocked a model host/,
);

const prevOddEvery = process.env.VK_TEST_ODD_EVERY;
const prevNoOdd = process.env.VK_TEST_NO_ODD;
try {
  delete process.env.VK_TEST_ODD_EVERY;
  delete process.env.VK_TEST_NO_ODD;
  assert.equal(oddEvery(), 10);
  assert.equal(isOddCustomerIndex(0), false);
  assert.equal(isOddCustomerIndex(2), false);
  assert.equal(isOddCustomerIndex(8), false);
  assert.equal(isOddCustomerIndex(9), true);
  assert.equal(isOddCustomerIndex(19), true);

  let askCalledAt2 = false;
  const turn2 = await speakCustomer({
    persona: seed,
    index: 2,
    ask: async () => {
      askCalledAt2 = true;
      return { text: 'Let us add a morning beach walk on day two.', model: 'gemini-test', cost: null };
    },
  });
  assert.equal(askCalledAt2, true);
  assert.equal(turn2.kind, 'goal');

  const turn9 = await speakCustomer({ persona: seed, index: 9 });
  assert.notEqual(turn9.kind, 'goal');

  process.env.VK_TEST_ODD_EVERY = '5';
  assert.equal(oddEvery(), 5);
  assert.equal(isOddCustomerIndex(3), false);
  assert.equal(isOddCustomerIndex(4), true);
  assert.equal(isOddCustomerIndex(9), true);

  process.env.VK_TEST_NO_ODD = '1';
  assert.equal(oddEvery(), 0);
  assert.equal(isOddCustomerIndex(4), false);
  assert.equal(isOddCustomerIndex(9), false);
} finally {
  if (prevOddEvery === undefined) delete process.env.VK_TEST_ODD_EVERY;
  else process.env.VK_TEST_ODD_EVERY = prevOddEvery;
  if (prevNoOdd === undefined) delete process.env.VK_TEST_NO_ODD;
  else process.env.VK_TEST_NO_ODD = prevNoOdd;
}

assert.equal(maxTurnsFromEnv({}), 5);
assert.equal(maxTurnsFromEnv({ VK_TEST_MAX_TURNS: '100' }), 100);
assert.equal(maxTurnsFromEnv({ VK_TEST_MAX_TURNS: '1' }), 1);
assert.equal(maxTurnsFromEnv({ VK_TEST_MAX_TURNS: '-5' }), 1);
assert.equal(maxTurnsFromEnv({ VK_TEST_MAX_TURNS: '0' }), 5);
const runtimeSrc = fs.readFileSync(new URL('./harness/runtime.mjs', import.meta.url), 'utf8');
assert.equal(runtimeSrc.includes('maxTurns: 4'), false);
assert.match(runtimeSrc, /VK_TEST_MAX_TURNS/);

assert.equal(pricingReactionCaptured([]), false);
assert.equal(pricingReactionCaptured([
  { role: 'app', text: 'We planned five great days for Orlando.' },
  { role: 'customer', odd: false, text: 'Sounds good, that works for us!' },
]), false);
assert.equal(pricingReactionCaptured([
  { role: 'app', text: 'The household plan is $49 per year for unlimited vacations.' },
  { role: 'customer', odd: true, text: 'That price sounds fair and works for us.' },
]), false);
assert.equal(pricingReactionCaptured([
  { role: 'app', text: 'The household plan is $49 per year for unlimited vacations.' },
  { role: 'customer', odd: false, text: 'Can we add a quiet breakfast spot?' },
]), false);
const pricedTurns = [
  { role: 'app', text: 'The household plan is $49 per year for unlimited vacations.' },
  { role: 'customer', odd: false, text: 'That price sounds fair and works for us.' },
];
assert.equal(pricingReactionCaptured(pricedTurns), true);
assert.equal(chatGoalsReached({ itineraryCount: 0, customerTurns: pricedTurns, index: 1, maxTurns: 100 }).done, false);
assert.equal(chatGoalsReached({ itineraryCount: 2, customerTurns: [{ role: 'app', text: 'Itinerary ready.' }], index: 1, maxTurns: 100 }).done, false);
const reached = chatGoalsReached({ itineraryCount: 2, customerTurns: pricedTurns, index: 1, maxTurns: 100 });
assert.equal(reached.itineraryOk, true);
assert.equal(reached.pricingOk, true);
assert.equal(reached.atCap, false);
assert.equal(reached.done, true);
assert.equal(chatGoalsReached({ itineraryCount: 0, customerTurns: [], index: 99, maxTurns: 100 }).atCap, true);

const origin = 'https://vacation-staging.timesyncher.com';
const tripId = '11111111-2222-4333-8444-555555555555';
const seenHeaders = [];
const secrets = ['tok-session-123456'];
let postCount = 0;
const appTurns = [];
const livePlayed = await playCustomerTurns(
  { ...story, reply_backend: 'vk_bot_mcp' },
  {
    origin,
    token: 'tok-session-123456',
    tripId,
    hosts: loadBannedHosts(),
    waitMs: 0,
    secrets,
    liveCustomer: true,
    maxTurns: 10,
    customerAsk: async ({ index }) => ({
      text: index === 0
        ? 'We are heading to Orlando for five family days.'
        : 'That household plan price sounds fair and works for us.',
      model: 'gemini-test',
      cost: { amount: 1, unit: 'tokens' },
    }),
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(String(url));
      seenHeaders.push({ method: init.method || 'GET', path: parsed.pathname, headers: init.headers || {} });
      if (parsed.pathname === '/api/version') {
        return { status: 200, text: async () => JSON.stringify({ sha: 'sha-abc' }) };
      }
      if (init.method === 'POST') {
        postCount += 1;
        const reply = postCount === 1
          ? 'The household plan is $49 per year for unlimited vacations. Day 1 is saved.'
          : 'Great, your Orlando days are saved on the itinerary.';
        appTurns.push({ speaker: 'app', body: reply, modelId: 'anthropic/claude-haiku-5.5' });
        return {
          status: 201,
          headers: {
            getSetCookie: () => ['ts_vacation_web_access=web-access-cookie-secret-999; Path=/; HttpOnly'],
          },
          text: async () => JSON.stringify({
            ok: true,
            status: 'replied',
            reply,
            modelId: 'anthropic/claude-haiku-5.5',
            itinerary: [{ id: 'thing-1', title: 'Orlando Day 1' }],
            turns: appTurns,
            trip: { id: tripId, shareToken: 'share-lopez' },
          }),
        };
      }
      return {
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          eula: { accepted: true },
          itinerary: postCount > 0 ? [{ id: 'thing-1', title: 'Orlando Day 1' }] : [],
          turns: appTurns,
          trip: { id: tripId, shareToken: 'share-lopez' },
        }),
      };
    },
  },
);
assert.equal(livePlayed.reason, '');
assert.equal(livePlayed.customerTurnCount, 2);
assert.equal(livePlayed.observedItineraryCount, 1);
assert.equal(livePlayed.pricingReactionCaptured, true);
assert.equal(livePlayed.hitTurnCap, false);
assert.equal(livePlayed.webAccessCookie, true);
assert.equal(secrets.includes('web-access-cookie-secret-999'), true);
const forwarded = seenHeaders.filter((entry) => entry.headers.cookie === 'ts_vacation_web_access=web-access-cookie-secret-999');
assert.ok(forwarded.length >= 2);
assert.equal(forwarded[0].headers['x-timesyncher-web-access-token'], 'web-access-cookie-secret-999');

let capPosts = 0;
const capTurns = [];
const capped = await playCustomerTurns(
  { ...story, reply_backend: 'vk_bot_mcp' },
  {
    origin,
    token: 'tok-session-cap-123',
    tripId,
    hosts: loadBannedHosts(),
    waitMs: 0,
    secrets: [],
    liveCustomer: true,
    maxTurns: 2,
    customerAsk: async ({ index }) => ({
      text: `Customer question number ${index + 1} about parks.`,
      model: 'gemini-test',
      cost: null,
    }),
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/api/version') return { status: 200, text: async () => JSON.stringify({ sha: 'sha-cap' }) };
      if (init.method === 'POST') {
        capPosts += 1;
        if (capPosts === 1) {
          return {
            status: 201,
            text: async () => JSON.stringify({
              ok: true,
              status: 'replied',
              reply: 'TimeSyncher doesn\'t book reservations directly, but we can set up your AI for reservations.',
              itinerary: [{ id: 'thing-cap', title: 'Park Day' }],
              turns: capTurns,
              trip: { id: tripId, shareToken: 'share-cap' },
            }),
          };
        }
        capTurns.push({ speaker: 'app', body: 'Added park timing.', modelId: 'anthropic/claude-haiku-5.5' });
        return {
          status: 201,
          text: async () => JSON.stringify({
            ok: true,
            status: 'replied',
            reply: 'Added park timing.',
            modelId: 'anthropic/claude-haiku-5.5',
            itinerary: [{ id: 'thing-cap', title: 'Park Day' }],
            turns: capTurns,
            trip: { id: tripId, shareToken: 'share-cap' },
          }),
        };
      }
      return {
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          eula: { accepted: true },
          itinerary: [{ id: 'thing-cap', title: 'Park Day' }],
          turns: capTurns,
          trip: { id: tripId, shareToken: 'share-cap' },
        }),
      };
    },
  },
);
assert.equal(capped.reason, '');
assert.equal(capped.customerTurnCount, 2);
assert.equal(capped.pricingReactionCaptured, false);
assert.equal(capped.hitTurnCap, true);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lopez-r4-outcomes-'));
try {
  const payload = {
    itineraryCount: 3,
    itineraryCountSource: 'db',
    keepsakeOk: true,
    pricingReactionCaptured: true,
    customerTurnCount: 7,
    hitTurnCap: false,
    reason: '',
    customerTurns: [
      { role: 'customer', cost: { amount: 2, unit: 'tokens' } },
      { role: 'app', cost: { amount: 5, unit: 'tokens' } },
    ],
    liveShaStart: 'sha-1',
    liveShaEnd: 'sha-1',
  };
  const returned = writeOutcomes(tmpDir, payload);
  assert.equal(returned, payload);
  const written = JSON.parse(fs.readFileSync(path.join(tmpDir, 'outcomes.json'), 'utf8'));
  assert.equal(written.itineraryCount, 3);
  assert.equal(written.keepsakeOk, true);
  assert.equal(written.pricingReactionCaptured, true);
  assert.equal(written.customerTurnCount, 7);
  assert.equal(written.hitTurnCap, false);
  assert.equal(written.reason, '');
  assert.equal(written.costs.length, 2);
  assert.equal(written.liveShaStart, 'sha-1');
  assert.equal(written.liveShaEnd, 'sha-1');

  const blockingFile = path.join(tmpDir, 'not-a-directory');
  fs.writeFileSync(blockingFile, 'x');
  assert.doesNotThrow(() => writeOutcomes(blockingFile, payload));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const mintedCode = 'TS-FIXTURE001';
assert.equal(assertCouponCode(mintedCode, mintedCode), mintedCode);
assert.throws(() => assertCouponCode(mintedCode), /VK-TEST/);
const mintedStory = {
  ...story,
  story_id: 'vk-minted-001',
  coupon: { code: mintedCode, mintedCode },
};
const mintedLedger = createCouponLedger();
const mintedDry = dryRosterCoupon({ story: mintedStory, runId: 'dry-minted', origin, ledger: mintedLedger });
assert.equal(mintedDry.pass, true);
assert.equal(mintedLedger.redeemed(mintedCode, mintedCode), false);
const mintedLiveLedger = createCouponLedger();
const mintedLive = await redeemRosterCoupon({
  story: mintedStory,
  runId: 'live-minted',
  origin,
  ledger: mintedLiveLedger,
  fetchImpl: async () => ({
    status: 200,
    json: async () => ({ ok: true, status: 'coupon_redeemed', order: { amountCents: 0 }, session: { token: 'tok_minted_fixture' } }),
  }),
});
assert.equal(mintedLive.pass, true);
assert.equal(mintedLive.status, 'redeemed');
assert.equal(mintedLiveLedger.redeemed(mintedCode, mintedCode), true);
const paymentSteps = couponPaymentSteps({ code: mintedCode, sessionToken: 'tok_minted_fixture', origin, minted: mintedCode });
assert.equal(paymentSteps.mode, 'coupon');

const onboardingSrc = fs.readFileSync(new URL('./harness/onboarding-capture.mjs', import.meta.url), 'utf8');
assert.match(onboardingSrc, /waitForSelector\('#eulaScreen', \{ state: 'visible'/);

console.log('test_lopez_r4_customer_ask: ok');
