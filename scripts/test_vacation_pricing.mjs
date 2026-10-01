import assert from 'node:assert/strict';
import {
  CheckoutConfigError,
  checkoutAmounts,
  checkoutOrderSummary,
  checkoutPlanFromMetadata,
} from '../src/vacation/checkout-pricing.mjs';
import { collaboratorPlan, createCollaboratorInvite } from '../src/vacation/collaborators.mjs';
import { mediaPriceCents, ownerMediaAddOns, ownerMediaCoversTrip, recordOwnerMediaPurchase } from '../src/vacation/media-checkout.mjs';

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

console.log('vacation pricing ok');
