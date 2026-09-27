import { sql } from '../src/vacation/db.mjs';
import { readCookie, webAccessCookieName } from '../src/vacation/web-access.mjs';

export function orderPage(slug, title, notice, options = {}) {
  const safeSlug = String(slug || '').replace(/[^a-z0-9-]/gi, '').slice(0, 80);
  const safeTitle = String(title || 'this trip').replace(/[<>&]/g, '');
  const note = notice ? `<p>${String(notice).replace(/[<>&]/g, '')}</p>` : '';
  const ownerSession = options.ownerSession === true;
  const sessionLine = ownerSession
    ? '<p data-keepsake-owner="1" data-owner-session="1">This browser has a trip owner session.</p>'
    : '<p data-keepsake-guest="1" data-owner-session="0">Opened without the trip owner session.</p>';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Order this keepsake</title></head>
<body>
  <h1>Order this keepsake</h1>
  <p data-keepsake-buy-link="${safeSlug}">Anyone with this link can order the keepsake for ${safeTitle}. This is not limited to the customer who built the trip.</p>
  ${sessionLine}
  ${note}
</body>
</html>`;
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(html);
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
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('method not allowed');
    return;
  }
  const url = new URL(req.url || '/', 'https://vacation-staging.timesyncher.com');
  const slug = String(url.searchParams.get('slug') || '').trim();
  const ownerSession = Boolean(readCookie(req, webAccessCookieName()));
  if (!slug) return sendHtml(res, 400, orderPage('', 'this trip', 'The keepsake link needs a trip.', { ownerSession }));
  let title = 'this trip';
  try {
    const db = sql();
    const trip = await findTrip(db, slug);
    if (trip?.title) title = trip.title;
  } catch {
    title = 'this trip';
  }
  return sendHtml(res, 200, orderPage(slug, title, '', { ownerSession }));
}
