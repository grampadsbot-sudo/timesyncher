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

const PORT = Number(process.env.PORT || 4180);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = resolve(process.env.TIMESYNCHER_STATIC_ROOT || 'dist');
const STORE = resolve(process.env.TIMESYNCHER_ONBOARDING_STORE || 'runtime/onboarding-eula');
const DEFAULT_EULA = process.env.TIMESYNCHER_EULA_PATH || 'public/legal/eula-2026-04-initial-draft.md';
const DEFAULT_EULA_VERSION = process.env.TIMESYNCHER_EULA_VERSION || '2026-04-initial-draft';

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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderAcceptPage(session) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TimeSyncher EULA Acceptance</title><style>body{font-family:system-ui,sans-serif;line-height:1.55;margin:0;background:#0b1020;color:#eef3ff}.shell{max-width:960px;margin:auto;padding:28px 18px}.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:20px;margin:16px 0}.eula{white-space:pre-wrap;max-height:45vh;overflow:auto;background:#07101f;border:1px solid #2b3758;border-radius:14px;padding:16px}input[type=text]{width:100%;padding:12px;border-radius:12px;border:1px solid #2b3758;background:#07101f;color:#eef3ff}.btn{border:0;border-radius:999px;padding:13px 18px;font-weight:800;background:linear-gradient(135deg,#7dd3fc,#a78bfa);color:#07101f}.muted{color:#bfd0f3}pre{white-space:pre-wrap;overflow:auto}</style></head><body><main class="shell"><h1>TimeSyncher EULA Acceptance</h1><p class="muted">Please review the EULA and selected functionality before accepting.</p><section class="card"><h2>Client</h2><p>${escapeHtml(session.clientLabel)} (${escapeHtml(session.clientKey)})</p><p class="muted">${escapeHtml(session.contact?.email)} · ${escapeHtml(session.contact?.phone)}</p><p>EULA version: <strong>${escapeHtml(session.eula.version)}</strong></p></section><section class="card"><h2>Selected functionality</h2><ul>${(session.selectedFunctionality || []).map((f) => `<li>${escapeHtml(String(f).replaceAll('_', ' '))}</li>`).join('')}</ul></section><section class="card"><h2>Google/OAuth policy snapshot</h2><pre>${escapeHtml(JSON.stringify(session.google || {}, null, 2))}</pre></section><section class="card"><h2>Full EULA text</h2><div class="eula">${escapeHtml(session.eula.text)}</div></section><form id="form" class="card"><h2>Accept</h2><label>Typed name / authorized signer<input id="name" required value="${escapeHtml(session.clientLabel || '')}"></label><p><label><input id="agree" type="checkbox" required> I have read and agree to the TimeSyncher EULA shown above.</label></p><button class="btn">Accept EULA</button></form><section id="result" class="card" hidden><h2>Accepted</h2><p>Your acceptance receipt was saved server-side. Thank you — TimeSyncher has recorded your EULA acceptance.</p></section></main><script>document.getElementById('form').addEventListener('submit', async (e)=>{e.preventDefault(); const r=await fetch('/api/onboarding/${encodeURIComponent(session.sessionId)}/eula/accept',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({acceptedByName:document.getElementById('name').value,checkboxConfirmed:document.getElementById('agree').checked})}); const j=await r.json(); if(!j.ok){alert(j.error||'Acceptance failed'); return;} document.getElementById('result').hidden=false; document.getElementById('form').hidden=true;});</script></body></html>`;
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
      if (!session || session.unavailableReason) return send(res, 404, 'acceptance session not found or unavailable', 'text/plain');
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
