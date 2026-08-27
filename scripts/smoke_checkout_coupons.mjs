import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  checkoutOrderSummary,
} from '../src/vacation/checkout-pricing.mjs';
import {
  couponAuditHint,
  couponCodeHash,
  couponCodeHint,
  normalizeCouponCode,
  validateCouponCode,
} from '../src/vacation/checkout-coupons.mjs';

const env = {
  TIMESYNCHER_BASE_PRICE_CENTS: '3700',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
  TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS: '500',
  TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS: '900',
  TIMESYNCHER_CHECKOUT_CURRENCY: 'usd',
  TIMESYNCHER_COUPON_HASH_SALT: 'test-salt',
};

assert.equal(normalizeCouponCode('  tsv-free-1  '), 'TSV-FREE-1');
assert.equal(validateCouponCode('tsv-free-1'), 'TSV-FREE-1');
assert.equal(couponCodeHint('TSV-ABCDEFGH'), 'TSV-...EFGH');
assert.equal(couponAuditHint({ codeHint: 'TS-...JRX' }, 'TS-WBO06AM1OJRX'), 'TS-...JRX');
assert.equal(couponAuditHint({}, 'TS-WBO06AM1OJRX'), 'TS-W...OJRX');
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
assert.equal(checkoutOrderSummary({ orderBump: true, photoMemories: true }, env).amountCents, 7300);

for (const file of ['index.html', 'order-test.html']) {
  const html = readFileSync(file, 'utf8');
  assert.match(html, /id="couponCode"/, `${file} has coupon input`);
  assert.match(html, /<label(?:[^>]*)>(?:Enter coupon|Coupon)\s*<input[^>]+placeholder="(?:Enter coupon code|Coupon code)"/, `${file} uses customer-facing coupon copy`);
  assert.match(html, /\/api\/checkout-coupon/, `${file} posts coupon redemption to the non-Stripe coupon endpoint`);
  assert.doesNotMatch(html, /hasCoupon\(\)[\s\S]{0,900}\/api\/create-payment-intent/, `${file} does not send coupon redemption through Stripe payment intent`);
  assert.match(html, /(?:No Stripe charge|Waived by coupon)/, `${file} shows no Stripe charge`);
  assert.match(html, /activePhotoAmountCents/, `${file} uses the shared photo fallback helper`);
  assert.match(html, /bump\.checked \? 900 : 500/, `${file} falls back to $9 for unlimited Photo Memories`);
  assert.doesNotMatch(html, /photos\.amount \|\| 500|photoProduct\.amount \|\| 500/, `${file} has no stale $5 unlimited Photo Memories fallback`);
}

const checkoutApi = readFileSync('api/checkout-coupon.mjs', 'utf8');
assert.ok(
  checkoutApi.includes('consumeCoupon') && !checkoutApi.includes('new Stripe'),
  'coupon endpoint redeems without loading Stripe',
);

console.log(JSON.stringify({ ok: true, checked: ['coupon helpers', 'pricing', 'checkout UI', 'coupon endpoint without Stripe'] }, null, 2));
