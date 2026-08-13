import crypto from 'node:crypto';
import { cleanText } from './http.mjs';

export function normalizeCouponCode(value) {
  return cleanText(value, 120).replace(/\s+/g, '').toUpperCase();
}

export function couponHash(code, env = process.env) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return '';
  const salt = env.TIMESYNCHER_COUPON_HASH_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-checkout-coupons';
  return crypto.createHash('sha256').update(`${salt}:${normalized}`).digest('hex');
}

export function couponHint(code) {
  const normalized = normalizeCouponCode(code);
  if (normalized.length <= 6) return normalized;
  return `${normalized.slice(0, 3)}...${normalized.slice(-3)}`;
}

export function generateCouponCode() {
  return `TS-${crypto.randomBytes(9).toString('base64url').toUpperCase()}`;
}

export async function createCoupon(db, body = {}, env = process.env) {
  const rawCode = normalizeCouponCode(body.code) || generateCouponCode();
  const label = cleanText(body.label || body.name, 180) || 'TimeSyncher checkout coupon';
  const maxRedemptions = Math.max(1, Math.min(1000, Number.parseInt(body.maxRedemptions || body.max_redemptions || '1', 10)));
  const expiresAt = cleanText(body.expiresAt || body.expires_at, 80) || null;
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
  const rows = await db`
    insert into checkout_coupons (
      code_hash, code_hint, label, max_redemptions, status, expires_at, metadata, updated_at
    )
    values (
      ${couponHash(rawCode, env)}, ${couponHint(rawCode)}, ${label}, ${maxRedemptions}, 'active',
      ${expiresAt}, ${metadata}, now()
    )
    returning id, code_hint, label, max_redemptions, redemption_count, status, expires_at, created_at, updated_at
  `;
  return { coupon: publicCoupon(rows[0]), code: rawCode };
}

export async function disableCoupon(db, id) {
  const rows = await db`
    update checkout_coupons
    set status = 'disabled', updated_at = now()
    where id = ${id}
    returning id, code_hint, label, max_redemptions, redemption_count, status, expires_at, created_at, updated_at
  `;
  if (!rows[0]) throw Object.assign(new Error('Coupon not found.'), { statusCode: 404 });
  return publicCoupon(rows[0]);
}

export async function listCoupons(db, limit = 100) {
  const rows = await db`
    select
      c.id, c.code_hint, c.label, c.max_redemptions, c.redemption_count, c.status,
      c.expires_at, c.created_at, c.updated_at,
      coalesce(json_agg(json_build_object(
        'id', r.id,
        'email', r.email,
        'plan', r.plan,
        'originalAmountCents', r.original_amount_cents,
        'status', r.status,
        'emailStatus', r.email_status,
        'onboardingSessionId', r.onboarding_session_id,
        'orderId', r.order_id,
        'redeemedAt', r.created_at
      ) order by r.created_at desc) filter (where r.id is not null), '[]'::json) as redemptions
    from checkout_coupons c
    left join checkout_coupon_redemptions r on r.coupon_id = c.id
    group by c.id
    order by c.created_at desc
    limit ${Math.max(1, Math.min(500, Number.parseInt(limit || '100', 10)))}
  `;
  return rows.map(publicCoupon);
}

export async function consumeCoupon(db, code, { email, plan, originalAmountCents, metadata = {} } = {}, env = process.env) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) throw Object.assign(new Error('Coupon code is required.'), { statusCode: 400 });
  const rows = await db`
    update checkout_coupons
    set redemption_count = redemption_count + 1, updated_at = now()
    where code_hash = ${couponHash(normalized, env)}
      and status = 'active'
      and redemption_count < max_redemptions
      and (expires_at is null or expires_at > now())
    returning id, code_hint, label, max_redemptions, redemption_count, status, expires_at
  `;
  if (!rows[0]) throw Object.assign(new Error('Coupon is invalid, expired, disabled, or already used.'), { statusCode: 400 });
  const redemptions = await db`
    insert into checkout_coupon_redemptions (
      coupon_id, email, plan, original_amount_cents, status, metadata
    )
    values (
      ${rows[0].id}, ${cleanText(email, 180).toLowerCase() || null}, ${plan}, ${originalAmountCents || 0},
      'processing', ${metadata}
    )
    returning *
  `;
  return { coupon: publicCoupon(rows[0]), redemption: redemptions[0] };
}

export async function completeCouponRedemption(db, redemptionId, onboarding, email) {
  const rows = await db`
    update checkout_coupon_redemptions
    set customer_id = ${onboarding.customerId},
      trip_id = ${onboarding.tripId},
      order_id = ${onboarding.orderId},
      onboarding_session_id = ${onboarding.session.id},
      status = 'redeemed',
      email_status = ${email?.status || 'unknown'},
      metadata = metadata || ${{
        onboardingUrl: onboarding.onboardingUrl,
        telegramUrl: onboarding.telegramUrl,
        eula: onboarding.eula || null,
        email,
      }}
    where id = ${redemptionId}
    returning *
  `;
  return rows[0] || null;
}

export async function completeCollaboratorCouponRedemption(db, redemptionId, { invite, email, token }) {
  const rows = await db`
    update checkout_coupon_redemptions
    set customer_id = ${invite.owner_customer_id},
      trip_id = ${invite.trip_id || null},
      order_id = null,
      onboarding_session_id = null,
      status = 'redeemed',
      email_status = ${email?.status || 'unknown'},
      metadata = metadata || ${{
        collaboratorInviteId: invite.id,
        collaboratorTelegramUrl: token ? `telegram-token:${token.slice(0, 8)}` : null,
        email,
      }}
    where id = ${redemptionId}
    returning *
  `;
  return rows[0] || null;
}

function publicCoupon(row) {
  if (!row) return null;
  return {
    id: row.id,
    codeHint: row.code_hint,
    label: row.label,
    maxRedemptions: Number(row.max_redemptions || 0),
    redemptionCount: Number(row.redemption_count || 0),
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    redemptions: row.redemptions || undefined,
  };
}
