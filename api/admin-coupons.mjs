import { requireAdminAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { createCheckoutCoupon, listCheckoutCoupons } from '../src/vacation/checkout-coupons.mjs';

export default async function handler(req, res) {
  try {
    requireAdminAuth(req, process.env);
    const db = sql(process.env);
    const url = new URL(req.url || '/', 'https://timesyncher.com');

    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, coupons: await listCheckoutCoupons(db, { limit: url.searchParams.get('limit') || 100 }) });
    }

    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    const action = cleanText(url.searchParams.get('action') || 'create', 40);
    const body = await readJson(req);

    if (action === 'create') {
      const result = await createCheckoutCoupon(db, {
        code: body.code,
        label: body.label,
        expiresAt: body.expiresAt,
        createdBy: body.createdBy || 'openclaw-imac',
        metadata: body.metadata || {},
      }, process.env);
      return sendJson(res, 201, { ok: true, ...result });
    }

    if (action === 'disable') {
      const id = cleanText(body.id, 120);
      if (!id) return sendJson(res, 400, { ok: false, error: 'id is required.' });
      const rows = await db`
        update checkout_coupons
        set status = 'disabled', updated_at = now()
        where id = ${id} and status = 'active'
        returning id, code_hint, label, status, expires_at, redeemed_at, metadata, created_at, updated_at
      `;
      if (!rows[0]) return sendJson(res, 404, { ok: false, error: 'Active coupon not found.' });
      return sendJson(res, 200, { ok: true, coupon: rows[0] });
    }

    return sendJson(res, 400, { ok: false, error: 'Unsupported coupon admin action.' });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to manage coupons.' });
  }
}
