import crypto from 'node:crypto';

const VK_ADMIN_COOKIE = 'vk_admin';
const MAX_AGE_SEC = 12 * 60 * 60;
const VK_ADMIN_DEFAULT_ALLOWED_HOSTS = ['vacation-staging.timesyncher.com'];

function hostFromRequest(req) {
  return String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .split(',')[0]
    .trim();
}

function hostnameOnly(host) {
  const raw = String(host || '').trim();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return (end === -1 ? raw : raw.slice(1, end)).toLowerCase();
  }
  const i = raw.lastIndexOf(':');
  if (i > -1 && /^\d+$/.test(raw.slice(i + 1))) return raw.slice(0, i).toLowerCase();
  return raw.toLowerCase();
}

function vkAdminExtraAllowedHosts(env = process.env) {
  const list = String(env.VK_ADMIN_ALLOWED_HOSTS || '')
    .split(',')
    .map((part) => hostnameOnly(part.trim()))
    .filter(Boolean);
  return list;
}

export function isVkAdminAllowedHost(req, env = process.env) {
  const host = hostnameOnly(hostFromRequest(req));
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (VK_ADMIN_DEFAULT_ALLOWED_HOSTS.includes(host)) return true;
  return vkAdminExtraAllowedHosts(env).includes(host);
}

export function vkAdminRequestHostname(req) {
  return hostnameOnly(hostFromRequest(req));
}

export function isVkAdminStagingHost(req) {
  return vkAdminRequestHostname(req) === 'vacation-staging.timesyncher.com';
}

function adminKeys(env) {
  const login = String(env.VK_ADMIN_LOGIN || '');
  const secret = String(env.VK_ADMIN_SESSION_SECRET || '');
  return login && secret ? { login, secret } : null;
}

export function vkAdminConfigured(env = process.env) {
  return Boolean(adminKeys(env));
}

function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function sameText(a, b) {
  const left = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const right = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function decodeSession(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !sameText(sig, sign(body, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload?.role !== 'admin' || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    const opened = Array.isArray(payload.opened) ? payload.opened.filter((id) => typeof id === 'string') : [];
    return { role: 'admin', exp: payload.exp, opened };
  } catch {
    return null;
  }
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function readVkAdminSession(req, env) {
  const keys = adminKeys(env);
  if (!keys) return null;
  return decodeSession(readCookie(req.headers?.cookie, VK_ADMIN_COOKIE), keys.secret);
}

export function loginMatches(login, env = process.env) {
  const keys = adminKeys(env);
  return Boolean(keys && login && sameText(login, keys.login));
}

export function freshVkAdminSession() {
  return { role: 'admin', exp: Date.now() + MAX_AGE_SEC * 1000, opened: [] };
}

function refuse(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ ok: false, ...body }));
  return null;
}

export function requireVkAdmin(req, res, env = process.env) {
  if (!isVkAdminAllowedHost(req, env)) return refuse(res, 404, { error: 'not found' });
  if (!vkAdminConfigured(env)) return refuse(res, 503, { error: 'Admin sign-in is not configured.', code: 'admin_not_configured' });
  return readVkAdminSession(req, env) || refuse(res, 401, { error: 'Admin sign-in required.', code: 'admin_required' });
}

export function writeVkAdminSession(res, req, session, env = process.env) {
  const keys = adminKeys(env);
  if (!keys) throw new Error('admin session is not configured');
  const body = Buffer.from(JSON.stringify({ role: 'admin', exp: session.exp, opened: session.opened || [] })).toString('base64url');
  const secure = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const cookie = [`${VK_ADMIN_COOKIE}=${body}.${sign(body, keys.secret)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${MAX_AGE_SEC}`];
  if (secure) cookie.push('Secure');
  res.setHeader('Set-Cookie', cookie.join('; '));
}
