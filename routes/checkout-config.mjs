import { CheckoutConfigError, logCheckoutConfig, optionalConfigCents, requiredConfigCents } from '../src/vacation/checkout-pricing.mjs';
import { stripePublishableKey } from '../src/vacation/stripe-env.mjs';

function configuredCents(env, names, missing) {
  const chosen = names.find((name) => optionalConfigCents(env?.[name]) != null);
  if (!chosen) {
    missing.push(names[0]);
    return null;
  }
  try {
    return requiredConfigCents(env[chosen], chosen);
  } catch (error) {
    if (error?.name !== 'CheckoutConfigError') throw error;
    missing.push(error.configName || chosen);
    return null;
  }
}

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
  const priceMissing = [];
  const singleAmount = configuredCents(process.env, ['TIMESYNCHER_BASE_PRICE_CENTS'], priceMissing);
  const photoSingleAmount = configuredCents(process.env, ['TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS', 'TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS'], priceMissing);
  const photoUnlimitedAmount = configuredCents(process.env, ['TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS', 'TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS'], priceMissing);
  if (priceMissing.length) {
    console.error(`checkout config missing: ${priceMissing.join(', ')}`);
    const missing = [...new Set([...checkout.missing, ...priceMissing])];
    return send(res, 503, { ok: false, checkout: { ok: false, missing } });
  }
  return send(res, 200, {
    ok: true,
    checkout,
    mode: stripeConfig.mode,
    publishableKey: stripeConfig.key,
    products: {
      single: {
        name: process.env.TIMESYNCHER_SINGLE_NAME || 'TimeSyncher Vacation - Single',
        description: process.env.TIMESYNCHER_SINGLE_DESCRIPTION || '',
        amount: singleAmount,
      },
      unlimited: {
        name: process.env.TIMESYNCHER_UNLIMITED_NAME || 'TimeSyncher Vacation - Unlimited',
        description: process.env.TIMESYNCHER_UNLIMITED_DESCRIPTION || '',
        amount: optionalConfigCents(process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS),
      },
      photoMemories: {
        single: {
          name: process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_NAME || 'Photo Memories Keepsake - Single Vacation',
          description: process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_DESCRIPTION || 'Add up to 100 favorite photos to this vacation keepsake.',
          amount: photoSingleAmount,
          photoLimit: Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_LIMIT || process.env.TIMESYNCHER_PHOTO_MEMORIES_LIMIT || '100', 10),
        },
        unlimited: {
          name: process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_NAME || 'Photo Memories Keepsake - Unlimited Vacations',
          description: process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_DESCRIPTION || 'Add favorite photos to unlimited vacation keepsakes.',
          amount: photoUnlimitedAmount,
          photoLimit: Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_LIMIT || process.env.TIMESYNCHER_PHOTO_MEMORIES_LIMIT || '100', 10),
        },
      },
      collaborator: {
        single: optionalConfigCents(process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS),
        unlimited: optionalConfigCents(process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS),
        videoUnlimited: optionalConfigCents(process.env.TIMESYNCHER_COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS),
      },
    },
  });
}
