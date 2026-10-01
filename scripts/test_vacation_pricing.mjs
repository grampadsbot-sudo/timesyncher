import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CheckoutConfigError,
  checkoutAmounts,
  checkoutChargeDisplay,
  checkoutOrderSummary,
  checkoutPlanFromMetadata,
} from '../src/vacation/checkout-pricing.mjs';
import { priceAccessPlanRow } from '../src/vacation/access-plan.mjs';
import { collaboratorPlan, createCollaboratorInvite } from '../src/vacation/collaborators.mjs';
import { consumeCoupon } from '../src/vacation/coupons.mjs';
import { mediaPriceCents, ownerMediaAddOns, ownerMediaCoversTrip, recordOwnerMediaPurchase } from '../src/vacation/media-checkout.mjs';
import { buildOnboardingFromCoupon } from '../src/vacation/onboarding.mjs';
import { orderDetails } from '../routes/checkout-coupon.mjs';

const env = {
  TIMESYNCHER_BASE_PRICE_CENTS: '3700',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
  TIMESYNCHER_MEDIA_PRICE_CENTS: '1700',
};

assert.equal(checkoutAmounts(env).base, 3700);
assert.equal(checkoutAmounts(env).orderBump, 2700);
assert.equal(checkoutAmounts(env).media, 1700);
assert.equal(mediaPriceCents(env), 1700);
assert.equal(collaboratorPlan('telegram_collaborators_single_trip', env).amountCents, 2100);
assert.equal(checkoutOrderSummary({ orderBump: true }, env).amountCents, 6400);
assert.equal(checkoutOrderSummary({ orderBump: true }, env).plan, 'unlimited');
assert.equal(checkoutOrderSummary({ orderBump: true, media: true }, env).amountCents, 8100);
assert.equal(checkoutOrderSummary({ orderBump: true, media: true }, env).mediaPlan, 'owner_media');

assert.deepEqual(checkoutChargeDisplay({ amountCents: 3700, coupon: true }), { totalCents: 0, waivedCents: 3700 });
assert.deepEqual(checkoutChargeDisplay({ amountCents: 6400, coupon: false }), { totalCents: 6400, waivedCents: 0 });
assert.throws(() => checkoutChargeDisplay({}), (error) => {
  assert.equal(error instanceof CheckoutConfigError, true);
  assert.match(error.message, /checkout config missing: TIMESYNCHER_BASE_PRICE_CENTS/);
  return true;
});
assert.throws(() => checkoutAmounts({}), (error) => {
  assert.equal(error instanceof CheckoutConfigError, true);
  assert.match(error.message, /checkout config missing: TIMESYNCHER_BASE_PRICE_CENTS/);
  return true;
});
assert.throws(() => mediaPriceCents({}), (error) => {
  assert.match(error.message, /checkout config missing: TIMESYNCHER_MEDIA_PRICE_CENTS/);
  return true;
});
assert.throws(() => collaboratorPlan('single_trip', {}), (error) => {
  assert.match(error.message, /checkout config missing: TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS/);
  return true;
});
assert.throws(() => priceAccessPlanRow({ role: 'collaborator', plan: 'single_trip' }, {}), (error) => {
  assert.match(error.message, /checkout config missing: TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS/);
  return true;
});
assert.throws(() => priceAccessPlanRow({ role: 'owner_media' }, {}), (error) => {
  assert.match(error.message, /checkout config missing: TIMESYNCHER_MEDIA_PRICE_CENTS/);
  return true;
});
await assert.rejects(
  () => recordOwnerMediaPurchase({ db: null, contact: {}, addOns: {} }),
  /checkout config missing: TIMESYNCHER_MEDIA_PRICE_CENTS/,
);
await assert.rejects(
  () => consumeCoupon(null, 'CODE', { plan: 'single' }, {}),
  /checkout config missing: TIMESYNCHER_BASE_PRICE_CENTS/,
);
await assert.rejects(
  () => consumeCoupon(null, 'CODE', { plan: 'owner_media' }, {}),
  /checkout config missing: TIMESYNCHER_MEDIA_PRICE_CENTS/,
);
await assert.rejects(
  () => consumeCoupon(null, 'CODE', { plan: 'unlimited' }, {}),
  /checkout config missing: TIMESYNCHER_ORDER_BUMP_PRICE_CENTS/,
);
await assert.rejects(
  () => consumeCoupon(null, 'CODE', { plan: 'telegram_collaborators_single_trip' }, {}),
  /checkout config missing: TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS/,
);
await assert.rejects(
  () => buildOnboardingFromCoupon({ db: null, contact: { email: 'ada@example.com' }, plan: 'single' }),
  /checkout config missing: TIMESYNCHER_BASE_PRICE_CENTS/,
);
await assert.rejects(
  () => buildOnboardingFromCoupon({ db: null, contact: { email: 'ada@example.com' }, plan: 'unlimited' }),
  /checkout config missing: TIMESYNCHER_ORDER_BUMP_PRICE_CENTS/,
);
const savedPriceEnv = {};
for (const key of ['TIMESYNCHER_BASE_PRICE_CENTS', 'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS', 'TIMESYNCHER_MEDIA_PRICE_CENTS', 'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS']) {
  savedPriceEnv[key] = process.env[key];
  delete process.env[key];
}
assert.throws(() => orderDetails({}), (error) => {
  assert.match(error.message, /checkout config missing: TIMESYNCHER_BASE_PRICE_CENTS/);
  return true;
});
for (const [key, value] of Object.entries(savedPriceEnv)) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

assert.equal(checkoutPlanFromMetadata({ plan: 'owner_media' }), 'owner_media');
assert.equal(checkoutPlanFromMetadata({ plan: 'telegram_collaborators_single_trip' }), 'telegram_collaborators_single_trip');
assert.equal(checkoutPlanFromMetadata({ plan: 'unlimited' }), 'unlimited');
assert.equal(checkoutPlanFromMetadata({ plan: 'single' }), 'single');
assert.equal(checkoutPlanFromMetadata({ plan: 'owner_media_single_vacation' }), 'owner_media');

function mockDb() {
  const calls = [];
  const db = async (strings, ...values) => {
    const sql = strings.join(' ');
    calls.push({ sql, values });
    if (/insert into customers/i.test(sql)) return [{ id: 'payer-1' }];
    if (/insert into entitlements/i.test(sql)) return [{ id: 'ent-1' }];
    if (/select id from paid_orders/i.test(sql)) return [];
    if (/insert into paid_orders/i.test(sql)) return [{ id: 'order-1' }];
    if (/insert into vacation_collaborator_invites/i.test(sql)) {
      return [{
        id: 'invite-1',
        owner_customer_id: values[0],
        trip_id: values[1],
        plan_code: values[2],
        scope: values[3],
      }];
    }
    return [];
  };
  db.calls = calls;
  return db;
}

const db = mockDb();
const purchase = await recordOwnerMediaPurchase({
  db,
  contact: { email: 'payer@example.com', firstName: 'Pat', lastName: 'Lee' },
  addOns: ownerMediaAddOns({}, env),
  ownerCustomerId: 'owner-1',
  amountCents: 1700,
  currency: 'usd',
});
assert.equal(purchase.customerId, 'owner-1');
assert.equal(purchase.payerCustomerId, 'payer-1');
assert.equal(purchase.plan, 'owner_media');
const entitlementInsert = db.calls.find((call) => /insert into entitlements/i.test(call.sql));
assert.equal(entitlementInsert.values[0], 'owner-1');
const entitlement = { status: 'active', plan: 'owner_media', customer_id: purchase.customerId, trip_id: null };
assert.equal(ownerMediaCoversTrip(entitlement, { customer_id: 'owner-1', id: 'trip-a' }), true);
assert.equal(ownerMediaCoversTrip(entitlement, { customer_id: 'owner-1', id: 'trip-b' }), true);
assert.equal(ownerMediaCoversTrip(entitlement, { customer_id: 'someone-else', id: 'trip-c' }), false);

await assert.rejects(
  () => createCollaboratorInvite(db, { ownerCustomerId: 'owner-1', planCode: 'single_trip', env }),
  /tripId is required/,
);
const first = await createCollaboratorInvite(db, {
  ownerCustomerId: 'owner-1',
  tripId: 'trip-a',
  planCode: 'telegram_collaborators_single_trip',
  env,
});
const second = await createCollaboratorInvite(db, {
  ownerCustomerId: 'owner-1',
  tripId: 'trip-b',
  planCode: 'single_trip',
  env,
});
assert.equal(first.invite.trip_id, 'trip-a');
assert.equal(second.invite.trip_id, 'trip-b');
assert.equal(first.invite.plan_code, 'telegram_collaborators_single_trip');
assert.equal(second.invite.plan_code, 'telegram_collaborators_single_trip');

const servedPages = [
  'index.html',
  'order-test.html',
  'addons-checkout.html',
  'owner-media-checkout.html',
  'access-checkout.html',
  'terms.html',
  'vacation-app.html',
  'shared-app.html',
  'login.html',
  'onboarding-eula.html',
  'privacy.html',
  'itinerary.html',
  'support.html',
  'admin-onboardings.html',
  'openclaw-admin.html',
  'order-success.html',
];
const priceLiteral = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s*\/\s*year)?/;
const stripRegexGroups = (text) => text.replace(/\$[12](?![\d,])/g, '');
for (const file of servedPages) {
  const text = stripRegexGroups(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
  assert.doesNotMatch(text, priceLiteral, `${file} contains a literal price`);
  assert.doesNotMatch(text, /unlimited vacations?/i, `${file} says unlimited vacation`);
}
const priceModules = [
  'routes/checkout-coupon.mjs',
  'src/vacation/checkout-pricing.mjs',
  'src/vacation/access-plan.mjs',
  'src/vacation/media-checkout.mjs',
  'src/vacation/coupons.mjs',
  'src/vacation/onboarding.mjs',
  'src/vacation/collaborators.mjs',
  'src/vacation/seat-price.mjs',
  'routes/create-payment-intent.mjs',
  'routes/checkout-config.mjs',
];
const priceFallback = /\|\|\s*(?:3700|2700|2100|1700|1500|1900|900|500)\b|DEFAULT_[A-Z0-9_]*PRICE[A-Z0-9_]*\s*=\s*\d+|(?:amountCents|originalAmountCents)\s*=\s*[^;\n]*\|\|\s*\d+|\$\s?\d{2,}(?:[.,]\d+)?|\+\s?\$\s?\d/;
for (const file of priceModules) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(text, priceFallback, `${file} contains a price fallback`);
  assert.doesNotMatch(text, /unlimited vacations?/i, `${file} says unlimited vacation`);
}
const indexPage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(indexPage, /id="waivedAmount"/);
assert.match(indexPage, /totalCents: 0, waivedCents: cents/);
assert.match(indexPage, /checkout config missing: ' \+ key/);
assert.match(indexPage, /TIMESYNCHER_BASE_PRICE_CENTS/);
assert.doesNotMatch(indexPage, /\|\|\s*3700|\$37|\+\$27|\+\$5/);

console.log('vacation pricing ok');
