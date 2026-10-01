import assert from 'node:assert/strict';
import { couponHash } from '../src/vacation/coupons.mjs';
import { consumeCoupon } from '../src/vacation/coupons.mjs';
import { assertMintTier, mintCheckoutCoupons, parseMintArgs, runMint } from './mint-checkout-coupons.mjs';
import { resolveRedeemPlan, storedCouponPlan } from '../routes/checkout-coupon.mjs';

const env = { TIMESYNCHER_COUPON_HASH_SALT: 'mint-test-salt' };

function insertDb() {
  const inserts = [];
  const statements = [];
  const db = async (strings, ...values) => {
    const text = strings.join(' ');
    assert.match(text, /insert into checkout_coupons/);
    inserts.push(values);
    statements.push(text);
    return [{
      id: `coupon-${inserts.length}`,
      code_hint: values[1],
      label: values[2],
      max_redemptions: values[3],
      redemption_count: 0,
      status: 'active',
      expires_at: values[4],
      metadata: values[5],
    }];
  };
  return { db, inserts, statements };
}

function consumeDb(metadata, { redemptionCount = 0, maxRedemptions = 1, status = 'active' } = {}) {
  const state = { redemption_count: redemptionCount, max_redemptions: maxRedemptions, status, metadata };
  const db = async (strings) => {
    const text = strings.join(' ');
    if (text.includes('update checkout_coupons')) {
      assert.match(text, /redemption_count = redemption_count \+ 1/);
      if (state.status !== 'active' || state.redemption_count >= state.max_redemptions) return [];
      state.redemption_count += 1;
      return [{
        id: 'coupon-1',
        code_hint: 'TS-...001',
        label: 'batch',
        max_redemptions: state.max_redemptions,
        redemption_count: state.redemption_count,
        status: state.status,
        expires_at: null,
        metadata: state.metadata,
      }];
    }
    if (text.includes('insert into checkout_coupon_redemptions')) {
      return [{ id: 'redemption-1', status: 'processing' }];
    }
    return [];
  };
  return { db, state };
}

const minted = insertDb();
const codes = await mintCheckoutCoupons(minted.db, {
  count: 3,
  tier: 'single',
  label: 'batch',
  max: 1,
  expires: 'later',
}, env);
assert.equal(codes.length, 3);
assert.equal(new Set(codes).size, 3);
assert.equal(minted.inserts.length, 3);
for (let index = 0; index < codes.length; index += 1) {
  const code = codes[index];
  const [hash, hint, label, max, expires, metadata] = minted.inserts[index];
  assert.equal(minted.inserts[index].length, 6);
  assert.match(minted.statements[index], /'active'/);
  assert.equal(hash, couponHash(code, env));
  assert.equal(hint.includes('...'), true);
  assert.notEqual(hint, code);
  assert.equal(minted.inserts[index].includes(code), false);
  assert.equal(label, 'batch');
  assert.equal(max, 1);
  assert.equal(expires, 'later');
  assert.deepEqual(metadata, { plan: 'single' });
}

const printed = [];
const printedRun = insertDb();
const printedCodes = await runMint(['--count', '2', '--tier', 'unlimited', '--label', 'batch', '--max', '4'], {
  db: printedRun.db,
  env,
  print: (code) => printed.push(code),
});
assert.deepEqual(printed, printedCodes);
assert.equal(printed.length, 2);
assert.deepEqual(printedRun.inserts.map((values) => values[5]), [{ plan: 'unlimited' }, { plan: 'unlimited' }]);
assert.deepEqual(printedRun.inserts.map((values) => values[3]), [4, 4]);

const plain = insertDb();
await mintCheckoutCoupons(plain.db, { count: 1, tier: null, label: '', max: 1, expires: null }, env);
assert.deepEqual(plain.inserts[0][5], {});

assert.throws(() => parseMintArgs(['--tier', 'family']), /--tier must be single or unlimited/);
assert.throws(() => parseMintArgs(['--tier', 'Single']), /--tier must be single or unlimited/);
assert.throws(() => assertMintTier('gold'), /--tier must be single or unlimited/);
const rejected = insertDb();
await assert.rejects(() => mintCheckoutCoupons(rejected.db, { count: 2, tier: 'gold', max: 1 }, env), /--tier must be single or unlimited/);
assert.equal(rejected.inserts.length, 0);
assert.throws(() => parseMintArgs(['--count', '0']), /--count must be a positive integer/);

assert.equal(resolveRedeemPlan({ plan: 'single' }, true), 'single');
assert.equal(resolveRedeemPlan({ plan: 'unlimited' }, false), 'unlimited');
assert.equal(resolveRedeemPlan({}, false), 'single');
assert.equal(resolveRedeemPlan({}, true), 'unlimited');
assert.equal(resolveRedeemPlan({ label: 'batch' }, true), 'unlimited');
assert.equal(storedCouponPlan(null), null);
assert.throws(() => resolveRedeemPlan({ plan: 'family' }, false), /Coupon plan "family" is not supported/);
assert.throws(() => storedCouponPlan({ plan: 2 }), /Coupon plan is not supported/);

const consumed = consumeDb({ plan: 'unlimited' });
const result = await consumeCoupon(consumed.db, 'TS-EXAMPLE-001', {
  email: 'nolan.harper@example.com',
  plan: 'unlimited',
  originalAmountCents: 0,
}, env);
assert.equal(consumed.state.redemption_count, 1);
assert.equal(result.coupon.redemptionCount, 1);
assert.deepEqual(result.coupon.metadata, { plan: 'unlimited' });
assert.equal(result.redemption.status, 'processing');

const second = consumeDb({ plan: 'single' }, { redemptionCount: 1, maxRedemptions: 1 });
await assert.rejects(() => consumeCoupon(second.db, 'TS-EXAMPLE-001', { plan: 'single', originalAmountCents: 0 }, env), /already used/);
assert.equal(second.state.redemption_count, 1);

console.log('mint checkout coupon tests passed');
