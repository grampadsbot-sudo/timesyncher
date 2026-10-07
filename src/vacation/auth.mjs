import { headerValue } from './http.mjs';

function bearerToken(req) {
  const auth = headerValue(req, 'authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : '';
}

export function requireWorkerAuth(req, env = process.env) {
  const expected = env.TIMESYNCHER_WORKER_TOKEN || '';
  if (!expected) throw Object.assign(new Error('TIMESYNCHER_WORKER_TOKEN is not configured.'), { statusCode: 503 });
  const actual = bearerToken(req) || headerValue(req, 'x-timesyncher-worker-token') || '';
  if (actual !== expected) throw Object.assign(new Error('Unauthorized worker request.'), { statusCode: 401 });
}

export function requireIntakeAuth(req, env = process.env) {
  const expected = env.TIMESYNCHER_INTAKE_TOKEN || '';
  if (!expected) return;
  const actual = bearerToken(req) || headerValue(req, 'x-timesyncher-intake-token') || '';
  if (actual !== expected) throw Object.assign(new Error('Unauthorized intake request.'), { statusCode: 401 });
}

export function requireAdminAuth(req, env = process.env) {
  const expected = env.TIMESYNCHER_ADMIN_TOKEN || '';
  if (!expected) throw Object.assign(new Error('TIMESYNCHER_ADMIN_TOKEN is not configured.'), { statusCode: 503 });
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const actual = bearerToken(req) || headerValue(req, 'x-timesyncher-admin-token') || url.searchParams.get('token') || '';
  if (actual !== expected) throw Object.assign(new Error('Unauthorized admin request.'), { statusCode: 401 });
}

function requestHost(req) {
  return headerValue(req, 'x-forwarded-host') || headerValue(req, 'host') || '';
}

export function stagingMediaBindHost(host = '', env = process.env) {
  const value = String(host || '').split(',')[0].trim().toLowerCase();
  if (env.TIMESYNCHER_MEDIA_BIND_STAGING_OPEN === 'true') return true;
  return /(^|\.)vercel\.app$/.test(value) || /vacation-staging\.timesyncher\.com$/.test(value);
}

export function requireMediaBindAuth(req, env = process.env) {
  const expected = env.TIMESYNCHER_MEDIA_BIND_TOKEN || env.TIMESYNCHER_ADMIN_TOKEN || env.TIMESYNCHER_WORKER_TOKEN || '';
  const actual = bearerToken(req)
    || headerValue(req, 'x-timesyncher-media-bind-token')
    || headerValue(req, 'x-timesyncher-admin-token')
    || headerValue(req, 'x-timesyncher-worker-token')
    || '';
  if (expected) {
    if (actual !== expected) throw Object.assign(new Error('Unauthorized media bind request.'), { statusCode: 401 });
    return { mode: 'token' };
  }
  if (stagingMediaBindHost(requestHost(req), env)) return { mode: 'staging-open' };
  throw Object.assign(new Error('TIMESYNCHER_MEDIA_BIND_TOKEN is not configured.'), { statusCode: 503 });
}
