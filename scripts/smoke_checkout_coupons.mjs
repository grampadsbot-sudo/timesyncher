import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  checkoutOrderSummary,
} from '../src/vacation/checkout-pricing.mjs';
import {
  couponCodeHash,
  couponCodeHint,
  normalizeCouponCode,
  validateCouponCode,
} from '../src/vacation/checkout-coupons.mjs';

const env = {
  TIMESYNCHER_BASE_PRICE_CENTS: '3700',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
  TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS: '500',
  TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS: '500',
  TIMESYNCHER_CHECKOUT_CURRENCY: 'usd',
  TIMESYNCHER_COUPON_HASH_SALT: 'test-salt',
};

assert.equal(normalizeCouponCode('  tsv-free-1  '), 'TSV-FREE-1');
assert.equal(validateCouponCode('tsv-free-1'), 'TSV-FREE-1');
assert.equal(couponCodeHint('TSV-ABCDEFGH'), 'TSV-...EFGH');
assert.equal(couponCodeHash('TSV-FREE-1', env), couponCodeHash('tsv-free-1', env));
assert.throws(() => validateCouponCode('x'), /valid coupon/);

assert.deepEqual(checkoutOrderSummary({}, env), {
  amountCents: 3700,
  currency: 'usd',
  plan: 'single',
  orderBump: false,
  photoMemories: false,
  photoMemoriesPlan: null,
});
assert.equal(checkoutOrderSummary({ orderBump: true, photoMemories: true }, env).amountCents, 6900);

for (const file of ['index.html', 'order-test.html']) {
  const html = readFileSync(file, 'utf8');
  assert.match(html, /id="couponCode"/, `${file} has coupon input`);
  assert.match(html, /\/api\/create-payment-intent/, `${file} posts to checkout endpoint`);
  assert.match(html, /Coupon checkout skips Stripe/, `${file} explains Stripe is skipped`);
  assert.match(html, /No Stripe charge/, `${file} shows no Stripe charge`);
}

const checkoutApi = readFileSync('api/create-payment-intent.mjs', 'utf8');
assert.ok(
  checkoutApi.indexOf('if (body.couponCode || body.code)') < checkoutApi.indexOf('stripeConfig = stripeSecretKey'),
  'coupon branch runs before Stripe config is loaded',
);

console.log(JSON.stringify({ ok: true, checked: ['coupon helpers', 'pricing', 'checkout UI', 'coupon branch before Stripe'] }, null, 2));
