import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  checkoutOrderSummary,
} from '../src/vacation/checkout-pricing.mjs';

const env = {
  TIMESYNCHER_BASE_PRICE_CENTS: '3700',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
  TIMESYNCHER_MEDIA_PRICE_CENTS: '1700',
  TIMESYNCHER_CHECKOUT_CURRENCY: 'usd',
};

assert.deepEqual(checkoutOrderSummary({}, env), {
  amountCents: 3700,
  currency: 'usd',
  plan: 'single',
  orderBump: false,
  photoMemories: false,
  photoMemoriesPlan: null,
  media: false,
  mediaPlan: null,
});
assert.equal(checkoutOrderSummary({ orderBump: true }, env).amountCents, 6400);
assert.equal(checkoutOrderSummary({ orderBump: true, photoMemories: true }, env).amountCents, 8100);

for (const file of ['index.html', 'order-test.html']) {
  const html = readFileSync(file, 'utf8');
  assert.match(html, /id="couponCode"/, `${file} has coupon input`);
  assert.match(html, /<label(?:[^>]*)>(?:Enter coupon|Coupon)\s*<input[^>]+placeholder="(?:Enter coupon code|Coupon code)"/, `${file} uses customer-facing coupon copy`);
  assert.match(html, /\/api\/(?:create-payment-intent|checkout-coupon)/, `${file} posts to a checkout coupon endpoint`);
  assert.match(html, /(?:No Stripe charge|Waived by coupon)/, `${file} shows no Stripe charge`);
}

const checkoutApi = readFileSync('routes/checkout-coupon.mjs', 'utf8');
assert.ok(
  checkoutApi.includes('consumeCoupon') && !checkoutApi.includes('new Stripe'),
  'coupon endpoint redeems without loading Stripe',
);

console.log(JSON.stringify({ ok: true, checked: ['pricing', 'checkout UI', 'coupon endpoint without Stripe'] }, null, 2));
