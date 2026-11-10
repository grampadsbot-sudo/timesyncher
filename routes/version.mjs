import { checkoutConfigHealth } from '../src/vacation/checkout-pricing.mjs';
import { headerValue, responseHeader } from '../src/vacation/http.mjs';

const VERSION_POLL_CACHE_CONTROL = 'public, max-age=15, s-maxage=15, stale-while-revalidate=30';

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  if (!responseHeader(res, 'cache-control')) res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function buildSha(env = process.env) {
  return String(env.VERCEL_GIT_COMMIT_SHA || env.TIMESYNCHER_BUILD_SHA || '').trim().toLowerCase();
}

export function visibleBuildFooter(sha) {
  const value = String(sha || '').trim().toLowerCase();
  if (!/^[0-9a-f]{7,}$/.test(value)) {
    throw new Error(`timesyncher build SHA is missing: ${JSON.stringify(sha)}`);
  }
  return `<footer data-build-stamp="1">${value.slice(0, 7)}</footer>`;
}

export const BUILD_STAMP_CUSTOMER_HIDE_CSS = '/ts-build-stamp-customer-hide.css';
export const BUILD_STAMP_CUSTOMER_HIDE_JS = '/ts-build-stamp-customer-hide.js';

export const BUILD_STAMP_INLINE_STYLE =
  '<style id="timesyncher-build-stamp-style">footer[data-build-stamp="1"]{visibility:hidden!important;position:absolute!important;width:0!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;pointer-events:none!important;}body{padding-bottom:0!important;}html[data-ts-debug-build] footer[data-build-stamp="1"]{visibility:visible!important;position:fixed!important;bottom:0;left:0;right:0;width:auto!important;height:auto!important;overflow:visible!important;clip:auto!important;z-index:10000;margin:0;padding:3px 8px;font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;background:rgba(12,12,12,.78);color:rgba(255,255,255,.9);pointer-events:none;}html[data-ts-debug-build] body{padding-bottom:24px!important;box-sizing:border-box;}</style>';

export function buildStampCustomerHideHeadMarkup() {
  return `<link rel="stylesheet" href="${BUILD_STAMP_CUSTOMER_HIDE_CSS}" />\n<script src="${BUILD_STAMP_CUSTOMER_HIDE_JS}"></script>`;
}

export default function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method not allowed' });
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const poll = url.searchParams.get('poll') === '1';
  const sha = buildSha();
  const etag = `"${sha || 'missing'}"`;
  const ifNoneMatch = headerValue(req, 'if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    res.statusCode = 304;
    res.setHeader('etag', etag);
    res.setHeader('cache-control', VERSION_POLL_CACHE_CONTROL);
    return res.end();
  }
  const body = poll
    ? { ok: true, sha }
    : { ok: true, sha, checkout: checkoutConfigHealth(process.env) };
  return send(res, 200, body, {
    etag,
    'cache-control': poll ? VERSION_POLL_CACHE_CONTROL : 'no-store',
  });
}
