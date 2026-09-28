import { readCookie, webAccessCookieName } from '../src/vacation/web-access.mjs';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import { productStyleOneViewUrl, productStyleTwoViewUrl } from '../src/vacation/keepsake-style2-handler.mjs';

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function cleanKeepsakeSlug(slug) {
  const value = String(slug || '').trim();
  if (!value || value.length > 180) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(value)) return '';
  return value;
}

function layoutUrl(kind, slug) {
  const build = kind === 2 ? productStyleTwoViewUrl : productStyleOneViewUrl;
  return build({ shareToken: slug, origin: '' });
}

function layoutFrame(kind, slug) {
  const src = esc(layoutUrl(kind, slug));
  return `<h2>Layout ${kind}</h2>
  <iframe data-keepsake-layout="${kind}" title="Layout ${kind}" src="${src}"></iframe>`;
}

export function orderErrorPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Keepsake link is not valid</title>
<style>
  body { margin: 0; background: #9f1239; color: #fff; font: 700 20px/1.4 sans-serif; }
  main { max-width: 40rem; margin: 12vh auto; padding: 24px; }
  h1 { font-size: 2.5rem; margin: 0 0 12px; }
</style>
</head>
<body data-keepsake-error="invalid">
<main>
  <h1>This keepsake link is not valid</h1>
  <p data-keepsake-error="1">This link does not match a trip keepsake. There is nothing to order.</p>
</main>
</body>
</html>`;
}

export function orderPage(slug, title, notice, options = {}) {
  const safeSlug = cleanKeepsakeSlug(slug);
  const safeTitle = esc(title || 'this trip');
  const note = notice ? `<p>${esc(notice)}</p>` : '';
  const ownerSession = options.ownerSession === true;
  const sessionLine = ownerSession
    ? '<p data-keepsake-owner="1" data-owner-session="1">This browser has a trip owner session.</p>'
    : '<p data-keepsake-guest="1" data-owner-session="0">Opened without the trip owner session.</p>';
  const layouts = safeSlug
    ? `<section data-keepsake-layouts="1">${layoutFrame(1, safeSlug)}${layoutFrame(2, safeSlug)}</section>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Order Keepsakes</title>
<style>
  body { margin: 0; color: #1c1917; background: #faf7f2; font: 16px/1.45 sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 24px; }
  iframe { width: 100%; height: 80vh; border: 1px solid #d6d3d1; background: #fff; }
  .later { padding: 12px 14px; background: #fff; border: 1px solid #d6d3d1; }
</style>
</head>
<body>
<main>
  <h1>Order Keepsakes</h1>
  <p data-keepsake-buy-link="${esc(safeSlug)}">Anyone with this link can order the keepsake for ${safeTitle}. This is not limited to the customer who built the trip.</p>
  ${sessionLine}
  <p class="later" data-payment-later="1">Payment coming later.</p>
  ${layouts}
  ${note}
</main>
</body>
</html>`;
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(html);
}

async function invoke(handler, req) {
  const headers = {};
  let payload = '';
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return headers[String(name).toLowerCase()]; },
    end(body) { payload = body == null ? '' : String(body); },
  };
  await handler(req, res);
  return { status: res.statusCode, body: payload };
}

export function keepsakeFromShared(data) {
  if (!data || typeof data !== 'object' || data.error || data.ok === false) return null;
  const trip = data.trip;
  if (!trip || typeof trip !== 'object') return null;
  const title = String(trip.title || '').trim();
  if (!title && trip.id == null) return null;
  return { title: title || 'this trip' };
}

export async function lookupKeepsake(slug) {
  try {
    const result = await invoke(sharedTripHandler, {
      method: 'GET',
      url: `/api/shared/${encodeURIComponent(slug)}`,
      headers: {},
    });
    if (result.status !== 200) return null;
    return keepsakeFromShared(JSON.parse(result.body));
  } catch {
    return null;
  }
}

export async function handleKeepsakeOrder(req, res, deps = {}) {
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('method not allowed');
    return;
  }
  const url = new URL(req.url || '/', 'https://vacation-staging.timesyncher.com');
  const slug = cleanKeepsakeSlug(url.searchParams.get('slug') || '');
  const ownerSession = Boolean(readCookie(req, webAccessCookieName()));
  if (!slug) return sendHtml(res, 400, orderErrorPage());
  const lookup = deps.lookup || lookupKeepsake;
  let trip = null;
  try {
    trip = await lookup(slug);
  } catch {
    trip = null;
  }
  if (!trip) return sendHtml(res, 404, orderErrorPage());
  return sendHtml(res, 200, orderPage(slug, trip.title || 'this trip', '', { ownerSession }));
}

export default function handler(req, res) {
  return handleKeepsakeOrder(req, res);
}
