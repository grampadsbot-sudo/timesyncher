import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  freshVkAdminSession,
  isVkAdminAllowedHost,
  loginMatches,
  requireVkAdmin,
  vkAdminConfigured,
  writeVkAdminSession,
} from '../src/vacation/vk-admin-session.mjs';
import { findVkAdminVacation, vkAdminDatabase, vkAdminGroups, vkAdminLegacyNoteSources, vkAdminMember } from '../src/vacation/vk-admin-review-data.mjs';
import { feedbackRollupRows } from '../src/vacation/vk-admin-feedback.mjs';
import {
  artifactType, listNotes, listReviewArtifacts, loadFeedbackArtifact, loadNoteFile, loadReviewArtifact,
  noteFromBody, notesPath, presentNote, saveFeedbackArtifact, saveReviewArtifact, saveReviewResults, saveWelcome,
  vkAdminStorage,
} from '../src/vacation/vk-admin-review-storage.mjs';

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

async function handleCustomers(req, res, session, db) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method not allowed' });
  const groups = await vkAdminGroups(db);
  const testCustomerCount = new Set(groups.filter((g) => g.isTest).flatMap((g) => g.customers.map((member) => member.id))).size;
  return send(res, 200, { ok: true, role: 'admin', opened: session.opened, groups, testCustomerCount });
}

async function handleCustomer(req, res, env, session, tripId, action, db, getStore) {
  if ((!action && req.method !== 'GET') || (action && (action !== 'open' || req.method !== 'POST'))) return methodNotAllowed(res);
  const vacation = await findVkAdminVacation(db, tripId, { detail: true });
  if (!vacation) return notFound(res);
  if (!action && req.method === 'GET') return send(res, 200, { ok: true, role: 'admin', vacation });
  const customerId = new URL(req.url, 'http://localhost').searchParams.get('customerId');
  const member = vkAdminMember(vacation, customerId);
  if (!member) return notFound(res);
  await saveWelcome(getStore(), member, vacation);
  const opened = [...new Set([...session.opened, tripId])].slice(-40);
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

function methodNotAllowed(res) {
  return send(res, 405, { ok: false, error: 'method not allowed' });
}

function sendFile(res, body, type, filename) {
  res.statusCode = 200;
  res.setHeader('content-type', type);
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  if (filename) res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  res.end(body);
}

function jsonRequest(req) {
  return String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase() === 'application/json';
}

async function handleNotes(req, res, db, getStore, [id, index]) {
  if (req.method !== 'GET' && (req.method !== 'POST' || id)) return methodNotAllowed(res);
  if (req.method === 'POST' && !jsonRequest(req)) return send(res, 415, { ok: false, error: 'JSON required' });
  const params = new URL(req.url, 'http://localhost').searchParams;
  const body = req.method === 'POST' ? await readBody(req) : null;
  const vacationId = body ? body.vacationId ?? body.customer : params.get('vacationId') ?? params.get('customer');
  const customerId = body ? body.customerId ?? null : params.get('customerId');
  if (!body && vacationId === null && customerId === null) {
    const store = getStore();
    if (!id) return send(res, 200, { ok: true, notes: await listNotes(store, null, null, []) });
    const file = await loadNoteFile(store, null, null, false, id, index);
    return file ? sendFile(res, file, 'application/octet-stream') : notFound(res);
  }
  if (typeof vacationId !== 'string' || (customerId !== null && typeof customerId !== 'string')) return notFound(res);
  const vacation = await findVkAdminVacation(db, vacationId);
  const member = vacation && vkAdminMember(vacation, customerId);
  if (!member) return notFound(res);
  const store = getStore();
  if (id) {
    const legacy = vacation.customers[0]?.id === member.id;
    const file = await loadNoteFile(store, member.id, vacationId, legacy, id, index, member.recordId);
    return file ? sendFile(res, file, 'application/octet-stream') : notFound(res);
  }
  if (!body) {
    const legacySources = await vkAdminLegacyNoteSources(db, vacation, member);
    return send(res, 200, { ok: true, notes: await listNotes(store, member.id, vacationId, legacySources) });
  }
  const note = noteFromBody(body, vacationId);
  if (!note) return send(res, 400, { ok: false, error: 'Add a message or files. The combined upload limit is 3 MB.' });
  await saveWelcome(store, member, vacation);
  await store.putJson(`${notesPath(member.id, vacationId)}/${note.id}.json`, note);
  return send(res, 201, { ok: true, note: presentNote(note) });
}

async function handleArtifacts(req, res, db, getStore, tripId, artifact) {
  const type = artifact ? artifactType(artifact) : '';
  const review = artifact === 'review' && req.method === 'PUT';
  const feedback = artifact === 'feedback';
  if (artifact && !type && !review && !feedback) return notFound(res);
  const vacation = await findVkAdminVacation(db, tripId);
  if (!vacation) return notFound(res);
  if (req.method === 'GET') {
    const store = getStore();
    if (!artifact) return send(res, 200, { ok: true, ...await listReviewArtifacts(store, tripId) });
    if (feedback) {
      const payload = await loadFeedbackArtifact(store, tripId);
      return payload ? send(res, 200, { ok: true, feedback: payload }) : notFound(res);
    }
    const file = await loadReviewArtifact(store, tripId, artifact);
    return file ? sendFile(res, file, type, type === 'application/pdf' ? `${artifact.slice(0, -4)}.pdf` : '') : notFound(res);
  }
  if (req.method !== 'PUT' || !artifact) return methodNotAllowed(res);
  if (!vacation.isTest && artifact !== 'dialog-pdf' && artifact !== 'feedback') {
    return send(res, 403, { ok: false, error: 'captures require a test vacation' });
  }
  if (!jsonRequest(req)) return send(res, 415, { ok: false, error: 'JSON required' });
  const body = await readBody(req);
  const store = getStore();
  const saved = review ? await saveReviewResults(store, tripId, body)
    : feedback ? await saveFeedbackArtifact(store, tripId, body)
      : await saveReviewArtifact(store, tripId, artifact, body.data);
  if (!saved) return send(res, 400, { ok: false, error: 'invalid artifact' });
  return send(res, 200, { ok: true });
}

async function handleFeedbackRollup(req, res, db, getStore) {
  if (req.method !== 'GET') return methodNotAllowed(res);
  const groups = await vkAdminGroups(db);
  const store = getStore();
  const entries = [];
  for (const group of groups) {
    const feedback = await loadFeedbackArtifact(store, group.tripId);
    if (!feedback) continue;
    entries.push({
      tripId: group.tripId,
      customerLabel: group.label,
      destination: group.destination,
      payload: feedback,
    });
  }
  return send(res, 200, { ok: true, rows: feedbackRollupRows(entries) });
}

export function createVkAdminHandler({ database = vkAdminDatabase, storage = vkAdminStorage } = {}) {
  return async function handler(req, res) {
    const env = process.env;
    if (!isVkAdminAllowedHost(req, env)) return notFound(res);
    const { page, parts } = adminRequest(req);
    if (page && (!parts || !parts.length)) return serveAdminPage(res);
    if (!parts || !parts.length) return notFound(res);
    const [head, id, action, extra, tail] = parts;
    if (head === 'session' && !id) return handleSession(req, res, env);
    const session = requireVkAdmin(req, res, env);
    if (!session) return;
    const getStore = () => storage(env);
    try {
      if (head === 'customers' && !id) return await handleCustomers(req, res, session, database(env));
      if (head === 'customers' && id && action === 'artifacts' && !tail) {
        return await handleArtifacts(req, res, database(env), getStore, id, extra);
      }
      if (head === 'customers' && id && !extra) return await handleCustomer(req, res, env, session, id, action, database(env), getStore);
      if (head === 'feedback' && !id) return await handleFeedbackRollup(req, res, database(env), getStore);
      if (head === 'notes' && !extra && (!id || action)) return await handleNotes(req, res, database(env), getStore, [id, action]);
      if (head === 'clear-all' && !id) return handleClearAll(req, res, env, session);
      return notFound(res);
    } catch {
      return send(res, 503, { ok: false, error: 'Admin review storage is unavailable.' });
    }
  };
}

export default createVkAdminHandler();
