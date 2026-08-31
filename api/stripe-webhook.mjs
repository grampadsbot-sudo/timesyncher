import Stripe from 'stripe';
import { stripeSecretKey } from '../src/vacation/stripe-env.mjs';
import { sql } from '../src/vacation/db.mjs';
import { buildOnboardingFromStripe } from '../src/vacation/onboarding.mjs';
import { queueOrSendCollaboratorInviteEmail, queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';
import { markCollaboratorInvitePaid } from '../src/vacation/collaborators.mjs';
import { accountUpgradeAddOns, ownerMediaAddOns, recordAccountUpgradePurchase, recordOwnerMediaPurchase } from '../src/vacation/media-checkout.mjs';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2) + '\n');
}

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripeConfig;
  try {
    stripeConfig = stripeSecretKey(process.env);
  } catch (error) {
    return send(res, 503, { ok: false, error: error.message || 'Stripe secret key is not configured yet.' });
  }

  const stripe = new Stripe(stripeConfig.key, { apiVersion: '2025-11-17.clover' });
  try {
    const raw = await readRaw(req);
    const signature = req.headers['stripe-signature'];
    const event = webhookSecret
      ? stripe.webhooks.constructEvent(raw, signature, webhookSecret)
      : JSON.parse(raw.toString('utf8'));

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const db = sql(process.env);
      const metadata = paymentIntent.metadata || {};
      if (metadata.product === 'timesyncher_vacation_telegram_collaborator' && metadata.invite_id) {
        const invite = await markCollaboratorInvitePaid(db, {
          inviteId: metadata.invite_id,
          env: process.env,
          metadata: {
            stripeCustomerId: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : paymentIntent.customer?.id || null,
            stripePaymentIntentId: paymentIntent.id,
            paidVia: 'stripe_payment_element',
          },
        });
        const token = metadata.invite_token || '';
        const email = token ? await queueOrSendCollaboratorInviteEmail(db, {
          invite,
          token,
          contact: {
            email: paymentIntent.receipt_email || metadata.email || '',
            firstName: metadata.first_name || '',
            lastName: metadata.last_name || '',
            displayName: metadata.requested_for || `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim() || '',
          },
        }, process.env) : { status: 'skipped', reason: 'missing invite token' };
        console.log('TimeSyncher collaborator payment succeeded', {
          paymentIntentId: paymentIntent.id,
          inviteId: metadata.invite_id,
          planCode: metadata.plan_code,
          emailStatus: email.status,
        });
        return send(res, 200, { ok: true, received: true, type: event.type });
      }
      if (metadata.product === 'timesyncher_vacation_account_upgrade') {
        const upgrade = accountUpgradeAddOns({
          photoUpload: metadata.photo_memories === 'true',
          videoUpload: metadata.video_memories === 'true',
        });
        const purchase = await recordAccountUpgradePurchase({
          db,
          contact: {
            email: paymentIntent.receipt_email || metadata.email || '',
            firstName: metadata.first_name || '',
            lastName: metadata.last_name || '',
          },
          upgrade,
          amountCents: paymentIntent.amount_received || paymentIntent.amount || upgrade.amountCents,
          currency: paymentIntent.currency || 'usd',
          status: 'paid',
          stripeCustomerId: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : paymentIntent.customer?.id || null,
          stripePaymentIntentId: paymentIntent.id,
          metadata: {
            paidVia: 'stripe_payment_element',
            stripePaymentIntentId: paymentIntent.id,
            source: 'account_upgrade_payment_element',
          },
        });
        console.log('TimeSyncher account upgrade payment succeeded', {
          paymentIntentId: paymentIntent.id,
          orderId: purchase.orderId,
          amount: purchase.amountCents,
          currency: purchase.currency,
        });
        return send(res, 200, { ok: true, received: true, type: event.type });
      }
      if (metadata.product === 'timesyncher_vacation_owner_media_addons') {
        const addOns = ownerMediaAddOns({
          mediaScope: metadata.media_scope,
          photoUpload: metadata.photo_memories === 'true',
          videoUpload: metadata.video_memories === 'true',
        });
        const purchase = await recordOwnerMediaPurchase({
          db,
          contact: {
            email: paymentIntent.receipt_email || metadata.email || '',
            firstName: metadata.first_name || '',
            lastName: metadata.last_name || '',
          },
          addOns,
          amountCents: paymentIntent.amount_received || paymentIntent.amount || addOns.amountCents,
          currency: paymentIntent.currency || 'usd',
          status: 'paid',
          stripeCustomerId: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : paymentIntent.customer?.id || null,
          stripePaymentIntentId: paymentIntent.id,
          metadata: {
            paidVia: 'stripe_payment_element',
            stripePaymentIntentId: paymentIntent.id,
            source: 'owner_media_payment_element',
          },
        });
        console.log('TimeSyncher owner media payment succeeded', {
          paymentIntentId: paymentIntent.id,
          orderId: purchase.orderId,
          amount: purchase.amountCents,
          currency: purchase.currency,
        });
        return send(res, 200, { ok: true, received: true, type: event.type });
      }
      const onboarding = await buildOnboardingFromStripe({ db, stripe, paymentIntent, env: process.env });
      const email = await queueOrSendPurchaseEmail(db, onboarding, process.env);
      console.log('TimeSyncher payment succeeded and onboarding created', {
        paymentIntentId: paymentIntent.id,
        orderId: onboarding.orderId,
        onboardingSessionId: onboarding.session.id,
        amount: onboarding.order.amountCents,
        currency: onboarding.order.currency,
        email: onboarding.contact?.email,
        emailStatus: email.status,
      });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata || {};
      if (metadata.product === 'timesyncher_vacation_telegram_collaborator' && metadata.invite_id) {
        const db = sql(process.env);
        const invite = await markCollaboratorInvitePaid(db, {
          inviteId: metadata.invite_id,
          env: process.env,
          metadata: {
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
            checkoutMode: session.mode || null,
            paidVia: 'stripe_checkout',
          },
        });
        const token = metadata.invite_token || '';
        const email = token ? await queueOrSendCollaboratorInviteEmail(db, {
          invite,
          token,
          contact: {
            email: session.customer_details?.email || session.customer_email || '',
            displayName: session.customer_details?.name || invite.requested_for || '',
          },
        }, process.env) : { status: 'skipped', reason: 'missing invite token' };
        console.log('TimeSyncher collaborator checkout completed', {
          checkoutSessionId: session.id,
          inviteId: metadata.invite_id,
          planCode: metadata.plan_code,
          emailStatus: email.status,
        });
      }
    }

    return send(res, 200, { ok: true, received: true, type: event.type });
  } catch (error) {
    return send(res, 400, { ok: false, error: error.message || 'Webhook handling failed.' });
  }
}
