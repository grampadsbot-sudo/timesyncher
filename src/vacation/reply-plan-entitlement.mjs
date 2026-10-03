import { checkoutPlanFromMetadata, requiredConfigText } from './checkout-pricing.mjs';
import { isCollaboratorAppSeat } from './collaborator-app-seat.mjs';

const OWNER_VACATION_PLANS = new Set(['single', 'unlimited']);

const PLAN_NAME_ENV = {
  single: 'TIMESYNCHER_SINGLE_NAME',
  unlimited: 'TIMESYNCHER_UNLIMITED_NAME',
};

const PRODUCT_BY_PLAN = {
  single: 'timesyncher_vacation_single',
  unlimited: 'timesyncher_vacation_unlimited',
};

export class ReplyPlanEntitlementMissingError extends Error {
  constructor(reason, tripId) {
    super('reply_plan_entitlement_missing');
    this.name = 'reply_plan_entitlement_missing';
    this.reason = reason;
    this.tripId = tripId;
  }
}

export function failReplyPlanEntitlement(reason, tripId = '') {
  const id = String(tripId || '').trim();
  console.error(JSON.stringify({ reason, tripId: id }));
  throw new ReplyPlanEntitlementMissingError(reason, id);
}

function entitlementMetadata(row = {}) {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
}

export function replyPlanFactsFromEntitlementRow(row, env = process.env, tripId = '') {
  if (!row || typeof row !== 'object') failReplyPlanEntitlement('entitlement_row_missing', tripId);
  const expectedTripId = String(tripId || '').trim();
  const boundTripId = String(row.trip_id || '').trim();
  if (expectedTripId && !boundTripId) failReplyPlanEntitlement('entitlement_trip_id_null', expectedTripId);
  if (expectedTripId && boundTripId && boundTripId !== expectedTripId) {
    failReplyPlanEntitlement('entitlement_trip_id_mismatch', expectedTripId);
  }
  if (String(row.status || '').trim() !== 'active') failReplyPlanEntitlement('entitlement_not_active', tripId);
  const metadata = entitlementMetadata(row);
  const checkoutPlan = checkoutPlanFromMetadata({ plan: row.plan, ...metadata });
  if (!OWNER_VACATION_PLANS.has(checkoutPlan)) failReplyPlanEntitlement('entitlement_plan_unsupported', tripId);
  const product = String(metadata.product || '').trim() || PRODUCT_BY_PLAN[checkoutPlan] || '';
  if (!product) failReplyPlanEntitlement('entitlement_product_missing', tripId);
  const nameKey = PLAN_NAME_ENV[checkoutPlan];
  const planName = requiredConfigText(env?.[nameKey], nameKey);
  return {
    plan_id: product,
    plan_name: planName,
    checkout_plan: checkoutPlan,
    order_bump_owned: checkoutPlan === 'unlimited',
  };
}

export async function loadOwnerReplyPlanForTurn({ session, tripId, env = process.env, db = null } = {}) {
  if (isCollaboratorAppSeat(session)) return null;
  const id = String(tripId || session?.trip_id || session?.tripId || '').trim();
  if (id) return loadTripOwnerReplyPlan({ tripId: id, env, db });
  return loadSessionOwnerReplyPlan({ session, env, db });
}

export async function loadSessionOwnerReplyPlan({ session, env = process.env, db = null } = {}) {
  const orderId = String(session?.order_id || '').trim();
  const customerId = String(session?.customer_id || '').trim();
  if (!orderId && !customerId) failReplyPlanEntitlement('session_purchase_missing', '');
  const database = db || (await import('./db.mjs')).sql(env);
  const rows = orderId
    ? await database`
      select e.plan, e.status, e.metadata, e.trip_id
      from entitlements e
      inner join paid_orders po on po.entitlement_id = e.id
      where po.id = ${orderId}
        and e.status = 'active'
      order by e.updated_at desc
      limit 1
    `
    : await database`
      select e.plan, e.status, e.metadata, e.trip_id
      from entitlements e
      where e.customer_id = ${customerId}
        and e.status = 'active'
        and e.trip_id is null
      order by e.updated_at desc
      limit 1
    `;
  const sessionTripId = String(session?.trip_id || '').trim();
  if (sessionTripId && rows[0] && !String(rows[0].trip_id || '').trim()) {
    failReplyPlanEntitlement('entitlement_trip_id_null', sessionTripId);
  }
  return replyPlanFactsFromEntitlementRow(rows[0], env, sessionTripId);
}

export async function savedTripWithOwnerPlan(saved, tripId, env = process.env, session = null) {
  if (isCollaboratorAppSeat(session)) {
    const base = saved && typeof saved === 'object' ? saved : {};
    return { ...base, planOwned: false, purchased_plan: '', ownerPlan: null };
  }
  const id = String(tripId || '').trim();
  if (!id) {
    const orderId = String(session?.order_id || '').trim();
    const customerId = String(session?.customer_id || '').trim();
    if (!orderId && !customerId) return saved;
    const ownerPlan = await loadSessionOwnerReplyPlan({ session, env });
    const base = saved && typeof saved === 'object' ? saved : {};
    return {
      ...base,
      ownerPlan,
      purchased_plan: ownerPlan.checkout_plan,
      planOwned: ownerPlan.checkout_plan === 'unlimited',
    };
  }
  if (!saved || !env?.DATABASE_URL) return saved;
  const ownerPlan = await loadTripOwnerReplyPlan({ tripId: id, env });
  return {
    ...saved,
    ownerPlan,
    purchased_plan: ownerPlan.checkout_plan,
    planOwned: ownerPlan.checkout_plan === 'unlimited',
  };
}

export function planFactsForReply({ upsell, postIntake = false, planLine = '', seatDollars = null, planOwned = false, purchasedPlan = '', priceAsk = false } = {}) {
  const dollars = Number(seatDollars);
  const purchased = String(purchasedPlan || '').trim();
  let mode = 'forbidden';
  if (postIntake) mode = 'post-intake';
  else if (upsell === 'allow-once') mode = 'allow-once';
  else if (priceAsk) mode = 'price';
  return {
    mode,
    seat_dollars: Number.isFinite(dollars) && dollars > 0 ? dollars : null,
    payer_line: String(planLine || '').trim() || null,
    purchased_plan: purchased || null,
    plan_owned: Boolean(purchased) || planOwned === true,
  };
}

export async function loadTripOwnerReplyPlan({ tripId, env = process.env, db = null } = {}) {
  const id = String(tripId || '').trim();
  if (!id) failReplyPlanEntitlement('trip_id_missing', '');
  const database = db || (await import('./db.mjs')).sql(env);
  const rows = await database`
    select e.plan, e.status, e.metadata, e.trip_id
    from trips t
    join entitlements e on e.customer_id = t.customer_id and e.trip_id = t.id
    where t.id = ${id}
      and e.status = 'active'
    order by e.updated_at desc
    limit 1
  `;
  if (!rows[0]) failReplyPlanEntitlement('entitlement_row_missing', id);
  return replyPlanFactsFromEntitlementRow(rows[0], env, id);
}
