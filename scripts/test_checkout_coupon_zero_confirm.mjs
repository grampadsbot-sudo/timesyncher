import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import handler from '../routes/checkout-coupon.mjs';
import { checkoutChargeDisplay } from '../src/vacation/checkout-pricing.mjs';
import { lookupCoupon } from '../src/vacation/coupons.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';

const orderTest = await readFile(new URL('../order-test.html', import.meta.url), 'utf8');
assert.match(orderTest, /action:\s*'validate_coupon'/);
assert.match(orderTest, /completeZeroPurchaseBtn/);
assert.match(orderTest, /couponQuote\.amountCents/);
assert.doesNotMatch(orderTest, /Complete \$0 purchase/);
assert.match(orderTest, /couponQuote/);
assert.doesNotMatch(orderTest, /hasCoupon\(\)[\s\S]{0,1200}window\.location\.href/);

const coupon = {
  id: 'coupon-1',
  code_hint: 'TS-...001',
  label: 'test',
  max_redemptions: 1,
  redemption_count: 0,
  status: 'active',
  expires_at: null,
  metadata: { plan: 'single' },
};

const db = async (strings) => {
  const text = strings.join(' ');
  if (/from checkout_coupons/i.test(text) && /code_hash/i.test(text)) return [coupon];
  if (/select metadata from checkout_coupons/i.test(text)) return [{ metadata: coupon.metadata }];
  throw new Error(`unexpected sql ${text}`);
};

useVacationDatabase(db);
const lookedUp = await lookupCoupon(db, 'TS-TEST-001');
assert.equal(lookedUp.codeHint, 'TS-...001');

process.env.TIMESYNCHER_BASE_PRICE_CENTS = '3700';
process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS = '2700';
process.env.TIMESYNCHER_MEDIA_PRICE_CENTS = '1700';
process.env.TIMESYNCHER_CHECKOUT_CURRENCY = 'usd';

const res = {
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
  getHeader(name) { return this.headers[String(name).toLowerCase()]; },
  end(body) { this.body = body; },
};
const validateBody = JSON.stringify({
  action: 'validate_coupon',
  firstName: 'Buyer',
  lastName: 'Example',
  email: 'buyer@example.com',
  couponCode: 'TS-TEST-001',
  orderBump: false,
  photoMemories: false,
});
await handler({
  method: 'POST',
  url: '/api/checkout-coupon',
  headers: { 'content-type': 'application/json' },
  [Symbol.asyncIterator]() {
    let done = false;
    return {
      next() {
        if (done) return Promise.resolve({ done: true });
        done = true;
        return Promise.resolve({ done: false, value: Buffer.from(validateBody) });
      },
    };
  },
}, res);
const payload = JSON.parse(res.body);
assert.equal(res.statusCode, 200);
assert.equal(payload.ok, true);
assert.equal(payload.status, 'coupon_valid');
assert.equal(payload.order.amountCents, 0);
assert.equal(payload.order.originalAmountCents, 3700);
assert.equal(payload.order.amountWaivedCents, 3700);
assert.deepEqual(checkoutChargeDisplay({ amountCents: 3700, coupon: true }), {
  totalCents: 0,
  waivedCents: 3700,
});

assert.match(orderTest, /completeZeroPurchaseBtn[\s\S]{0,2500}couponQuote\.amountCents/);
assert.doesNotMatch(orderTest, /completeZeroPurchaseBtn[\s\S]{0,800}window\.location\.href[\s\S]{0,400}applyCouponBtn/);

useVacationDatabase(null);
console.log('checkout coupon zero confirm passed');
