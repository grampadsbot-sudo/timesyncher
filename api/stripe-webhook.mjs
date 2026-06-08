import Stripe from 'stripe';
import { stripeSecretKey } from './_stripe-env.mjs';
import { sql } from '../src/vacation/db.mjs';
import { buildOnboardingFromStripe } from '../src/vacation/onboarding.mjs';
import { queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';

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

    return send(res, 200, { ok: true, received: true, type: event.type });
  } catch (error) {
    return send(res, 400, { ok: false, error: error.message || 'Webhook handling failed.' });
  }
}
