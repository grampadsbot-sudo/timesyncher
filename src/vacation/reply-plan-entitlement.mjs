import { checkoutPlanFromMetadata, requiredConfigText } from './checkout-pricing.mjs';

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

export async function savedTripWithOwnerPlan(saved, tripId, env = process.env) {
  const id = String(tripId || '').trim();
  if (!saved || !id || !env?.DATABASE_URL) return saved;
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
    select e.plan, e.status, e.metadata
    from trips t
    join entitlements e on e.customer_id = t.customer_id and e.trip_id = t.id
    where t.id = ${id}
      and e.status = 'active'
    order by e.updated_at desc
    limit 1
  `;
  return replyPlanFactsFromEntitlementRow(rows[0], env, id);
}
