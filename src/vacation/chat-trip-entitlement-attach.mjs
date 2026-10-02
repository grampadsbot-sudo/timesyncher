import { checkoutPlanFromMetadata } from './checkout-pricing.mjs';

function entitlementMetadata(row = {}) {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
}

function checkoutPlanForEntitlementRow(row) {
  const metadata = entitlementMetadata(row);
  return checkoutPlanFromMetadata({ plan: row.plan, ...metadata });
}

async function entitlementForSessionOrder(db, session) {
  const orderId = String(session?.order_id || '').trim();
  if (!orderId) return null;
  const rows = await db`
    select
      e.id,
      e.customer_id,
      e.trip_id,
      e.plan,
      e.status,
      e.metadata,
      e.stripe_customer_id,
      e.stripe_subscription_id,
      e.stripe_payment_intent_id
    from entitlements e
    inner join paid_orders po on po.entitlement_id = e.id
    where po.id = ${orderId}
      and e.status = 'active'
    order by e.updated_at desc
    limit 1
  `;
  return rows[0] || null;
}

async function unattachedCustomerEntitlement(db, customerId) {
  const rows = await db`
    select
      e.id,
      e.customer_id,
      e.trip_id,
      e.plan,
      e.status,
      e.metadata,
      e.stripe_customer_id,
      e.stripe_subscription_id,
      e.stripe_payment_intent_id
    from entitlements e
    where e.customer_id = ${customerId}
      and e.status = 'active'
      and e.trip_id is null
    order by e.updated_at desc
    limit 1
  `;
  return rows[0] || null;
}

async function activeEntitlementForTrip(db, customerId, tripId) {
  const rows = await db`
    select e.id
    from entitlements e
    where e.customer_id = ${customerId}
      and e.trip_id = ${tripId}
      and e.status = 'active'
    order by e.updated_at desc
    limit 1
  `;
  return rows[0] || null;
}

async function resolvePurchasedOwnerEntitlement(db, session) {
  const customerId = String(session?.customer_id || '').trim();
  if (!customerId) {
    return {
      ok: false,
      statusCode: 502,
      code: 'vacation_app_owner_entitlement_missing',
      error: 'No purchased owner entitlement is available for this session.',
    };
  }
  const purchase = await entitlementForSessionOrder(db, session) || await unattachedCustomerEntitlement(db, customerId);
  if (!purchase) {
    return {
      ok: false,
      statusCode: 502,
      code: 'vacation_app_owner_entitlement_missing',
      error: 'No purchased owner entitlement is available for this session.',
    };
  }
  const checkoutPlan = checkoutPlanForEntitlementRow(purchase);
  if (checkoutPlan !== 'single' && checkoutPlan !== 'unlimited') {
    return {
      ok: false,
      statusCode: 502,
      code: 'vacation_app_owner_entitlement_unsupported',
      error: 'The purchased entitlement plan cannot be attached to a vacation.',
    };
  }
  return { ok: true, purchase, checkoutPlan };
}

export async function preflightAttachOwnerEntitlementForChatTrip(db, session) {
  const resolved = await resolvePurchasedOwnerEntitlement(db, session);
  if (!resolved.ok) return resolved;
  const { purchase, checkoutPlan } = resolved;
  if (checkoutPlan === 'single' && purchase.trip_id) {
    return {
      ok: false,
      statusCode: 409,
      code: 'vacation_app_single_plan_second_trip_forbidden',
      error: 'The single-vacation plan already has a trip. Start a new purchase to plan another vacation.',
    };
  }
  return { ok: true, purchase, checkoutPlan };
}

export async function attachPurchasedEntitlementToChatTrip(db, session, tripId) {
  const id = String(tripId || '').trim();
  if (!id) {
    return {
      ok: false,
      statusCode: 500,
      code: 'vacation_app_owner_entitlement_attach_failed',
      error: 'Trip id is required to attach the purchased entitlement.',
    };
  }
  const customerId = String(session?.customer_id || '').trim();
  const existing = await activeEntitlementForTrip(db, customerId, id);
  if (existing?.id) {
    return { ok: true, entitlementId: existing.id, action: 'already_attached' };
  }

  const resolved = await resolvePurchasedOwnerEntitlement(db, session);
  if (!resolved.ok) return resolved;
  const { purchase, checkoutPlan } = resolved;

  if (checkoutPlan === 'single') {
    if (purchase.trip_id && purchase.trip_id !== id) {
      return {
        ok: false,
        statusCode: 409,
        code: 'vacation_app_single_plan_second_trip_forbidden',
        error: 'The single-vacation plan already has a trip. Start a new purchase to plan another vacation.',
      };
    }
    const updated = await db`
      update entitlements
      set trip_id = ${id}, updated_at = now()
      where id = ${purchase.id}
        and status = 'active'
        and (trip_id is null or trip_id = ${id})
      returning id
    `;
    if (!updated[0]?.id) {
      return {
        ok: false,
        statusCode: 409,
        code: 'vacation_app_single_plan_second_trip_forbidden',
        error: 'The single-vacation plan already has a trip. Start a new purchase to plan another vacation.',
      };
    }
    return { ok: true, entitlementId: updated[0].id, action: 'attached' };
  }

  if (!purchase.trip_id) {
    const updated = await db`
      update entitlements
      set trip_id = ${id}, updated_at = now()
      where id = ${purchase.id}
        and status = 'active'
        and trip_id is null
      returning id
    `;
    if (!updated[0]?.id) {
      return {
        ok: false,
        statusCode: 502,
        code: 'vacation_app_owner_entitlement_attach_failed',
        error: 'Unable to attach the purchased owner entitlement to this vacation.',
      };
    }
    return { ok: true, entitlementId: updated[0].id, action: 'attached' };
  }

  const metadata = entitlementMetadata(purchase);
  const inserted = await db`
    insert into entitlements (
      customer_id,
      trip_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_payment_intent_id,
      plan,
      status,
      metadata,
      updated_at
    )
    values (
      ${purchase.customer_id},
      ${id},
      ${purchase.stripe_customer_id || null},
      ${purchase.stripe_subscription_id || null},
      ${purchase.stripe_payment_intent_id || null},
      ${purchase.plan},
      'active',
      ${metadata},
      now()
    )
    returning id
  `;
  if (!inserted[0]?.id) {
    return {
      ok: false,
      statusCode: 502,
      code: 'vacation_app_owner_entitlement_attach_failed',
      error: 'Unable to attach the purchased owner entitlement to this vacation.',
    };
  }
  return { ok: true, entitlementId: inserted[0].id, action: 'attached_sibling' };
}
