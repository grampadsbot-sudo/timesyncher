import adminOnboardings from '../routes/admin-onboardings.mjs';
import checkoutConfig from '../routes/checkout-config.mjs';
import checkoutCoupon from '../routes/checkout-coupon.mjs';
import createPaymentIntent from '../routes/create-payment-intent.mjs';
import eula from '../routes/eula.mjs';
import onboardingSession from '../routes/onboarding-session.mjs';
import stripeWebhook from '../routes/stripe-webhook.mjs';
import trackClick from '../routes/track-click.mjs';
import vacationItinerary from '../routes/vacation-itinerary.mjs';
import vacationRequest from '../routes/vacation-request.mjs';
import vacationTelegramTurn from '../routes/vacation-telegram-turn.mjs';
import version from '../routes/version.mjs';
import workerJobs from '../routes/worker-jobs.mjs';

const handlers = {
  'admin-onboardings': adminOnboardings,
  'checkout-config': checkoutConfig,
  'checkout-coupon': checkoutCoupon,
  'create-payment-intent': createPaymentIntent,
  eula,
  'onboarding-session': onboardingSession,
  'stripe-webhook': stripeWebhook,
  'track-click': trackClick,
  'vacation-itinerary': vacationItinerary,
  'vacation-request': vacationRequest,
  'vacation-telegram-turn': vacationTelegramTurn,
  version,
  'worker-jobs': workerJobs,
  'bind-thing-media': vacationItinerary,
  'vacation-web-access': vacationItinerary,
  pdf: vacationItinerary,
  shared: vacationItinerary,
  'shared-trip': vacationItinerary,
};

function routeParts(req) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  let parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') parts = parts.slice(1);
  if (parts.length === 1 && parts[0] === '[...route]') parts = [];
  if (parts.length) return parts;
  const queryRoute = req.query?.route || req.query?.['...route'] || url.searchParams.get('...route') || url.searchParams.get('route');
  if (Array.isArray(queryRoute)) return queryRoute.map((part) => String(part || '')).filter(Boolean);
  if (queryRoute) return String(queryRoute).split('/').filter(Boolean);
  return [];
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(`${JSON.stringify(body)}\n`);
}

export default async function handler(req, res) {
  const [head] = routeParts(req);
  const fn = handlers[head];
  if (!fn) return sendJson(res, 404, { ok: false, error: 'not found' });
  return fn(req, res);
}
