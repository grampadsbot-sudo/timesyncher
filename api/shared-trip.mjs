import { cleanText, headerValue, sendJson } from '../src/vacation/http.mjs';
import { TREK_SHARED_API_BASE, mergeBindingsIntoShared } from '../src/vacation/thing-media-bind.mjs';
import { listBindings } from '../src/vacation/thing-media-store.mjs';

const TREK_PUBLIC = (process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || TREK_SHARED_API_BASE).replace(/\/+$/, '');

function trekPathFromReq(req) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const fromQuery = url.searchParams.get('trekPath');
  if (fromQuery) return fromQuery.replace(/^\/+/, '');
  return url.pathname.replace(/^\/api\/shared-trip\/?/, '').replace(/^\/api\/shared\/?/, '');
}

function shareTokenFromTrekPath(trekPath = '') {
  const first = String(trekPath || '').split('/')[0] || '';
  try {
    return decodeURIComponent(first).trim();
  } catch {
    return first.trim();
  }
}

function isSharedTripGet(method, trekPath) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const rest = String(trekPath || '').split('/').slice(1).filter(Boolean).join('/');
  return !rest || rest === '';
}

export default async function handler(req, res) {
  const trekPath = trekPathFromReq(req);
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const incomingQuery = new URLSearchParams(url.search);
  incomingQuery.delete('trekPath');
  const dest = `${TREK_PUBLIC}/api/shared/${trekPath}${incomingQuery.toString() ? `?${incomingQuery}` : ''}`;

  const headers = {};
  for (const name of ['accept', 'content-type', 'cookie', 'authorization']) {
    const value = headerValue(req, name);
    if (value) headers[name] = value;
  }

  const chunks = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) chunks.push(chunk);
  }

  const upstream = await fetch(dest, {
    method: req.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });

  const contentType = upstream.headers.get('content-type') || '';
  res.statusCode = upstream.status;
  res.setHeader('cache-control', 'no-store');
  if (contentType) res.setHeader('content-type', contentType);

  if (!isSharedTripGet(req.method, trekPath) || !contentType.includes('application/json')) {
    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
    return;
  }

  const shared = await upstream.json().catch(() => null);
  if (!shared || typeof shared !== 'object') {
    return sendJson(res, upstream.status, shared || { ok: false, error: 'Upstream shared trip failed.' });
  }

  const shareToken = shareTokenFromTrekPath(trekPath);
  const bindings = shareToken ? await listBindings(shareToken, process.env) : [];
  const merged = mergeBindingsIntoShared(shared, bindings);
  merged.timesyncherMediaBind = {
    count: bindings.length,
    source: '/api/bind-thing-media',
    journeyBookPath: `/shared/${encodeURIComponent(shareToken)}/journey`,
  };
  return sendJson(res, 200, merged);
}

export { cleanText };
