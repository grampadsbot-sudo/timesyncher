import { logCheckoutConfig, requiredConfigCents, requiredConfigText } from '../src/vacation/checkout-pricing.mjs';
import { stripePublishableKey } from '../src/vacation/stripe-env.mjs';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2) + '\n');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method not allowed' });
  let stripeConfig;
  try {
    stripeConfig = stripePublishableKey(process.env);
  } catch (error) {
    return send(res, 503, { ok: false, error: error.message || 'Stripe publishable key is not configured yet.' });
  }
  const checkout = logCheckoutConfig(process.env);
  if (!checkout.ok) return send(res, 503, { ok: false, checkout });
  const base = requiredConfigCents(process.env.TIMESYNCHER_BASE_PRICE_CENTS, 'TIMESYNCHER_BASE_PRICE_CENTS');
  const bump = requiredConfigCents(process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS, 'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS');
  const collaborate = requiredConfigCents(process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS, 'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS');
  const media = requiredConfigCents(process.env.TIMESYNCHER_MEDIA_PRICE_CENTS, 'TIMESYNCHER_MEDIA_PRICE_CENTS');
  return send(res, 200, {
    ok: true,
    checkout,
    mode: stripeConfig.mode,
    publishableKey: stripeConfig.key,
    products: {
      single: {
        plan: 'single',
        name: requiredConfigText(process.env.TIMESYNCHER_SINGLE_NAME, 'TIMESYNCHER_SINGLE_NAME'),
        description: process.env.TIMESYNCHER_SINGLE_DESCRIPTION || '',
        amount: base,
      },
      unlimited: {
        plan: 'unlimited',
        name: requiredConfigText(process.env.TIMESYNCHER_UNLIMITED_NAME, 'TIMESYNCHER_UNLIMITED_NAME'),
        description: process.env.TIMESYNCHER_UNLIMITED_DESCRIPTION || '',
        amount: bump,
        totalAmount: base + bump,
      },
      collaborate: {
        plan: 'telegram_collaborators_single_trip',
        name: requiredConfigText(process.env.TIMESYNCHER_COLLABORATOR_NAME, 'TIMESYNCHER_COLLABORATOR_NAME'),
        description: process.env.TIMESYNCHER_COLLABORATOR_DESCRIPTION || '',
        amount: collaborate,
        perVacation: true,
      },
      media: {
        plan: 'owner_media',
        name: requiredConfigText(process.env.TIMESYNCHER_MEDIA_NAME, 'TIMESYNCHER_MEDIA_NAME'),
        description: process.env.TIMESYNCHER_MEDIA_DESCRIPTION || '',
        amount: media,
      },
    },
  });
}
