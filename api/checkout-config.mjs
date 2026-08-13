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
  return send(res, 200, {
    ok: true,
    mode: stripeConfig.mode,
    publishableKey: stripeConfig.key,
    products: {
      single: {
        name: process.env.TIMESYNCHER_SINGLE_NAME || 'TimeSyncher Vacation - Single',
        description: process.env.TIMESYNCHER_SINGLE_DESCRIPTION || '',
        amount: Number.parseInt(process.env.TIMESYNCHER_BASE_PRICE_CENTS || '3700', 10),
      },
      unlimited: {
        name: process.env.TIMESYNCHER_UNLIMITED_NAME || 'TimeSyncher Vacation - Unlimited',
        description: process.env.TIMESYNCHER_UNLIMITED_DESCRIPTION || '',
        amount: Number.parseInt(process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS || '2700', 10),
      },
      photoMemories: {
        single: {
          name: process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_NAME || 'Photo Memories Keepsake - Single Vacation',
          description: process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_DESCRIPTION || 'Add up to 100 favorite photos to this vacation keepsake.',
          amount: Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS || '500', 10),
          photoLimit: Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_LIMIT || process.env.TIMESYNCHER_PHOTO_MEMORIES_LIMIT || '100', 10),
        },
        unlimited: {
          name: process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_NAME || 'Photo Memories Keepsake - Unlimited Vacations',
          description: process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_DESCRIPTION || 'Add favorite photos to unlimited vacation keepsakes.',
          amount: Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS || '500', 10),
          photoLimit: Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_LIMIT || process.env.TIMESYNCHER_PHOTO_MEMORIES_LIMIT || '100', 10),
        },
      },
    },
  });
}
