import crypto from 'node:crypto';
import { checkoutOrderSummary } from './checkout-pricing.mjs';
import { cleanText, ensureVacationEulaSession, onboardingLink, telegramLink, upsertCustomer } from './onboarding.mjs';
import { queueOrSendPurchaseEmail } from './email.mjs';

function token() {
  return crypto.randomBytes(18).toString('base64url');
}

export function normalizeCouponCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function validateCouponCode(value) {
  const code = normalizeCouponCode(value);
  if (!/^[A-Z0-9][A-Z0-9-]{3,63}$/.test(code)) {
    throw Object.assign(new Error('Enter a valid coupon code.'), { statusCode: 400 });
  }
  return code;
}

export function couponCodeHint(value) {
  const code = normalizeCouponCode(value);
  if (code.length <= 8) return code;
  return `${code.slice(0, 4)}...${code.slice(-4)}`;
}

export function couponCodeHash(value, env = process.env) {
  const code = validateCouponCode(value);
  const salt = env.TIMESYNCHER_COUPON_HASH_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-coupons';
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export function generateCouponCode({ prefix = 'TSV', bytes = 6 } = {}) {
  const cleanPrefix = normalizeCouponCode(prefix || 'TSV').replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'TSV';
  return `${cleanPrefix}-${crypto.randomBytes(bytes).toString('base64url').toUpperCase().replace(/_/g, 'X').replace(/-/g, 'Y')}`;
}

export function couponContactFromBody(body = {}) {
  const firstName = cleanText(body.firstName || body.first_name, 80);
  const lastName = cleanText(body.lastName || body.last_name, 80);
  const email = cleanText(body.email, 180).toLowerCase();
  if (!firstName) throw Object.assign(new Error('First name is required.'), { statusCode: 400 });
  if (!lastName) throw Object.assign(new Error('Last name is required.'), { statusCode: 400 });
  if (!email || !email.includes('@')) throw Object.assign(new Error('Valid email is required.'), { statusCode: 400 });
  return {
    firstName,
    lastName,
    displayName: [firstName, lastName].filter(Boolean).join(' '),
    email,
    phone: cleanText(body.phone, 80) || null,
    vacationDate: cleanText(body.vacationDate, 40) || null,
  };
}

function couponMetadata({ body, contact, coupon, orderSummary }) {
  return {
    source: 'coupon_checkout',
    couponCheckout: true,
    couponId: coupon.id,
    couponHint: coupon.code_hint,
    couponLabel: coupon.label || null,
    requestedEmail: contact.email,
    orderBump: orderSummary.orderBump,
    photoMemories: orderSummary.photoMemories,
    originalAmountCents: orderSummary.amountCents,
    waivedAmountCents: orderSummary.amountCents,
    vacation_date: contact.vacationDate || null,
    first_name: contact.firstName,
    last_name: contact.lastName,
    email: contact.email,
    phone: contact.phone || '',
    checkoutUserAgent: cleanText(body.userAgent, 500) || null,
  };
}

async function createCouponOnboarding(db, { body, coupon, env, onOrderCreated = () => {} }) {
  const contact = couponContactFromBody(body);
  const orderSummary = checkoutOrderSummary({
    orderBump: Boolean(body.orderBump),
    photoMemories: Boolean(body.photoMemories),
  }, env);
  const now = new Date().toISOString();
  const meta = couponMetadata({ body, contact, coupon, orderSummary });

  const customerId = await upsertCustomer(db, contact, meta);
  const tripRows = await db`
    insert into trips (customer_id, title, start_date, preferences, status, metadata)
    values (
      ${customerId},
      ${cleanText(body.tripTitle || body.title, 180) || 'TimeSyncher Vacation Coupon Checkout'},
      ${contact.vacationDate || null},
      ${{ source: 'coupon_checkout', onboarding: true }},
      'onboarding',
      ${meta}
    )
    returning id
  `;
  const tripId = tripRows[0].id;

  const entitlementRows = await db`
    insert into entitlements (customer_id, trip_id, plan, status, metadata, updated_at)
    values (${customerId}, ${tripId}, ${orderSummary.plan}, 'active', ${meta}, now())
    returning id
  `;
  const entitlementId = entitlementRows[0].id;

  const orderRows = await db`
    insert into paid_orders (
      customer_id, trip_id, entitlement_id, amount_cents, currency, plan, status,
      contact, metadata, paid_at, updated_at
    )
    values (
      ${customerId}, ${tripId}, ${entitlementId}, 0, ${orderSummary.currency}, ${orderSummary.plan}, 'coupon_redeemed',
      ${contact}, ${meta}, ${now}, now()
    )
    returning id
  `;
  const orderId = orderRows[0].id;
  onOrderCreated(orderId);

  const sessionToken = token();
  const sessionRows = await db`
    insert into onboarding_sessions (
      customer_id, trip_id, order_id, token, status, current_step, telegram_deep_link,
      metadata, updated_at
    )
    values (
      ${customerId}, ${tripId}, ${orderId}, ${sessionToken}, 'purchase_confirmed',
      'post_purchase', ${telegramLink(sessionToken, env)}, ${meta}, now()
    )
    returning *
  `;
  const session = sessionRows[0];
  const eula = await ensureVacationEulaSession(session, { contact, env });
  const onboarding = {
    customerId,
    tripId,
    entitlementId,
    orderId,
    session,
    token: session.token,
    onboardingUrl: onboardingLink(session.token, env),
    telegramUrl: session.telegram_deep_link || telegramLink(session.token, env),
    eula,
    contact,
    order: {
      amountCents: 0,
      originalAmountCents: orderSummary.amountCents,
      waivedAmountCents: orderSummary.amountCents,
      currency: orderSummary.currency,
      plan: orderSummary.plan,
      status: 'coupon_redeemed',
    },
  };
  const email = await queueOrSendPurchaseEmail(db, onboarding, env);

  return { ...onboarding, email, coupon, orderSummary };
}

export async function createCheckoutCoupon(db, { code, label, expiresAt, createdBy, metadata = {} } = {}, env = process.env) {
  const finalCode = validateCouponCode(code || generateCouponCode({ prefix: 'TSV' }));
  const rows = await db`
    insert into checkout_coupons (code_hash, code_hint, label, created_by, expires_at, metadata, updated_at)
    values (
      ${couponCodeHash(finalCode, env)}, ${couponCodeHint(finalCode)}, ${cleanText(label, 180) || null},
      ${cleanText(createdBy, 120) || null}, ${cleanText(expiresAt, 80) || null}, ${metadata}, now()
    )
    returning id, code_hint, label, status, created_by, expires_at, redeemed_at, metadata, created_at, updated_at
  `;
  return { coupon: rows[0], code: finalCode };
}

export async function redeemCheckoutCoupon(db, body = {}, env = process.env) {
  const code = validateCouponCode(body.couponCode || body.code);
  couponContactFromBody(body);
  const hash = couponCodeHash(code, env);
  const claimed = await db`
    update checkout_coupons
    set status = 'redeeming', updated_at = now()
    where code_hash = ${hash}
      and status = 'active'
      and (expires_at is null or expires_at > now())
    returning id, code_hint, label, status, created_by, expires_at, redeemed_at, metadata, created_at, updated_at
  `;
  const coupon = claimed[0];
  if (!coupon) {
    throw Object.assign(new Error('Coupon is invalid, expired, or already used.'), { statusCode: 400 });
  }

  let orderId = null;
  try {
    const onboarding = await createCouponOnboarding(db, {
      body,
      coupon,
      env,
      onOrderCreated: (id) => {
        orderId = id;
      },
    });
    const finalized = await db`
      update checkout_coupons
      set status = 'redeemed', redeemed_at = now(), redeemed_order_id = ${onboarding.orderId}, updated_at = now()
      where id = ${coupon.id}
      returning id, code_hint, label, status, created_by, expires_at, redeemed_at, metadata, created_at, updated_at
    `;
    const redemptionRows = await db`
      insert into checkout_coupon_redemptions (
        coupon_id, customer_id, order_id, session_id, code_hint, customer_email, plan,
        original_amount_cents, waived_amount_cents, currency, email_status, status, metadata, redeemed_at
      )
      values (
        ${coupon.id}, ${onboarding.customerId}, ${onboarding.orderId}, ${onboarding.session.id},
        ${coupon.code_hint}, ${onboarding.contact.email}, ${onboarding.orderSummary.plan},
        ${onboarding.orderSummary.amountCents}, ${onboarding.orderSummary.amountCents},
        ${onboarding.orderSummary.currency}, ${onboarding.email.status || null}, 'redeemed',
        ${{
          couponLabel: coupon.label || null,
          onboardingUrl: onboarding.onboardingUrl,
          telegramUrl: onboarding.telegramUrl,
          eula: onboarding.eula,
        }},
        now()
      )
      returning *
    `;
    return {
      ok: true,
      coupon: finalized[0],
      redemption: redemptionRows[0],
      onboarding: {
        token: onboarding.token,
        onboardingUrl: onboarding.onboardingUrl,
        telegramUrl: onboarding.telegramUrl,
        eula: onboarding.eula,
      },
      order: onboarding.order,
      email: onboarding.email,
    };
  } catch (error) {
    if (!orderId) {
      await db`
        update checkout_coupons
        set status = 'active', updated_at = now()
        where id = ${coupon.id} and status = 'redeeming'
      `;
    }
    throw error;
  }
}

export async function listCheckoutCoupons(db, { limit = 100 } = {}) {
  const capped = Math.max(1, Math.min(250, Number.parseInt(String(limit || 100), 10)));
  return db`
    select
      c.id, c.code_hint, c.label, c.status, c.created_by, c.expires_at, c.redeemed_at,
      c.redeemed_order_id, c.metadata, c.created_at, c.updated_at,
      r.id as redemption_id, r.customer_email, r.plan, r.original_amount_cents,
      r.waived_amount_cents, r.currency, r.email_status, r.redeemed_at as redemption_redeemed_at
    from checkout_coupons c
    left join checkout_coupon_redemptions r on r.coupon_id = c.id
    order by c.created_at desc
    limit ${capped}
  `;
}
