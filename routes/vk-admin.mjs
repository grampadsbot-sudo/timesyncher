import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  freshVkAdminSession,
  isVkAdminProduction,
  loginMatches,
  requireVkAdmin,
  vkAdminConfigured,
  writeVkAdminSession,
} from '../src/vacation/vk-admin-session.mjs';
import { listVkAdminGroups, presentVkAdminVacation } from '../src/vacation/vk-admin-fixtures.mjs';

const OWNER_SHELL = fileURLToPath(new URL('../vacation-app.html', import.meta.url));
const ADMIN_SCRIPTS = [
  '/vacation-app-request.js',
  '/chat-composer/chat-composer.js',
  '/ts-pic-popup-viewer.js',
  '/vacation-app-ai-import.js',
  '/vk-admin-review.js',
];

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function notFound(res) {
  return send(res, 404, { ok: false, error: 'not found' });
}

function adminPageHtml() {
  const shell = readFileSync(OWNER_SHELL, 'utf8');
  const end = shell.indexOf('</head>');
  if (end === -1) throw new Error('owner shell head missing');
  const head = shell.slice(0, end).replace(/<title>[^<]*<\/title>/, '<title>Vacay Keepsake admin</title>');
  const scripts = ADMIN_SCRIPTS.map((src) => `  <script src="${src}"></script>`).join('\n');
  return `${head}  <meta name="robots" content="noindex" />\n  <link rel="stylesheet" href="/vk-admin-review.css" />\n</head>\n<body>\n  <div id="root"></div>\n${scripts}\n  <script>window.startVkAdminReview(document.getElementById('root'));</script>\n</body>\n</html>\n`;
}

function serveAdminPage(res) {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-robots-tag', 'noindex');
  res.end(adminPageHtml());
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : '';
  if (!text && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    text = Buffer.concat(chunks).toString('utf8');
  }
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function notConfigured(res) {
  return send(res, 503, { ok: false, error: 'Admin sign-in is not configured.', code: 'admin_not_configured' });
}

async function handleSession(req, res, env) {
  if (req.method === 'GET') {
    const session = requireVkAdmin(req, res, env);
    if (!session) return;
    return send(res, 200, { ok: true, role: 'admin', opened: session.opened });
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });
  if (!vkAdminConfigured(env)) return notConfigured(res);
  const body = await readBody(req);
  if (!loginMatches(body.login, env)) return send(res, 401, { ok: false, error: 'Admin sign-in required.', code: 'admin_required' });
  const session = freshVkAdminSession();
  writeVkAdminSession(res, req, session, env);
  return send(res, 200, { ok: true, role: 'admin', opened: session.opened });
}

function handleCustomers(req, res, session) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method not allowed' });
  const groups = listVkAdminGroups();
  const testCustomerCount = groups.filter((g) => g.isTest).reduce((n, g) => n + g.customerCount, 0);
  return send(res, 200, { ok: true, role: 'admin', opened: session.opened, groups, testCustomerCount });
}

function handleCustomer(req, res, env, session, tripId, action) {
  const vacation = presentVkAdminVacation(tripId);
  if (!vacation) return notFound(res);
  if (!action && req.method === 'GET') return send(res, 200, { ok: true, role: 'admin', vacation });
  if (action !== 'open' || req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });
  const opened = session.opened.includes(tripId) ? session.opened : [...session.opened, tripId];
  writeVkAdminSession(res, req, { ...session, opened }, env);
  return send(res, 200, { ok: true, role: 'admin', opened, vacation });
}

function handleClearAll(req, res, env, session) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });
  writeVkAdminSession(res, req, { ...session, opened: [] }, env);
  return send(res, 200, { ok: true, role: 'admin', opened: [] });
}

function adminRequest(req) {
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const page = url.searchParams.get('adminPage') === '1' || String(req.query?.adminPage || '') === '1';
  let parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') parts = parts.slice(1);
  if (parts[0] === 'vacation-app' && parts[1] === 'admin') return { page: true, parts: [] };
  if (parts[0] !== 'admin') return { page, parts: null };
  return { page, parts: parts.slice(1).map((part) => decodeURIComponent(part)) };
}

export default async function handler(req, res) {
  const env = process.env;
  if (isVkAdminProduction(env)) return notFound(res);
  const { page, parts } = adminRequest(req);
  if (page && (!parts || !parts.length)) return serveAdminPage(res);
  if (!parts || !parts.length) return notFound(res);
  const [head, id, action, extra] = parts;
  if (head === 'session' && !id) return handleSession(req, res, env);
  const session = requireVkAdmin(req, res, env);
  if (!session) return;
  if (head === 'customers' && !id) return handleCustomers(req, res, session);
  if (head === 'customers' && id && !extra) return handleCustomer(req, res, env, session, id, action);
  if (head === 'clear-all' && !id) return handleClearAll(req, res, env, session);
  return notFound(res);
}
