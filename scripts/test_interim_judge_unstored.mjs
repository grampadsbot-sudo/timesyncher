#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judgeInterimReply, judgedInterimOrNull } from '../src/vacation/interim-judge.mjs';
import { checkoutEnv, stripePublishableKey } from '../src/vacation/stripe-env.mjs';
import { showPaymentStep } from './harness/onboarding-capture.mjs';
import checkoutConfig from '../routes/checkout-config.mjs';
import { noteUnstoredRows, stampUnstoredExchange, unstoredTurnNote } from './harness/unstored-turn.mjs';
import { renderDialog } from './harness/live-outputs.mjs';
import { runCustomer } from './harness/customer.mjs';

const good = { choices: [{ message: { content: '{"template":false,"canShip":true}' } }] };
const bad = { choices: [{ message: { content: 'sure' } }] };
let calls = 0;
const retried = await judgeInterimReply({
  text: 'Thursday stays a town walk.',
  customerTurn: 'Thursday is a town walk.',
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl: async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.reasoning.enabled, false);
    assert.equal(body.max_tokens, 256);
    return { ok: true, status: 200, json: async () => (calls === 1 ? bad : good) };
  },
});
assert.equal(calls, 2);
assert.equal(retried.canShip, true);
assert.equal(retried.template, false);

await assert.rejects(
  () => judgeInterimReply({
    text: 'Thursday stays a town walk.',
    customerTurn: 'Thursday is a town walk.',
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => bad }),
  }),
  /INTERIM_JUDGE_UNUSABLE/,
);
const dropped = await judgedInterimOrNull({
  text: 'Thursday stays a town walk.',
  customerTurn: 'Thursday is a town walk.',
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => bad }),
});
assert.equal(dropped, null);
const source = fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
assert.match(source, /judgedInterimOrNull/);
assert.match(source, /\.catch\(\(\) => \(\{ text: null/);

const exchange = {
  body: { ok: false, status: 'reply_unavailable', error: 'INTERIM_JUDGE_UNUSABLE', modelId: 'anthropic/claude-haiku-5.5', responseModel: 'anthropic/claude-haiku-5.5' },
};
const stamped = stampUnstoredExchange({
  turns: [
    { role: 'customer', turnIndex: 4, text: 'Add a quiet morning walk.' },
  ],
}, exchange);
assert.equal(unstoredTurnNote(stamped), 'app status: reply_unavailable error: INTERIM_JUDGE_UNUSABLE model: anthropic/claude-haiku-5.5');
const rows = noteUnstoredRows([], { exchange, timings: [{ n: 4, wall_ms: 14000 }] });
assert.equal(rows[0].app_error, 'INTERIM_JUDGE_UNUSABLE');
assert.equal(rows[0].app_status, 'reply_unavailable');
assert.equal(rows[0].stored_model, 'anthropic/claude-haiku-5.5');
assert.equal(rows[0].n, 4);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unstored-turn-'));
const drive = 'd'.repeat(40);
await renderDialog({
  token: 'fixture-session',
  outDir: dir,
  secrets: [],
  buildSha: drive,
  loadTranscript: async () => ({ ...stamped, buildSha: drive, driveBuildEnd: drive }),
  spawnImpl: () => ({ status: 2, stdout: '', stderr: 'refused: live transcript has no app reply\n' }),
});
const pdf = fs.readFileSync(path.join(dir, 'dialog.pdf'));
assert.match(pdf.toString('latin1'), /INTERIM_JUDGE_UNUSABLE/);
assert.match(pdf.toString('latin1'), /anthropic\/claude-haiku-5\.5/);
fs.rmSync(dir, { recursive: true, force: true });

const card = await runCustomer({
  story_id: 'dry-run',
  reply_backend: 'openrouter',
  customer: { name: 'Avery Hale', email_alias: 'avery' },
  turns: [],
}, {
  runId: 'r-interim',
  outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'unstored-card-')),
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
  play: async () => ({
    reason: 'turn-not-stored',
    transcript: null,
    pdfText: '',
    dialogOk: false,
    chromeOk: false,
    chromeDetail: '',
    exchange,
    timings: [{ n: 4, wall_ms: 14000 }],
    liveShaStart: drive,
    liveShaEnd: drive,
  }),
});
assert.equal(card.reason, 'turn-not-stored');
assert.equal(card.turns[0].app_error, 'INTERIM_JUDGE_UNUSABLE');
assert.equal(card.turns[0].stored_model, 'anthropic/claude-haiku-5.5');
assert.equal(card.checks.find((check) => check.id === 'no-stub-chrome').pass, false);
assert.equal(card.checks.find((check) => check.id === 'no-stub-chrome').detail, 'not-clean');

const cleanCard = await runCustomer({
  story_id: 'dry-run',
  reply_backend: 'openrouter',
  customer: { name: 'Avery Hale', email_alias: 'avery' },
  turns: [],
}, {
  runId: 'r-clean',
  outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'clean-card-')),
  cleanup: async () => ({ deleted: {}, remaining: 0 }),
  play: async () => ({
    reason: '',
    transcript: { turns: [] },
    pdfText: '',
    dialogOk: true,
    chromeOk: true,
    chromeDetail: '',
    timings: [],
    liveShaStart: drive,
    liveShaEnd: drive,
  }),
});
assert.equal(cleanCard.checks.find((check) => check.id === 'no-stub-chrome').detail, 'clean');

const saved = {
  ALLOW_LIVE_STRIPE: process.env.ALLOW_LIVE_STRIPE,
  STRIPE_MODE: process.env.STRIPE_MODE,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  STRIPE_TEST_PUBLISHABLE_KEY: process.env.STRIPE_TEST_PUBLISHABLE_KEY,
  TIMESYNCHER_TEST_BASE_PRICE_CENTS: process.env.TIMESYNCHER_TEST_BASE_PRICE_CENTS,
  TIMESYNCHER_BASE_PRICE_CENTS: process.env.TIMESYNCHER_BASE_PRICE_CENTS,
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS,
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS,
  TIMESYNCHER_MEDIA_PRICE_CENTS: process.env.TIMESYNCHER_MEDIA_PRICE_CENTS,
  TIMESYNCHER_SINGLE_NAME: process.env.TIMESYNCHER_SINGLE_NAME,
  TIMESYNCHER_UNLIMITED_NAME: process.env.TIMESYNCHER_UNLIMITED_NAME,
  TIMESYNCHER_COLLABORATOR_NAME: process.env.TIMESYNCHER_COLLABORATOR_NAME,
  TIMESYNCHER_MEDIA_NAME: process.env.TIMESYNCHER_MEDIA_NAME,
  TIMESYNCHER_CHECKOUT_CURRENCY: process.env.TIMESYNCHER_CHECKOUT_CURRENCY,
};
const testKey = `pk_test_${'a'.repeat(40)}`;
const liveKey = `pk_live_${'b'.repeat(40)}`;
process.env.STRIPE_MODE = 'live';
process.env.STRIPE_PUBLISHABLE_KEY = testKey;
process.env.ALLOW_LIVE_STRIPE = 'true';
process.env.TIMESYNCHER_BASE_PRICE_CENTS = '9900';
process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS = '100';
process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS = '100';
process.env.TIMESYNCHER_MEDIA_PRICE_CENTS = '100';
process.env.TIMESYNCHER_SINGLE_NAME = 'Single';
process.env.TIMESYNCHER_UNLIMITED_NAME = 'Unlimited';
process.env.TIMESYNCHER_COLLABORATOR_NAME = 'Collaborator';
process.env.TIMESYNCHER_MEDIA_NAME = 'Media';
process.env.TIMESYNCHER_CHECKOUT_CURRENCY = 'usd';
function response() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
  };
}
const stagingRes = response();
await checkoutConfig({ method: 'GET', headers: { host: 'vacation-staging.timesyncher.com' } }, stagingRes);
const stagingBody = JSON.parse(stagingRes.body);
assert.equal(stagingRes.statusCode, 200);
assert.equal(stagingBody.publishableKey, testKey);
assert.equal(stagingBody.mode, 'test');
assert.equal(stagingBody.products.single.amount, 9900);
process.env.STRIPE_PUBLISHABLE_KEY = liveKey;
const refused = response();
await checkoutConfig({ method: 'GET', headers: { host: 'vacation-staging.timesyncher.com' } }, refused);
assert.equal(refused.statusCode, 503);
assert.equal(refused.body.includes(liveKey), false);
const prodRes = response();
await checkoutConfig({ method: 'GET', headers: { host: 'vacation.timesyncher.com' } }, prodRes);
const prodBody = JSON.parse(prodRes.body);
assert.equal(prodBody.publishableKey, liveKey);
assert.equal(prodBody.mode, 'live');
assert.equal(prodBody.products.single.amount, 9900);
assert.throws(
  () => stripePublishableKey(checkoutEnv({ ...process.env, STRIPE_PUBLISHABLE_KEY: liveKey }, 'vacation-staging.timesyncher.com')),
  /does not match STRIPE_MODE=test/,
);
await showPaymentStep({
  waitForResponse: async () => ({ url: () => '/api/create-payment-intent', json: async () => ({ livemode: false }) }),
  async click() {},
  async waitForSelector() {},
});
await assert.rejects(
  () => showPaymentStep({
    waitForResponse: async () => ({ url: () => '/api/create-payment-intent', json: async () => ({ livemode: true }) }),
    async click() {},
    async waitForSelector() {},
  }),
  /stripe is not test mode/,
);
const screen = fs.readFileSync(new URL('./harness/onboarding-capture.mjs', import.meta.url), 'utf8');
assert.match(screen, /checkout-payment: stripe is not test mode/);
assert.match(screen, /livemode !== false/);
for (const [key, value] of Object.entries(saved)) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

console.log('test_interim_judge_unstored: ok');
