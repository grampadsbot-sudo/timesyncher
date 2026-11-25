// Signed httpOnly VK admin session (preview / local / staging only).
// Credential names: VK_ADMIN_LOGIN, VK_ADMIN_SESSION_SECRET — never log values.

import crypto from 'node:crypto';

export const VK_ADMIN_COOKIE = 'vk_admin';
const MAX_AGE_SEC = 12 * 60 * 60;

export function isVkAdminProduction(env = process.env) {
  return String(env.VERCEL_ENV || '').trim() === 'production';
}

function secrets(env = process.env) {
  const login = String(env.VK_ADMIN_LOGIN || '');
  const secret = String(env.VK_ADMIN_SESSION_SECRET || '');
  if (!login || !secret) return null;
  return { login, secret };
}

function sameSecret(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function encode(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function decode(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.role !== 'admin') return null;
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    const opened = Array.isArray(payload.opened) ? payload.opened.filter((id) => typeof id === 'string') : [];
    const sid = typeof payload.sid === 'string' ? payload.sid : '';
    return { role: 'admin', exp: payload.exp, opened, sid };
  } catch {
    return null;
  }
}

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return '';
      }
    }
  }
  return '';
}

function secureRequest(req) {
  return String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

export function vkAdminConfigured(env = process.env) {
  return Boolean(secrets(env));
}

export function readVkAdminSession(req, env = process.env) {
  const keys = secrets(env);
  if (!keys) return null;
  return decode(readCookie(req.headers?.cookie, VK_ADMIN_COOKIE), keys.secret);
}

export function loginMatches(login, env = process.env) {
  const keys = secrets(env);
  if (!keys) return false;
  return sameSecret(login, keys.login);
}

function sessionCookie(session, req, env = process.env) {
  const keys = secrets(env);
  if (!keys) throw new Error('admin session is not configured');
  const token = encode(
    { role: 'admin', exp: session.exp, opened: session.opened || [], sid: session.sid || '' },
    keys.secret,
  );
  const parts = [
    `${VK_ADMIN_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

export function freshVkAdminSession() {
  return { role: 'admin', exp: Date.now() + MAX_AGE_SEC * 1000, opened: [], sid: crypto.randomUUID() };
}

export function refuseVkAdminProduction(res, env = process.env) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (!isVkAdminProduction(env)) return false;
  if (typeof res.status === 'function') return res.status(404).json({ error: 'not found' });
  res.statusCode = 404;
  res.setHeader?.('content-type', 'application/json; charset=utf-8');
  res.end?.(JSON.stringify({ error: 'not found' }));
  return true;
}

export function requireVkAdmin(req, res, env = process.env) {
  if (refuseVkAdminProduction(res, env)) return null;
  if (!vkAdminConfigured(env)) {
    if (typeof res.status === 'function') {
      res.status(503).json({ error: 'Admin sign-in is not configured.', code: 'admin_not_configured' });
      return null;
    }
    res.statusCode = 503;
    res.setHeader?.('content-type', 'application/json; charset=utf-8');
    res.end?.(JSON.stringify({ error: 'Admin sign-in is not configured.', code: 'admin_not_configured' }));
    return null;
  }
  const session = readVkAdminSession(req, env);
  if (!session) {
    if (typeof res.status === 'function') {
      res.status(401).json({ error: 'Admin sign-in required.', code: 'admin_required' });
      return null;
    }
    res.statusCode = 401;
    res.setHeader?.('content-type', 'application/json; charset=utf-8');
    res.end?.(JSON.stringify({ error: 'Admin sign-in required.', code: 'admin_required' }));
    return null;
  }
  return session;
}

export function writeVkAdminSession(res, req, session, env = process.env) {
  const cookie = sessionCookie(session, req, env);
  res.setHeader?.('Set-Cookie', cookie);
  res.setHeader?.('Cache-Control', 'no-store');
}