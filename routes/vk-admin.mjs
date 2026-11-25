import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  freshVkAdminSession,
  isVkAdminProduction,
  loginMatches,
  readVkAdminSession,
  refuseVkAdminProduction,
  requireVkAdmin,
  vkAdminConfigured,
  writeVkAdminSession,
} from '../src/vacation/vk-admin-session.mjs';
import {
  listVkAdminGroups,
  presentVkAdminVacation,
} from '../src/vacation/vk-admin-fixtures.mjs';

const ADMIN_HTML = fileURLToPath(new URL('../vacation-app-admin.html', import.meta.url));

function readBody(req) {
  const body = req.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  return {};
}

function shimJson(res) {
  if (typeof res.status === 'function') return res;
  return {
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      if (!res.getHeader?.('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    },
    setHeader(name, value) {
      res.setHeader(name, value);
    },
  };
}

function adminParts(req) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  let parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') parts = parts.slice(1);
  if (parts[0] !== 'admin') return null;
  return parts.slice(1);
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(html);
}

function serveAdminPage(req, res, env = process.env) {
  if (isVkAdminProductionPage(req, res, env)) return;
  sendHtml(res, 200, readFileSync(ADMIN_HTML, 'utf8'));
}

function isVkAdminProductionPage(req, res, env = process.env) {
  if (!isVkAdminProduction(env)) return false;
  res.statusCode = 404;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('not found');
  return true;
}

async function handleSession(req, res, env) {
  const json = shimJson(res);
  if (refuseVkAdminProduction(json, env)) return;
  if (req.method === 'GET') {
    const session = requireVkAdmin(req, json, env);
    if (!session) return;
    return json.status(200).json({ role: 'admin', opened: session.opened });
  }
  if (req.method === 'POST') {
    if (!vkAdminConfigured(env)) {
      return json.status(503).json({ error: 'Admin sign-in is not configured.', code: 'admin_not_configured' });
    }
    const body = readBody(req);
    if (!loginMatches(body.login, env)) {
      return json.status(401).json({ error: 'Admin sign-in required.', code: 'admin_required' });
    }
    const existing = readVkAdminSession(req, env);
    const session = existing || freshVkAdminSession();
    writeVkAdminSession(json, req, session, env);
    return json.status(200).json({ role: 'admin', opened: session.opened });
  }
  return json.status(405).json({ error: 'method not allowed' });
}

async function handleCustomers(req, res, env) {
  const json = shimJson(res);
  const session = requireVkAdmin(req, json, env);
  if (!session) return;
  if (req.method !== 'GET') return json.status(405).json({ error: 'method not allowed' });
  const groups = listVkAdminGroups();
  return json.status(200).json({
    role: 'admin',
    opened: session.opened,
    groups,
    testCustomerCount: groups.filter((g) => g.isTest).reduce((n, g) => n + g.customerCount, 0),
  });
}

async function handleCustomerDetail(req, res, env, tripId) {
  const json = shimJson(res);
  const session = requireVkAdmin(req, json, env);
  if (!session) return;
  if (req.method !== 'GET') return json.status(405).json({ error: 'method not allowed' });
  const vacation = presentVkAdminVacation(tripId);
  if (!vacation) return json.status(404).json({ error: 'not found' });
  return json.status(200).json({ role: 'admin', vacation });
}

async function handleOpen(req, res, env, tripId) {
  const json = shimJson(res);
  const session = requireVkAdmin(req, json, env);
  if (!session) return;
  if (req.method !== 'POST') return json.status(405).json({ error: 'method not allowed' });
  const vacation = presentVkAdminVacation(tripId);
  if (!vacation) return json.status(404).json({ error: 'not found' });
  const opened = session.opened.includes(tripId) ? session.opened : [...session.opened, tripId];
  const next = { ...session, opened };
  writeVkAdminSession(json, req, next, env);
  const full = presentVkAdminVacation(tripId);
  return json.status(200).json({ role: 'admin', opened, vacation: full });
}

async function handleClearAll(req, res, env) {
  const json = shimJson(res);
  const session = requireVkAdmin(req, json, env);
  if (!session) return;
  if (req.method !== 'POST') return json.status(405).json({ error: 'method not allowed' });
  const next = { ...session, opened: [] };
  writeVkAdminSession(json, req, next, env);
  return json.status(200).json({ role: 'admin', opened: [] });
}

export default async function handler(req, res) {
  const env = process.env;
  if (req.query?.adminPage === '1' || req.query?.adminPage === 1) {
    return serveAdminPage(req, res, env);
  }
  const parts = adminParts(req);
  if (!parts) {
    const json = shimJson(res);
    return json.status(404).json({ error: 'not found' });
  }
  if (!parts.length) {
    const json = shimJson(res);
    if (refuseVkAdminProduction(json, env)) return;
    return json.status(404).json({ error: 'not found' });
  }
  const [head, id, action] = parts;
  if (head === 'session') return handleSession(req, res, env);
  if (head === 'customers' && !id) return handleCustomers(req, res, env);
  if (head === 'customers' && id && !action) return handleCustomerDetail(req, res, env, decodeURIComponent(id));
  if (head === 'customers' && id && action === 'open') return handleOpen(req, res, env, decodeURIComponent(id));
  if (head === 'clear-all') return handleClearAll(req, res, env);
  const json = shimJson(res);
  return json.status(404).json({ error: 'not found' });
}