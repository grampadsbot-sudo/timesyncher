import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { consumeCoupon, completeCouponRedemption, completeCollaboratorCouponRedemption } from '../src/vacation/coupons.mjs';
import { buildOnboardingFromCoupon } from '../src/vacation/onboarding.mjs';
import { queueOrSendCollaboratorInviteEmail, queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';
import { recordOwnerMediaPurchase, requireOwnerMediaAddOns } from '../src/vacation/media-checkout.mjs';
import {
  collaboratorPlan,
  collaboratorTelegramLink,
  loadCollaboratorInviteByToken,
  markCollaboratorInvitePaid,
} from '../src/vacation/collaborators.mjs';

const BASE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_BASE_PRICE_CENTS || '3700', 10);
const ORDER_BUMP_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS || '2700', 10);
const PHOTO_MEMORIES_SINGLE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS || '500', 10);
const PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS || '900', 10);
const COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS || '500', 10);
const COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS || '900', 10);
const COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS || '1700', 10);
const COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS || '2700', 10);
const CURRENCY = process.env.TIMESYNCHER_CHECKOUT_CURRENCY || 'usd';

function requireContact(body) {
  const firstName = cleanText(body.firstName, 80);
  const lastName = cleanText(body.lastName, 80);
  const email = cleanText(body.email, 180).toLowerCase();
  if (!firstName) throw Object.assign(new Error('First name is required.'), { statusCode: 400 });
  if (!lastName) throw Object.assign(new Error('Last name is required.'), { statusCode: 400 });
  if (!email || !email.includes('@')) throw Object.assign(new Error('Valid email is required.'), { statusCode: 400 });
  return {
    firstName,
    lastName,
    email,
    phone: cleanText(body.phone, 80) || null,
    displayName: `${firstName} ${lastName}`.trim() || email,
  };
}

function orderDetails(body) {
  const orderBump = Boolean(body.orderBump);
  const photoMemories = Boolean(body.photoMemories);
  const photoAmount = photoMemories ? (orderBump ? PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS : PHOTO_MEMORIES_SINGLE_PRICE_CENTS) : 0;
  const amount = BASE_PRICE_CENTS + (orderBump ? ORDER_BUMP_PRICE_CENTS : 0) + photoAmount;
  return {
    orderBump,
    photoMemories,
    amount,
    plan: orderBump ? 'unlimited' : 'single',
  };
}

function collaboratorAccessAddOns(body = {}, plan = {}) {
  const selected = body.accessAddOns && typeof body.accessAddOns === 'object' ? body.accessAddOns : body;
  const unlimited = plan.scope === 'unlimited_trips';
  const photoUpload = Boolean(selected.photoUpload || selected.photo_upload || selected.photoMemories);
  const videoUpload = Boolean(selected.videoUpload || selected.video_upload || selected.videoMemories);
  const photoAmountCents = photoUpload ? (unlimited ? COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS : COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS) : 0;
  const videoAmountCents = videoUpload ? (unlimited ? COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS : COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS) : 0;
  return {
    photoUpload,
    videoUpload,
    photoAmountCents,
    videoAmountCents,
    amountCents: photoAmountCents + videoAmountCents,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  try {
    const body = await readJson(req);
    const contact = requireContact(body);
    const order = orderDetails(body);
    const db = sql(process.env);
    const couponCode = cleanText(body.couponCode || body.coupon, 120);
    const collaboratorInviteToken = cleanText(body.collaboratorInvite || body.collaboratorInviteToken, 200);
    if (body.action === 'redeem_owner_media_coupon' || body.product === 'owner_media_addons') {
      const addOns = requireOwnerMediaAddOns(body);
      const { coupon, redemption } = await consumeCoupon(db, couponCode, {
        email: contact.email,
        plan: addOns.plan,
        originalAmountCents: addOns.amountCents,
        metadata: {
          source: 'owner_media_coupon_checkout',
          plan: addOns.plan,
          mediaScope: addOns.scope,
          photoUpload: addOns.photoUpload,
          videoUpload: addOns.videoUpload,
          photoAmountCents: addOns.photoAmountCents,
          videoAmountCents: addOns.videoAmountCents,
          totalAmountCents: addOns.amountCents,
          email: contact.email,
          first_name: contact.firstName,
          last_name: contact.lastName,
        },
      }, process.env);
      const purchase = await recordOwnerMediaPurchase({
        db,
        contact,
        addOns,
        amountCents: 0,
        currency: CURRENCY,
        status: 'coupon_redeemed',
        metadata: {
          couponId: coupon.id,
          couponHint: coupon.codeHint,
          couponRedemptionId: redemption.id,
          paidVia: 'coupon_checkout',
          originalAmountCents: addOns.amountCents,
          amountWaivedCents: addOns.amountCents,
          source: 'owner_media_coupon_checkout',
        },
      });
      const rows = await db`
        update checkout_coupon_redemptions
        set customer_id = ${purchase.customerId},
          trip_id = null,
          order_id = ${purchase.orderId},
          onboarding_session_id = null,
          status = 'redeemed',
          email_status = 'not_applicable',
          metadata = metadata || ${{
            ownerMediaOrderId: purchase.orderId,
            ownerMediaEntitlementId: purchase.entitlementId,
            mediaAddOns: addOns,
          }}
        where id = ${redemption.id}
        returning *
      `;
      return sendJson(res, 200, {
        ok: true,
        status: 'owner_media_coupon_redeemed',
        coupon,
        redemption: rows[0] || null,
        order: {
          amountCents: 0,
          originalAmountCents: addOns.amountCents,
          amountWaivedCents: addOns.amountCents,
          currency: CURRENCY,
          plan: addOns.plan,
          status: 'coupon_redeemed',
          mediaAddOns: addOns,
        },
      });
    }
    if (collaboratorInviteToken) {
      const pendingInvite = await loadCollaboratorInviteByToken(db, collaboratorInviteToken, process.env);
      if (!pendingInvite) throw Object.assign(new Error('Collaborator invite link is invalid or expired.'), { statusCode: 400 });
      const plan = collaboratorPlan(pendingInvite.plan_code);
      const addOns = collaboratorAccessAddOns(body, plan);
      const originalAmountCents = plan.amountCents + addOns.amountCents;
      const { coupon, redemption } = await consumeCoupon(db, couponCode, {
        email: contact.email,
        plan: plan.code,
        originalAmountCents,
        metadata: {
          source: 'collaborator_coupon_checkout',
          collaboratorInviteId: pendingInvite.id,
          collaboratorPlan: plan.code,
          photoUpload: addOns.photoUpload,
          videoUpload: addOns.videoUpload,
          photoAmountCents: addOns.photoAmountCents,
          videoAmountCents: addOns.videoAmountCents,
          totalAmountCents: originalAmountCents,
          email: contact.email,
          first_name: contact.firstName,
          last_name: contact.lastName,
        },
      }, process.env);
      const invite = await markCollaboratorInvitePaid(db, {
        token: collaboratorInviteToken,
        env: process.env,
        metadata: {
          couponId: coupon.id,
          couponHint: coupon.codeHint,
          couponRedemptionId: redemption.id,
          paidVia: 'coupon_checkout',
          requestedEmail: contact.email,
          requestedFor: contact.displayName,
          photoUpload: addOns.photoUpload,
          videoUpload: addOns.videoUpload,
          photoAmountCents: addOns.photoAmountCents,
          videoAmountCents: addOns.videoAmountCents,
          totalAmountCents: originalAmountCents,
        },
      });
      const email = await queueOrSendCollaboratorInviteEmail(db, {
        invite,
        token: collaboratorInviteToken,
        contact,
      }, process.env);
      const completedRedemption = await completeCollaboratorCouponRedemption(db, redemption.id, {
        invite,
        token: collaboratorInviteToken,
        email,
      });
      return sendJson(res, 200, {
        ok: true,
        status: 'collaborator_coupon_redeemed',
        coupon,
        redemption: completedRedemption,
        collaboratorInvite: {
          id: invite.id,
          status: invite.status,
          telegramUrl: collaboratorTelegramLink(collaboratorInviteToken, process.env),
          tripTitle: invite.trip_title || null,
          requestedFor: contact.displayName,
          accessAddOns: addOns,
        },
        order: {
          amountCents: 0,
          originalAmountCents,
          amountWaivedCents: originalAmountCents,
          currency: CURRENCY,
          plan: plan.code,
          status: 'coupon_redeemed',
          accessAddOns: addOns,
        },
        email,
      });
    }
    const metadata = {
      source: 'coupon_checkout',
      order_bump: String(order.orderBump),
      photo_memories: String(order.photoMemories),
      vacation_date: cleanText(body.vacationDate, 40) || null,
      currency: CURRENCY,
      product: order.plan === 'unlimited' ? 'timesyncher_vacation_unlimited' : 'timesyncher_vacation_single',
      plan: order.plan,
      email: contact.email,
      phone: contact.phone,
      first_name: contact.firstName,
      last_name: contact.lastName,
    };
    const { coupon, redemption } = await consumeCoupon(db, couponCode, {
      email: contact.email,
      plan: order.plan,
      originalAmountCents: order.amount,
      metadata,
    }, process.env);
    const onboarding = await buildOnboardingFromCoupon({
      db,
      contact,
      plan: order.plan,
      amountCents: order.amount,
      metadata: {
        ...metadata,
        couponId: coupon.id,
        couponHint: coupon.codeHint,
        couponRedemptionId: redemption.id,
      },
      env: process.env,
    });
    const email = await queueOrSendPurchaseEmail(db, onboarding, process.env);
    const completedRedemption = await completeCouponRedemption(db, redemption.id, onboarding, email);
    return sendJson(res, 200, {
      ok: true,
      status: 'coupon_redeemed',
      coupon,
      redemption: completedRedemption,
      session: {
        id: onboarding.session.id,
        token: onboarding.token,
        onboardingUrl: onboarding.onboardingUrl,
        telegramUrl: onboarding.telegramUrl,
        eula: onboarding.eula,
      },
      order: {
        amountCents: 0,
        originalAmountCents: order.amount,
        amountWaivedCents: order.amount,
        currency: CURRENCY,
        plan: order.plan,
        status: 'coupon_redeemed',
      },
      email,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to redeem coupon.' });
  }
}
