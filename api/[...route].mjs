import { logCheckoutConfig } from '../src/vacation/checkout-pricing.mjs';
import adminOnboardings from '../routes/admin-onboardings.mjs';

logCheckoutConfig(process.env);
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
import keepsakeOrder from '../routes/keepsake-order.mjs';
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
  'keepsake-order': keepsakeOrder,
  version,
  'worker-jobs': workerJobs,
  'bind-thing-media': vacationItinerary,
  'vacation-web-access': vacationItinerary,
  pdf: vacationItinerary,
  shared: vacationItinerary,
  'shared-trip': vacationItinerary,
};

const ROUTING_QUERY_KEYS = new Set(['route', '...route']);

function routeParts(req) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  let parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') parts = parts.slice(1);
  if (parts.length === 1 && parts[0] === '[...route]') parts = [];
  if (parts.length) return parts;
  const queryRoute = req.query?.route || req.query?.['...route'] || url.searchParams.get('...route') || url.searchParams.get('route');
  if (Array.isArray(queryRoute)) return queryRoute.flatMap((part) => String(part || '').split('/')).filter(Boolean);
  if (queryRoute) return String(queryRoute).split('/').filter(Boolean);
  return [];
}

function publicApiRequest(req) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  let parts = routeParts(req);
  const params = new URLSearchParams(url.search);
  if (req.query && typeof req.query === 'object') {
    for (const [key, value] of Object.entries(req.query)) {
      if (ROUTING_QUERY_KEYS.has(key) || params.has(key)) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (item != null && item !== '') params.append(key, String(item));
      }
    }
  }
  if (parts[0] === 'accept' && parts[1]) {
    let sessionId = parts[1];
    try { sessionId = decodeURIComponent(sessionId); } catch { sessionId = parts[1]; }
    if (!params.get('sessionId')) params.set('sessionId', sessionId);
    if (!params.get('action')) params.set('action', 'accept-page');
    parts = ['eula'];
  }
  for (const key of ROUTING_QUERY_KEYS) params.delete(key);
  const path = `/api/${parts.map((part) => encodeURIComponent(part)).join('/')}`;
  const qs = params.toString();
  req.url = qs ? `${path}?${qs}` : path;
  return { parts, head: parts[0] || '', url: req.url, handler: handlers[parts[0]] ? parts[0] : null };
}

export { publicApiRequest };

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(`${JSON.stringify(body)}\n`);
}

function trekShell(req, res, described) {
  const method = String(req.method || 'GET').toUpperCase();
  if (described.head === 'auth' && described.parts[1] === 'app-config' && method === 'GET') {
    sendJson(res, 200, {
      has_users: true,
      password_login: true,
      oidc_login: false,
      oidc_configured: false,
      demo_mode: false,
      dev_mode: false,
      is_prerelease: false,
      has_maps_key: false,
      require_mfa: false,
      trip_reminders_enabled: false,
      places_photos_enabled: true,
      places_autocomplete_enabled: true,
      places_details_enabled: true,
      available_channels: { email: false },
    });
    return true;
  }
  if (described.head === 'system-notices' && described.parts[1] === 'active' && method === 'GET') {
    sendJson(res, 200, []);
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  const described = publicApiRequest(req);
  if (trekShell(req, res, described)) return undefined;
  const fn = handlers[described.head];
  if (!fn) return sendJson(res, 404, { ok: false, error: 'not found' });
  return fn(req, res);
}
