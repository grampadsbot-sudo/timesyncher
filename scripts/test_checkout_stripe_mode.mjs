#!/usr/bin/env node
import assert from 'node:assert/strict';
import checkoutConfig from '../routes/checkout-config.mjs';
import { checkoutPaymentIsTestMode, showPaymentStep } from './harness/onboarding-capture.mjs';

const testKey = `pk_test_${'a'.repeat(24)}`;
const liveKey = `pk_live_${'b'.repeat(24)}`;

assert.equal(checkoutPaymentIsTestMode({
  configOk: true,
  config: { ok: true, publishableKey: testKey, mode: 'test' },
  pay: { livemode: false },
}), true);
assert.equal(checkoutPaymentIsTestMode({
  configOk: false,
  config: { ok: false, error: 'Stripe publishable key does not match STRIPE_MODE=test.' },
  pay: { livemode: false },
}), false);
assert.equal(checkoutPaymentIsTestMode({
  configOk: true,
  config: { ok: true, publishableKey: liveKey, mode: 'live' },
  pay: { livemode: true },
}), false);
assert.equal(checkoutPaymentIsTestMode({
  configOk: true,
  config: { ok: true, publishableKey: testKey, mode: 'test' },
  pay: { livemode: true },
}), false);
assert.equal(checkoutPaymentIsTestMode({
  configOk: true,
  config: { ok: true, publishableKey: testKey, mode: 'test' },
  pay: {},
}), false);

const saved = {
  STRIPE_MODE: process.env.STRIPE_MODE,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  ALLOW_LIVE_STRIPE: process.env.ALLOW_LIVE_STRIPE,
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
process.env.STRIPE_MODE = 'live';
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

process.env.STRIPE_PUBLISHABLE_KEY = testKey;
const stagingTest = response();
await checkoutConfig({ method: 'GET', headers: { host: 'vacation-staging.timesyncher.com' } }, stagingTest);
const stagingTestBody = JSON.parse(stagingTest.body);
assert.equal(stagingTest.statusCode, 200);
assert.equal(stagingTestBody.mode, 'test');
assert.equal(stagingTestBody.publishableKey, testKey);
assert.equal(String(stagingTestBody.publishableKey).startsWith('pk_test_'), true);
assert.equal(stagingTestBody.products.single.amount, 9900);

process.env.STRIPE_PUBLISHABLE_KEY = liveKey;
const stagingLive = response();
await checkoutConfig({ method: 'GET', headers: { host: 'vacation-staging.timesyncher.com' } }, stagingLive);
assert.equal(stagingLive.statusCode, 503);
assert.equal(stagingLive.body.includes(liveKey), false);
assert.equal(stagingLive.body.includes('pk_live_'), false);
assert.match(stagingLive.body, /does not match STRIPE_MODE=test/);

const prod = response();
await checkoutConfig({ method: 'GET', headers: { host: 'vacation.timesyncher.com' } }, prod);
const prodBody = JSON.parse(prod.body);
assert.equal(prod.statusCode, 200);
assert.equal(prodBody.mode, 'live');
assert.equal(prodBody.products.single.amount, 9900);

let iframe = false;
await showPaymentStep({
  waitForResponse(predicate) {
    const config = {
      url: () => 'https://vacation-staging.timesyncher.com/api/checkout-config',
      ok: () => true,
      json: async () => ({ ok: true, publishableKey: testKey, mode: 'test' }),
    };
    const pay = {
      url: () => 'https://vacation-staging.timesyncher.com/api/create-payment-intent',
      json: async () => ({ ok: true, livemode: false }),
    };
    if (predicate(config)) return Promise.resolve(config);
    if (predicate(pay)) return Promise.resolve(pay);
    return new Promise(() => {});
  },
  async click() {},
  async waitForSelector() { iframe = true; },
});
assert.equal(iframe, true);

await assert.rejects(() => showPaymentStep({
  waitForResponse(predicate) {
    const config = {
      url: () => 'https://vacation-staging.timesyncher.com/api/checkout-config',
      ok: () => false,
      json: async () => ({ ok: false, error: 'Stripe publishable key does not match STRIPE_MODE=test.' }),
    };
    if (predicate(config)) return Promise.resolve(config);
    return new Promise(() => {});
  },
  async click() {},
  async waitForSelector() { throw new Error('should not wait for the payment iframe'); },
}), /stripe is not test mode/);

await assert.rejects(() => showPaymentStep({
  waitForResponse(predicate) {
    const config = {
      url: () => 'https://vacation-staging.timesyncher.com/api/checkout-config',
      ok: () => true,
      json: async () => ({ ok: true, publishableKey: testKey, mode: 'test' }),
    };
    const pay = {
      url: () => 'https://vacation-staging.timesyncher.com/api/create-payment-intent',
      json: async () => ({ ok: true, livemode: true }),
    };
    if (predicate(config)) return Promise.resolve(config);
    if (predicate(pay)) return Promise.resolve(pay);
    return new Promise(() => {});
  },
  async click() {},
  async waitForSelector() { throw new Error('should not wait for the payment iframe'); },
}), /stripe is not test mode/);

for (const [key, value] of Object.entries(saved)) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

console.log('checkout stripe mode: ok');
