import Stripe from 'stripe';
import { stripeSecretKey } from './stripe-env.mjs';
import { collaboratorPlan, countActiveCollaborators, createCollaboratorInvite } from './collaborators.mjs';

const CURRENCY = process.env.TIMESYNCHER_CHECKOUT_CURRENCY || 'usd';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function siteBase(env = process.env) {
  return String(env.TIMESYNCHER_SITE_BASE_URL || env.SITE_BASE_URL || 'https://www.timesyncher.com').replace(/\/+$/, '');
}

export async function createCollaboratorCheckout({ db, stripe, env = process.env, ownerCustomerId, tripId, planCode, requestedFor = '', metadata = {} }) {
  const plan = collaboratorPlan(clean(planCode || 'single_trip', 80));
  const ownerId = clean(ownerCustomerId, 80);
  const normalizedTripId = clean(tripId, 80);
  if (!ownerId) throw Object.assign(new Error('ownerCustomerId is required.'), { statusCode: 400 });
  if (plan.scope === 'single_trip' && !normalizedTripId) {
    throw Object.assign(new Error('tripId is required for single vacation collaborators.'), { statusCode: 400 });
  }

  const activeCount = await countActiveCollaborators(db, ownerId);
  if (activeCount >= plan.maxActiveCollaborators) {
    throw Object.assign(new Error('Telegram collaborator cap reached.'), { statusCode: 409 });
  }

  const { invite, token } = await createCollaboratorInvite(db, {
    ownerCustomerId: ownerId,
    tripId: normalizedTripId,
    planCode: plan.code,
    requestedFor: clean(requestedFor, 180),
    metadata: {
      source: 'telegram_collaborator_checkout',
      ...metadata,
    },
    env,
  });

  const base = siteBase(env);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    allow_promotion_codes: true,
    line_items: [{
      price_data: {
        currency: CURRENCY,
        product_data: {
          name: plan.scope === 'single_trip'
            ? 'Telegram collaborator for one vacation'
            : 'Telegram collaborator for all vacations',
        },
        unit_amount: plan.amountCents,
      },
      quantity: 1,
    }],
    success_url: `${base}/order-success.html?collaboratorCheckout=complete`,
    cancel_url: `${base}/order-success.html?collaboratorInviteCancelled=1`,
    metadata: {
      product: 'timesyncher_vacation_telegram_collaborator',
      invite_id: invite.id,
      invite_token: token,
      owner_customer_id: ownerId,
      trip_id: plan.scope === 'single_trip' ? normalizedTripId : '',
      plan_code: plan.code,
      scope: plan.scope,
    },
  });

  await db`
    update vacation_collaborator_invites
    set stripe_checkout_session_id = ${session.id}, updated_at = now()
    where id = ${invite.id}
  `;

  return {
    ok: true,
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
    inviteId: invite.id,
    token,
    plan: plan.code,
    scope: plan.scope,
    amountCents: plan.amountCents,
    allowPromotionCodes: true,
  };
}

export function collaboratorStripe(env = process.env) {
  const stripeConfig = stripeSecretKey(env);
  return new Stripe(stripeConfig.key, { apiVersion: '2025-11-17.clover' });
}
