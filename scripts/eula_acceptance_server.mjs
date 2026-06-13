#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import {
  acceptEula,
  activationStatus,
  createOnboardingSession,
  ensureStore,
  loadSession,
  receiptPath,
  readJson,
} from '../src/onboarding/eula-backend-core.mjs';
import { renderAcceptPage, renderUnavailableAcceptPage } from '../src/onboarding/eula-accept-page-render.mjs';

const PORT = Number(process.env.PORT || 4180);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = resolve(process.env.TIMESYNCHER_STATIC_ROOT || 'dist');
const STORE = resolve(process.env.TIMESYNCHER_ONBOARDING_STORE || 'runtime/onboarding-eula');
const DEFAULT_EULA = process.env.TIMESYNCHER_EULA_PATH || 'public/legal/terms-2026-06-advisory-only.md';
const DEFAULT_EULA_VERSION = process.env.TIMESYNCHER_EULA_VERSION || '2026-06-terms-advisory-only';

ensureStore(STORE);

function send(res, status, body, type = 'application/json') {
  const content = typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n';
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(content);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function publicSession(session) {
  if (!session) return null;
  const { eula, ...rest } = session;
  return { ...rest, eula: { version: eula.version, text: eula.text } };
}

function contentType(path) {
  return ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown' })[extname(path)] || 'application/octet-stream';
}

async function handleApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/onboarding/sessions') {
    const body = await readBody(req);
    const eulaText = body.eula?.text || readFileSync(DEFAULT_EULA, 'utf8');
    const session = createOnboardingSession(STORE, {
      ...body,
      eula: { version: body.eula?.version || DEFAULT_EULA_VERSION, text: eulaText },
    });
    return send(res, 201, { ok: true, sessionId: session.sessionId, session: publicSession(session) });
  }

  const sessionMatch = url.pathname.match(/^\/api\/onboarding\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    const session = loadSession(STORE, decodeURIComponent(sessionMatch[1]));
    if (!session || session.unavailableReason) return send(res, 404, { ok: false, error: session?.unavailableReason || 'session not found' });
    return send(res, 200, { ok: true, session: publicSession(session) });
  }

  const acceptMatch = url.pathname.match(/^\/api\/onboarding\/([^/]+)\/eula\/accept$/);
  if (req.method === 'POST' && acceptMatch) {
    const body = await readBody(req);
    const sessionId = decodeURIComponent(acceptMatch[1]);
    try {
      const { receipt, acceptanceCopyPath } = acceptEula(STORE, sessionId, {
        acceptedByName: body.acceptedByName,
        checkboxConfirmed: body.checkboxConfirmed,
        ipAddress: req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
      });
      return send(res, 201, { ok: true, receipt, acceptanceCopyPath });
    } catch (error) {
      return send(res, 400, { ok: false, error: error.message });
    }
  }

  const receiptMatch = url.pathname.match(/^\/api\/onboarding\/([^/]+)\/receipt$/);
  if (req.method === 'GET' && receiptMatch) {
    const path = receiptPath(STORE, decodeURIComponent(receiptMatch[1]));
    if (!existsSync(path)) return send(res, 404, { ok: false, error: 'receipt not found' });
    return send(res, 200, { ok: true, receipt: readJson(path) });
  }

  const activationMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/activation-status$/);
  if (req.method === 'GET' && activationMatch) {
    const clientKey = decodeURIComponent(activationMatch[1]);
    return send(res, 200, activationStatus(STORE, clientKey, url.searchParams.get('eulaVersion') || DEFAULT_EULA_VERSION));
  }

  return send(res, 404, { ok: false, error: 'not found' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const acceptMatch = url.pathname.match(/^\/accept\/([^/]+)$/);
    if (req.method === 'GET' && acceptMatch) {
      const session = loadSession(STORE, decodeURIComponent(acceptMatch[1]));
      if (!session || session.unavailableReason) return send(res, 404, renderUnavailableAcceptPage(session?.unavailableReason || 'missing'), 'text/html');
      return send(res, 200, renderAcceptPage(session), 'text/html');
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = join(ROOT, decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !existsSync(file)) return send(res, 404, 'not found', 'text/plain');
    return send(res, 200, readFileSync(file), contentType(file));
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ ok: true, service: 'timesyncher-eula-acceptance-server', host: HOST, port: PORT, store: STORE }));
});
