import { checkoutConfigHealth } from '../src/vacation/checkout-pricing.mjs';
import { headerValue } from '../src/vacation/http.mjs';

const VERSION_POLL_CACHE_CONTROL = 'public, max-age=15, s-maxage=15, stale-while-revalidate=30';

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  if (!res.getHeader('cache-control')) res.setHeader('cache-control', 'no-store');
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
