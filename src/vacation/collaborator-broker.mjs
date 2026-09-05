import { consumeCoupon, completeCollaboratorCouponRedemption } from './coupons.mjs';
import {
  collaboratorCraigMarkPaidClick,
  collaboratorMarkPaidWithoutStripePath,
  collaboratorPlan,
  collaboratorTelegramLink,
  collaboratorToken,
  createCollaboratorInvite,
  markCollaboratorInvitePaid,
} from './collaborators.mjs';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function contactFromBody(body = {}, requestedFor) {
  const firstName = clean(body.firstName || body.first_name, 80) || 'Kim';
  const lastName = clean(body.lastName || body.last_name, 80) || 'Rivera';
  const email = clean(body.email, 180).toLowerCase() || 'kim.rivera.sct@example.invalid';
  return {
    firstName,
    lastName,
    email,
    displayName: requestedFor || `${firstName} ${lastName}`.trim(),
  };
}

export function publicCollaboratorBrokerInvite({
  invite,
  token,
  env = process.env,
  paidVia = null,
  dryRun = false,
  pendingOnly = false,
} = {}) {
  const status = pendingOnly
    ? 'pending_payment'
    : paidVia === 'coupon_checkout'
      ? 'collaborator_coupon_redeemed'
      : 'collaborator_staging_card_paid';
  return {
    ok: !pendingOnly,
    dryRun: Boolean(dryRun),
    status,
    paidVia: pendingOnly ? null : paidVia,
    collaboratorInvite: {
      id: invite?.id || null,
      status: invite?.status || (pendingOnly ? 'pending_payment' : 'paid'),
      plan: invite?.plan_code || null,
      requestedFor: invite?.requested_for || null,
      tripId: invite?.trip_id || null,
      telegramUrl: collaboratorTelegramLink(token, env),
    },
  };
}

export function cannotCompleteCollaboratorMarkPaid({
  invite = null,
  token = '',
  env = process.env,
  dryRun = false,
} = {}) {
  const payload = {
    ok: false,
    dryRun: Boolean(dryRun),
    status: 'cannot_mint',
    paidVia: null,
    missingFlag: 'ALLOW_COLLABORATOR_STAGING_CARD_CHECKOUT',
    craigClick: collaboratorCraigMarkPaidClick(),
    error: 'Pending invite is the owner-invite step. Mark-paid needs checkout-coupon or ALLOW_COLLABORATOR_STAGING_CARD_CHECKOUT / a staging site base URL.',
  };
  if (token) {
    payload.collaboratorInvite = publicCollaboratorBrokerInvite({
      invite: { ...invite, status: 'pending_payment' },
      token,
      env,
      pendingOnly: true,
      dryRun,
    }).collaboratorInvite;
    payload.pendingInviteCreated = !dryRun;
  }
  return payload;
}

export async function loadTripForCollaboratorBroker(db, { tripId = '', sessionToken = '' } = {}) {
  const token = clean(sessionToken, 200);
  const id = clean(tripId, 80);
  if (token) {
    const sessions = await db`
      select os.customer_id, os.trip_id, os.token, t.title as trip_title
      from onboarding_sessions os
      left join trips t on t.id = os.trip_id
      where os.token = ${token}
      limit 1
    `;
    if (sessions[0]?.trip_id) {
      if (id && String(sessions[0].trip_id) !== id) {
        throw Object.assign(new Error('sessionToken does not match tripId.'), { statusCode: 409 });
      }
      return sessions[0];
    }
  }
  if (id) {
    const trips = await db`
      select id as trip_id, customer_id, title as trip_title
      from trips
      where id = ${id}
      limit 1
    `;
    if (trips[0]) return trips[0];
  }
  throw Object.assign(new Error('Trip not found for collaborator invite.'), { statusCode: 404 });
}

export async function brokerMintPaidCollaboratorInvite(db, body = {}, env = process.env) {
  const requestedFor = clean(body.requestedFor || body.displayName || 'Kim Rivera', 180);
  const planCode = clean(body.planCode || body.plan || 'single_trip', 80);
  const couponCode = clean(body.couponCode || body.coupon, 120);
  const dryRun = Boolean(body.dryRun);
  const payVia = collaboratorMarkPaidWithoutStripePath(env, couponCode);
  const contact = contactFromBody(body, requestedFor);
  const plan = collaboratorPlan(planCode);
  const tripId = clean(body.tripId, 80) || 'aba991d7-894f-4b4c-a548-cb7510581182';

  if (dryRun) {
    const token = collaboratorToken();
    const invite = {
      id: 'dry-run-invite',
      status: payVia ? 'paid' : 'pending_payment',
      plan_code: plan.code,
      requested_for: requestedFor,
      trip_id: tripId,
    };
    if (!payVia) return cannotCompleteCollaboratorMarkPaid({ invite, token, env, dryRun: true });
    return publicCollaboratorBrokerInvite({ invite, token, env, paidVia: payVia, dryRun: true });
  }

  if (!db) {
    throw Object.assign(new Error('Database is required for a live collaborator broker mint.'), { statusCode: 503 });
  }

  const trip = await loadTripForCollaboratorBroker(db, {
    tripId: clean(body.tripId, 80),
    sessionToken: clean(body.sessionToken || body.session, 200),
  });
  const { invite, token } = await createCollaboratorInvite(db, {
    ownerCustomerId: trip.customer_id,
    tripId: trip.trip_id,
    planCode: plan.code,
    requestedFor,
    metadata: {
      source: 'admin_broker_owner_invite',
      ownerSessionTokenHint: clean(body.sessionToken || body.session, 12) || null,
      requestedEmail: contact.email,
    },
    env,
  });

  if (!payVia) {
    return cannotCompleteCollaboratorMarkPaid({ invite, token, env, dryRun: false });
  }

  if (payVia === 'coupon_checkout') {
    const originalAmountCents = plan.amountCents;
    const { coupon, redemption } = await consumeCoupon(db, couponCode, {
      email: contact.email,
      plan: plan.code,
      originalAmountCents,
      metadata: {
        source: 'collaborator_coupon_checkout',
        collaboratorInviteId: invite.id,
        collaboratorPlan: plan.code,
        broker: 'admin_collaborator_invite',
      },
    }, env);
    const paid = await markCollaboratorInvitePaid(db, {
      token,
      env,
      metadata: {
        couponId: coupon.id,
        couponHint: coupon.codeHint,
        couponRedemptionId: redemption.id,
        paidVia: 'coupon_checkout',
        requestedEmail: contact.email,
        requestedFor: contact.displayName,
      },
    });
    await completeCollaboratorCouponRedemption(db, redemption.id, { invite: paid, token, email: { status: 'skipped' } });
    return {
      ...publicCollaboratorBrokerInvite({ invite: paid, token, env, paidVia: 'coupon_checkout' }),
      coupon: { id: coupon.id, codeHint: coupon.codeHint },
    };
  }

  const paid = await markCollaboratorInvitePaid(db, {
    token,
    env,
    metadata: {
      paidVia: 'staging_card_checkout',
      requestedEmail: contact.email,
      requestedFor: contact.displayName,
      source: 'admin_broker_complete_staging_collaborator_checkout',
    },
  });
  return publicCollaboratorBrokerInvite({ invite: paid, token, env, paidVia: 'staging_card_checkout' });
}
