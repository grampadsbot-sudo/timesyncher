import assert from 'node:assert/strict';
import {
  attachPurchasedEntitlementToChatTrip,
  preflightAttachOwnerEntitlementForChatTrip,
} from '../src/vacation/chat-trip-entitlement-attach.mjs';

const CUSTOMER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ORDER_ID = '22222222-3333-4444-8555-666666666666';
const TRIP_A = '01234567-89ab-4cde-8f01-23456789abcd';
const TRIP_B = '01234567-89ab-4cde-8f02-23456789abcd';

function makeState({ plan = 'single', tripId = null } = {}) {
  return {
    trips: [],
    entitlement: {
      id: 'ent-main',
      customer_id: CUSTOMER_ID,
      trip_id: tripId,
      plan,
      status: 'active',
      metadata: plan === 'unlimited'
        ? { product: 'timesyncher_vacation_unlimited' }
        : { product: 'timesyncher_vacation_single' },
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_payment_intent_id: null,
    },
    siblings: [],
    session: {
      id: 'session-attach',
      customer_id: CUSTOMER_ID,
      order_id: ORDER_ID,
      trip_id: null,
    },
  };
}

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function dbFor(state) {
  return async (strings, ...values) => {
    const text = sqlText(strings);
    if (/from entitlements e/i.test(text) && /paid_orders/i.test(text)) {
      return [{ ...state.entitlement }];
    }
    if (/from entitlements e/i.test(text) && /trip_id is null/i.test(text)) {
      return state.entitlement.trip_id ? [] : [{ ...state.entitlement }];
    }
    if (/from entitlements e/i.test(text) && /e\.trip_id =/i.test(text) && /e\.customer_id =/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_A || v === TRIP_B);
      const rows = [];
      if (state.entitlement.trip_id === tripId) rows.push(state.entitlement);
      rows.push(...state.siblings.filter((row) => row.trip_id === tripId));
      return rows.map((row) => ({ id: row.id }));
    }
    if (/from entitlements e/i.test(text) && /e\.customer_id = t\.customer_id/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_A || v === TRIP_B);
      const row = state.entitlement.trip_id === tripId
        ? state.entitlement
        : state.siblings.find((sibling) => sibling.trip_id === tripId);
      return row ? [{ plan: row.plan, status: row.status, metadata: row.metadata }] : [];
    }
    if (/update entitlements/i.test(text) && /trip_id/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_A || v === TRIP_B);
      state.entitlement.trip_id = tripId;
      return [{ id: state.entitlement.id }];
    }
    if (/insert into entitlements/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_A || v === TRIP_B);
      const row = {
        id: `ent-sibling-${state.siblings.length + 1}`,
        customer_id: CUSTOMER_ID,
        trip_id: tripId,
        plan: state.entitlement.plan,
        status: 'active',
        metadata: state.entitlement.metadata,
      };
      state.siblings.push(row);
      return [{ id: row.id }];
    }
    if (/delete from trips/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_A || v === TRIP_B);
      state.trips = state.trips.filter((id) => id !== tripId);
      return [];
    }
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected sql: ${text.slice(0, 200)}`);
  };
}

const singleState = makeState();
const singleDb = dbFor(singleState);
const firstAttach = await attachPurchasedEntitlementToChatTrip(singleDb, singleState.session, TRIP_A);
assert.equal(firstAttach.ok, true);
assert.equal(singleState.entitlement.trip_id, TRIP_A);
const again = await attachPurchasedEntitlementToChatTrip(singleDb, singleState.session, TRIP_A);
assert.equal(again.ok, true);
assert.equal(again.action, 'already_attached');

const singleBlocked = await preflightAttachOwnerEntitlementForChatTrip(singleDb, singleState.session);
assert.equal(singleBlocked.ok, false);
assert.equal(singleBlocked.code, 'vacation_app_single_plan_second_trip_forbidden');

const unlimitedState = makeState({ plan: 'unlimited', tripId: TRIP_A });
const unlimitedDb = dbFor(unlimitedState);
const secondTrip = await attachPurchasedEntitlementToChatTrip(unlimitedDb, unlimitedState.session, TRIP_B);
assert.equal(secondTrip.ok, true);
assert.equal(secondTrip.action, 'attached_sibling');
assert.equal(unlimitedState.siblings.length, 1);
assert.equal(unlimitedState.siblings[0].trip_id, TRIP_B);

console.log('chat trip entitlement attach passed');
