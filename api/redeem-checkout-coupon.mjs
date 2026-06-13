import { sql } from '../src/vacation/db.mjs';
import { readJson, sendJson } from '../src/vacation/http.mjs';
import { redeemCheckoutCoupon } from '../src/vacation/checkout-coupons.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  try {
    const body = await readJson(req);
    const db = sql(process.env);
    const result = await redeemCheckoutCoupon(db, {
      ...body,
      userAgent: req.headers['user-agent'] || '',
    }, process.env);
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to redeem coupon.' });
  }
}
