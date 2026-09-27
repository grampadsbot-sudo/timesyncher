import { sql } from '../src/vacation/db.mjs';

export function orderPage(slug, title, notice) {
  const safeSlug = String(slug || '').replace(/[^a-z0-9-]/gi, '').slice(0, 80);
  const safeTitle = String(title || 'this trip').replace(/[<>&]/g, '');
  const note = notice ? `<p>${String(notice).replace(/[<>&]/g, '')}</p>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Order this keepsake</title></head>
<body>
  <h1>Order this keepsake</h1>
  <p data-keepsake-buy-link="${safeSlug}">Anyone with this link can order the keepsake for ${safeTitle}. This is not limited to the customer who built the trip.</p>
  <p data-keepsake-guest="1">Opened without the trip owner session.</p>
  ${note}
  <form method="post" action="/api/keepsake-order" data-keepsake-order-action="1">
    <input type="hidden" name="slug" value="${safeSlug}">
    <label>Name <input name="buyerName" required></label>
    <label>Email <input name="email" type="email" required></label>
    <label>Style
      <select name="style">
        <option value="1">Layout 1</option>
        <option value="2">Layout 2</option>
      </select>
    </label>
    <button type="submit">Place keepsake order</button>
  </form>
</body>
</html>`;
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(html);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  if (raw.trim().startsWith('{')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

async function findTrip(db, slug) {
  const rows = await db`
    select id, title, metadata
    from trips
    where metadata->>'sharedToken' = ${slug}
       or metadata->>'shareToken' = ${slug}
       or metadata->>'publicSlug' = ${slug}
       or metadata->>'slug' = ${slug}
    limit 1
  `;
  return rows[0] || null;
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'https://vacation-staging.timesyncher.com');
  const body = req.method === 'POST' ? await readBody(req) : {};
  const slug = String(body.slug || url.searchParams.get('slug') || '').trim();
  if (!slug) return sendHtml(res, 400, orderPage('', 'this trip', 'The keepsake link needs a trip.'));
  let title = 'this trip';
  try {
    const db = sql();
    const trip = await findTrip(db, slug);
    if (trip?.title) title = trip.title;
    if (req.method === 'POST') {
      if (!trip) return sendHtml(res, 404, orderPage(slug, title, 'That trip link was not found.'));
      const order = {
        buyerName: String(body.buyerName || '').slice(0, 120),
        email: String(body.email || '').slice(0, 180),
        style: String(body.style || '1').slice(0, 8),
        at: new Date().toISOString(),
      };
      if (!order.buyerName || !order.email) return sendHtml(res, 400, orderPage(slug, title, 'Name and email are required.'));
      const prior = Array.isArray(trip.metadata?.keepsakeOrders) ? trip.metadata.keepsakeOrders : [];
      await db`
        update trips
        set metadata = coalesce(metadata, '{}'::jsonb) || ${{ keepsakeOrders: [...prior, order] }},
            updated_at = now()
        where id = ${trip.id}
      `;
      return sendHtml(res, 200, orderPage(slug, title, 'Order received. Anyone with this link can order.'));
    }
  } catch {
    title = 'this trip';
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    res.end('method not allowed');
    return;
  }
  return sendHtml(res, 200, orderPage(slug, title, ''));
}
