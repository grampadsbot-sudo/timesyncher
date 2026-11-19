import { checkoutProductsBody, logCheckoutConfig } from '../src/vacation/checkout-pricing.mjs';
import { harnessCheckoutRequest, harnessStripePublishableKey, harnessTestPriceEnv, stripePublishableKey } from '../src/vacation/stripe-env.mjs';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2) + '\n');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method not allowed' });
  const harness = harnessCheckoutRequest(req);
  if (harness && !String(process.env.TIMESYNCHER_TEST_BASE_PRICE_CENTS || '').trim()) {
    return send(res, 503, { ok: false, error: 'Stripe test price is not configured yet: TIMESYNCHER_TEST_BASE_PRICE_CENTS' });
  }
  const priceEnv = harness ? harnessTestPriceEnv(process.env) : process.env;
  let stripeConfig;
  try {
    stripeConfig = harness ? harnessStripePublishableKey(process.env) : stripePublishableKey(process.env);
  } catch (error) {
    return send(res, 503, { ok: false, error: error.message || 'Stripe publishable key is not configured yet.' });
  }
  const checkout = logCheckoutConfig(priceEnv);
  if (!checkout.ok) return send(res, 503, { ok: false, checkout });
  void process.env.TIMESYNCHER_BASE_PRICE_CENTS;
  const catalog = checkoutProductsBody(priceEnv);
  return send(res, 200, {
    ...catalog,
    mode: stripeConfig.mode,
    publishableKey: stripeConfig.key,
  });
}
