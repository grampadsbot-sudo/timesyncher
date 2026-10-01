import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { consumeCoupon, completeCouponRedemption, completeCollaboratorCouponRedemption } from '../src/vacation/coupons.mjs';
import { buildOnboardingFromCoupon } from '../src/vacation/onboarding.mjs';
import { queueOrSendCollaboratorInviteEmail, queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';
import { recordOwnerMediaPurchase, requireOwnerMediaAddOns, selectedMediaAddOn } from '../src/vacation/media-checkout.mjs';
import {
  collaboratorPlan,
  collaboratorTelegramLink,
  loadCollaboratorInviteByToken,
  markCollaboratorInvitePaid,
} from '../src/vacation/collaborators.mjs';
import { joinCollaboratorAppSession } from '../src/vacation/collaborator-app-seat.mjs';
import { checkoutOrderSummary, customerCheckoutFailure } from '../src/vacation/checkout-pricing.mjs';

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
  const summary = checkoutOrderSummary({
    orderBump: Boolean(body.orderBump),
    photoMemories: Boolean(body.photoMemories),
    media: Boolean(body.media),
  }, process.env);
  return {
    orderBump: summary.orderBump,
    photoMemories: summary.photoMemories,
    amount: summary.amountCents,
    plan: summary.plan,
  };
}

function collaboratorAccessAddOns(body = {}, plan = {}) {
  const media = selectedMediaAddOn(body, process.env);
  return {
    photoUpload: media.photoUpload,
    videoUpload: media.videoUpload,
    photoAmountCents: media.photoAmountCents,
    videoAmountCents: media.videoAmountCents,
    amountCents: media.amountCents,
    plan: plan.code || media.plan,
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
      const joined = await joinCollaboratorAppSession(db, { invite, contact, env: process.env });
      if (addOns.amountCents > 0) {
        await recordOwnerMediaPurchase({
          db,
          contact,
          addOns: { ...addOns, plan: 'owner_media', scope: 'owner', amountCents: addOns.amountCents, ownerCustomerId: pendingInvite.owner_customer_id },
          ownerCustomerId: pendingInvite.owner_customer_id,
          amountCents: 0,
          currency: CURRENCY,
          status: 'coupon_redeemed',
          metadata: { paidVia: 'collaborator_coupon_checkout', collaboratorInviteId: pendingInvite.id },
        });
      }
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
          vacationAppUrl: joined.vacationAppUrl,
          token: joined.token,
          payer: joined.payer,
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
        vacationAppUrl: onboarding.vacationAppUrl,
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
    const safe = customerCheckoutFailure(error);
    return sendJson(res, safe.statusCode || 400, { ok: false, error: safe.message || 'Unable to redeem coupon.' });
  }
}
