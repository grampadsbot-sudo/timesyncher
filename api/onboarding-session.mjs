import Stripe from 'stripe';
import { stripeSecretKey } from './_stripe-env.mjs';
import { sql } from '../src/vacation/db.mjs';
import { buildOnboardingFromStripe, getSessionByToken, publicSession } from '../src/vacation/onboarding.mjs';
import { queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';
import { sendJson } from '../src/vacation/http.mjs';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

async function sessionByPaymentIntent(db, paymentIntentId) {
  const rows = await db`
    select onboarding_sessions.*
    from onboarding_sessions
    join paid_orders on paid_orders.id = onboarding_sessions.order_id
    where paid_orders.stripe_payment_intent_id = ${paymentIntentId}
    limit 1
  `;
  return rows[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });

  try {
    const url = new URL(req.url || '/', 'https://timesyncher.com');
    const token = clean(url.searchParams.get('session') || url.searchParams.get('token'), 120);
    const paymentIntentId = clean(url.searchParams.get('payment_intent') || url.searchParams.get('paymentIntent'), 120);
    const db = sql(process.env);

    if (token) {
      const row = await getSessionByToken(db, token);
      if (!row) return sendJson(res, 404, { ok: false, error: 'Onboarding session not found.' });
      return sendJson(res, 200, { ok: true, session: publicSession(row, process.env) });
    }

    if (!paymentIntentId) return sendJson(res, 400, { ok: false, error: 'session or payment_intent is required.' });

    let row = await sessionByPaymentIntent(db, paymentIntentId);
    if (!row) {
      let stripeConfig;
      try {
        stripeConfig = stripeSecretKey(process.env);
      } catch (error) {
        return sendJson(res, 503, { ok: false, error: error.message || 'Stripe secret key is not configured.' });
      }
      const stripe = new Stripe(stripeConfig.key, { apiVersion: '2025-11-17.clover' });
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        return sendJson(res, 409, { ok: false, error: `Payment is ${paymentIntent.status || 'not complete'} yet.` });
      }
      const onboarding = await buildOnboardingFromStripe({ db, stripe, paymentIntent, env: process.env });
      await queueOrSendPurchaseEmail(db, onboarding, process.env);
      row = await getSessionByToken(db, onboarding.token);
    }

    return sendJson(res, 200, { ok: true, session: publicSession(row, process.env) });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to load onboarding session.' });
  }
}
