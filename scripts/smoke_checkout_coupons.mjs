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
import { accountUpgradeAddOns } from '../src/vacation/media-checkout.mjs';

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


const upgrade = accountUpgradeAddOns({ accountUpgrade: { photoUpload: true, videoUpload: true } });
assert.equal(upgrade.plan, 'unlimited');
assert.equal(upgrade.scope, 'unlimited_trips');
assert.equal(upgrade.amountCents, 6300);
assert.equal(upgrade.videoAmountCents, 2700);

const ownerMediaCheckoutHtml = readFileSync('owner-media-checkout.html', 'utf8');
assert.match(ownerMediaCheckoutHtml, /accountUpgradeMode/, 'owner media checkout supports account upgrade mode');
assert.match(ownerMediaCheckoutHtml, /create_owner_account_upgrade_payment_intent/, 'account upgrade mode has payment-intent action');
assert.match(ownerMediaCheckoutHtml, /redeem_owner_account_upgrade_coupon/, 'account upgrade mode has coupon redemption action');
assert.match(ownerMediaCheckoutHtml, /complete_staging_owner_account_upgrade_checkout/, 'account upgrade mode has staging card completion action');
assert.match(ownerMediaCheckoutHtml, /No new vacation setup or EULA is created\./, 'account upgrade mode says no EULA/new vacation setup');
assert.match(ownerMediaCheckoutHtml, /Video upload access/, 'account upgrade mode includes video upload access');

const orderSuccessHtml = readFileSync('order-success.html', 'utf8');
assert.match(orderSuccessHtml, /accountUpgradeCheckout/, 'order success handles account upgrade completion');
assert.match(orderSuccessHtml, /Unlimited vacation access has been added/, 'order success has account upgrade copy');

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


const checkoutConfigApi = readFileSync('api/checkout-config.mjs', 'utf8');
assert.match(checkoutConfigApi, /cardCheckoutEnabled/, 'checkout config returns product config even when card checkout is disabled');
assert.match(checkoutConfigApi, /PHOTO_MEMORIES_PRICE_CENTS \|\| '900'/, 'checkout config defaults unlimited Photo Memories to $9');
assert.doesNotMatch(checkoutConfigApi, /return send\(res, 503[\s\S]{0,160}Stripe/, 'checkout config does not block coupon pricing when live Stripe is disabled');

const checkoutApi = readFileSync('api/checkout-coupon.mjs', 'utf8');
assert.ok(
  checkoutApi.includes('consumeCoupon') && !checkoutApi.includes('new Stripe'),
  'coupon endpoint redeems without loading Stripe',
);

assert.match(checkoutApi, /redeem_owner_account_upgrade_coupon/, 'coupon endpoint redeems account upgrade coupons');
assert.match(checkoutApi, /recordAccountUpgradePurchase/, 'coupon endpoint records account upgrade purchases without onboarding');
assert.doesNotMatch(checkoutApi, /redeem_owner_account_upgrade_coupon[\s\S]{0,2500}buildOnboardingFromCoupon/, 'account upgrade coupon path does not create onboarding/EULA');

const paymentIntentApi = readFileSync('api/create-payment-intent.mjs', 'utf8');
assert.match(paymentIntentApi, /create_owner_account_upgrade_payment_intent/, 'payment API creates account upgrade intents');
assert.match(paymentIntentApi, /complete_staging_owner_account_upgrade_checkout/, 'payment API completes staging account upgrades');

const webhookApi = readFileSync('api/stripe-webhook.mjs', 'utf8');
assert.match(webhookApi, /timesyncher_vacation_account_upgrade/, 'Stripe webhook records account upgrade payments');

console.log(JSON.stringify({ ok: true, checked: ['coupon helpers', 'pricing', 'checkout UI', 'coupon endpoint without Stripe', 'account upgrade checkout'] }, null, 2));
