import { CheckoutConfigError, checkoutProductsBody } from '../src/vacation/checkout-pricing.mjs';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method not allowed' });
  try {
    return send(res, 200, checkoutProductsBody(process.env));
  } catch (error) {
    if (error instanceof CheckoutConfigError) {
      return send(res, 503, { ok: false, error: error.message });
    }
    throw error;
  }
}
