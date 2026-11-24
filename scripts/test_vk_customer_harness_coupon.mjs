#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COUPON_ROUTE, assertCouponCode, assertCouponOnlyRequest, couponCheck, couponRequestBody,
  createCouponLedger, dryRosterCoupon, isNonCouponPayment, publicCouponResult, redeemRosterCoupon,
} from './harness/coupon.mjs';
import { loadRoster, rosterToStory } from './harness/roster.mjs';
import { SEED_COUNT, SEED_LABEL, assertStagingSeed, rosterCodes, seedVkTestCoupons } from './seed-vk-test-coupons.mjs';
import { couponHash } from '../src/vacation/coupons.mjs';

const fixture = fileURLToPath(new URL('./fixtures/harness/vk-roster.json', import.meta.url));
const customers = loadRoster(fixture);
const origin = 'https://vacation-staging.timesyncher.com';

assert.equal(assertCouponCode('vk-test-001'), 'VK-TEST-001');
assert.equal(assertCouponCode('VK-TEST-100'), 'VK-TEST-100');
assert.throws(() => assertCouponCode('VK-TEST-101'), /refused/);
assert.throws(() => assertCouponCode('PROMO50'), /refused/);

assert.equal(isNonCouponPayment('https://vacation-staging.timesyncher.com/api/create-payment-intent'), true);
assert.equal(isNonCouponPayment('https://api.stripe.com/v1/payment_intents'), true);
assert.equal(isNonCouponPayment('https://vacation-staging.timesyncher.com/api/checkout-coupon'), false);

assert.doesNotThrow(() => assertCouponOnlyRequest(`${origin}${COUPON_ROUTE}`, { couponCode: 'VK-TEST-001' }));
assert.doesNotThrow(() => assertCouponOnlyRequest(`${origin}${COUPON_ROUTE}`, { action: 'validate_coupon', couponCode: 'VK-EXPIRED-004' }));
assert.throws(() => assertCouponOnlyRequest(`${origin}/api/create-payment-intent`, { couponCode: 'VK-TEST-001' }), /non-coupon/);
assert.throws(() => assertCouponOnlyRequest(`${origin}${COUPON_ROUTE}`, { couponCode: 'VK-TEST-001', cardNumber: '4242' }), /payment field/);
assert.throws(() => assertCouponOnlyRequest(`${origin}${COUPON_ROUTE}`, { couponCode: 'VK-EXPIRED-004' }), /VK-TEST/);

const story1 = rosterToStory(customers[0]);
const body1 = couponRequestBody(story1, 'run-1');
assert.equal(body1.couponCode, 'VK-TEST-001');
assert.match(body1.email, /@harness\.invalid$/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-coupon-'));
const ledgerFile = path.join(tmp, 'ledger.json');
const ledger = createCouponLedger(ledgerFile);
const okFetch = async (url, init) => {
  assert.equal(new URL(String(url)).pathname, COUPON_ROUTE);
  const body = JSON.parse(init.body);
  assert.equal(body.couponCode, 'VK-TEST-001');
  return {
    status: 200,
    json: async () => ({ ok: true, status: 'coupon_redeemed', order: { amountCents: 0 }, session: { token: 'tok_secret_value_123456' } }),
  };
};
const redeemed = await redeemRosterCoupon({ story: story1, runId: 'run-1', origin, fetchImpl: okFetch, ledger });
assert.equal(redeemed.status, 'redeemed');
assert.equal(redeemed.pass, true);
assert.equal(redeemed.amount_cents, 0);
assert.ok(redeemed.session_ref.length > 0);
assert.equal(Object.hasOwn(publicCouponResult(redeemed), 'session_token'), false);
assert.equal(couponCheck(redeemed).pass, true);
assert.equal(ledger.redeemed('VK-TEST-001'), true);
await assert.rejects(() => redeemRosterCoupon({ story: story1, runId: 'run-1', origin, fetchImpl: okFetch, ledger }), /already redeemed/);

const reloaded = createCouponLedger(ledgerFile);
assert.equal(reloaded.redeemed('VK-TEST-001'), true);

const charged = await redeemRosterCoupon({
  story: story1,
  runId: 'run-2',
  origin,
  ledger: createCouponLedger(),
  fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true, status: 'coupon_redeemed', order: { amountCents: 1000 }, session: { token: 'tok_x' } }) }),
});
assert.equal(charged.status, 'charged');
assert.equal(charged.pass, false);
assert.equal(couponCheck(charged).pass, false);

const story4 = rosterToStory(customers[3]);
let calls4 = 0;
const misuseOk = await redeemRosterCoupon({
  story: story4,
  runId: 'run-3',
  origin,
  ledger: createCouponLedger(),
  fetchImpl: async (_url, init) => {
    calls4 += 1;
    const body = JSON.parse(init.body);
    if (body.action === 'validate_coupon') return { status: 400, json: async () => ({ ok: false, error: 'Coupon expired.' }) };
    if (calls4 === 3) return { status: 200, json: async () => ({ ok: true, status: 'coupon_redeemed', order: { amountCents: 0 }, session: { token: 'tok_misuse_4' } }) };
    return { status: 400, json: async () => ({ ok: false, error: 'Coupon already used.' }) };
  },
});
assert.equal(calls4, 4);
assert.equal(misuseOk.pre_attempts.length, 2);
assert.equal(misuseOk.status, 'reuse_rejected');
assert.equal(misuseOk.pass, true);
assert.equal(misuseOk.reuse.rejected, true);

const story82 = rosterToStory(customers[81]);
const reuseBug = await redeemRosterCoupon({
  story: story82,
  runId: 'run-4',
  origin,
  ledger: createCouponLedger(),
  fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true, status: 'coupon_redeemed', order: { amountCents: 0 }, session: { token: 'tok_bug' } }) }),
});
assert.equal(reuseBug.status, 'reuse_accepted');
assert.equal(reuseBug.pass, false);

const dryLedger = createCouponLedger();
const dryCard = dryRosterCoupon({ story: story1, runId: 'dry-1', origin, ledger: dryLedger });
assert.equal(dryCard.status, 'dry-not-sent');
assert.equal(dryCard.sent, false);
assert.equal(dryCard.pass, true);
assert.throws(() => dryRosterCoupon({ story: story1, runId: 'dry-1', origin, ledger: dryLedger }), /already redeemed/);

assert.equal(SEED_COUNT, 100);
assert.match(SEED_LABEL, /VK harness/);
const codes = rosterCodes();
assert.equal(codes.length, 100);
assert.equal(codes[0], 'VK-TEST-001');
assert.equal(codes[99], 'VK-TEST-100');

const validEnv = {
  HARNESS_LIVE: '1',
  HARNESS_COUPON_SEED_TARGET: 'staging',
  DATABASE_URL: 'postgres://user:pass@ep-staging.neon.tech/staging',
  TIMESYNCHER_COUPON_HASH_SALT: 'staging-salt-value',
};
assert.doesNotThrow(() => assertStagingSeed(validEnv, ['--staging']));
assert.throws(() => assertStagingSeed(validEnv, []), /--staging/);
assert.throws(() => assertStagingSeed({ ...validEnv, HARNESS_LIVE: '0' }, ['--staging']), /HARNESS_LIVE/);
assert.throws(() => assertStagingSeed({ ...validEnv, HARNESS_COUPON_SEED_TARGET: 'prod' }, ['--staging']), /HARNESS_COUPON_SEED_TARGET/);
assert.throws(() => assertStagingSeed({ ...validEnv, VERCEL_ENV: 'production' }, ['--staging']), /production/);
assert.throws(() => assertStagingSeed({ ...validEnv, NODE_ENV: 'production' }, ['--staging']), /production/);
assert.throws(() => assertStagingSeed({ ...validEnv, DATABASE_URL: '' }, ['--staging']), /DATABASE_URL/);
assert.throws(() => assertStagingSeed({ ...validEnv, DATABASE_URL: 'postgres://x@host/d0463815' }, ['--staging']), /protected/);
assert.throws(() => assertStagingSeed({ ...validEnv, DATABASE_URL: 'postgres://x@host/craig' }, ['--staging']), /protected/);
assert.throws(() => assertStagingSeed({ ...validEnv, TIMESYNCHER_COUPON_HASH_SALT: '' }, ['--staging']), /TIMESYNCHER_COUPON_HASH_SALT/);

const store = new Map();
let nextId = 1;
const mockDb = async (strings, ...values) => {
  const query = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
  if (query.startsWith('select id, status, redemption_count')) {
    const row = store.get(values[0]);
    return row ? [row] : [];
  }
  if (query.startsWith('insert into checkout_coupons')) {
    const row = {
      id: nextId++,
      code_hash: values[0],
      code_hint: values[1],
      label: values[2],
      max_redemptions: values[3],
      redemption_count: 0,
      status: 'active',
      expires_at: values[4],
      metadata: values[5],
    };
    store.set(row.code_hash, row);
    return [row];
  }
  if (query.startsWith('update checkout_coupons set redemption_count = 0')) {
    for (const row of store.values()) {
      if (row.id === values[0] && row.metadata?.harness === 'vk-roster') {
        row.redemption_count = 0;
        row.status = 'active';
      }
    }
    return [];
  }
  throw new Error(`unexpected query: ${query}`);
};

const envSalt = { TIMESYNCHER_COUPON_HASH_SALT: 'test-salt' };
store.set(couponHash('VK-TEST-002', envSalt), { id: 99, status: 'active', redemption_count: 0, max_redemptions: 1, metadata: { owner: 'manual' } });
const seeded1 = await seedVkTestCoupons(mockDb, { count: 3, env: envSalt });
assert.deepEqual(seeded1.created, ['VK-TEST-001', 'VK-TEST-003']);
assert.deepEqual(seeded1.refused, ['VK-TEST-002']);
assert.deepEqual(seeded1.existing, []);

store.get(couponHash('VK-TEST-001', envSalt)).redemption_count = 1;
const seeded2 = await seedVkTestCoupons(mockDb, { count: 3, env: envSalt, rearm: false });
assert.deepEqual(seeded2.created, []);
assert.deepEqual(seeded2.existing, ['VK-TEST-001', 'VK-TEST-003']);
assert.deepEqual(seeded2.rearmed, []);

const seeded3 = await seedVkTestCoupons(mockDb, { count: 3, env: envSalt, rearm: true });
assert.deepEqual(seeded3.rearmed, ['VK-TEST-001']);
assert.deepEqual(seeded3.existing, ['VK-TEST-003']);
assert.equal(store.get(couponHash('VK-TEST-001', envSalt)).redemption_count, 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test_vk_customer_harness_coupon: ok');
