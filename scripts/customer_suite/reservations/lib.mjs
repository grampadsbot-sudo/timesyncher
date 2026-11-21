import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiHandler from '../../../api/[...route].mjs';
import { useVacationMcpDatabase } from '../../../routes/vacation-mcp.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../../../src/vacation/intake-shared-trip.mjs';
import { tryHandleAiMcpChatTurn } from '../../../src/vacation/mcp-reservations-chat.mjs';
import { loadTripScopedVacationAppTurns } from '../../../src/vacation/vacation-app-transcript.mjs';
import { createAcceptedWebAccessSession, webAccessForSession } from '../../../src/vacation/web-access.mjs';
import { joinCollaboratorAppSession, openCollaboratorAppSeats } from '../../../src/vacation/collaborator-app-seat.mjs';
import { sql } from '../../../src/vacation/db.mjs';
import { createReservationsTestDb } from '../../lib/reservations-test-harness.mjs';
import { invokeRoute } from '../../lib/mcp-test-exif.mjs';
import { resolveChromeExecutable } from '../../lib/c10-test-media.mjs';
import { provisionThrowaway } from '../../harness/live-provision.mjs';
import { deleteTaggedRows } from '../../harness/cleanup.mjs';
import { hostEnvReady, stagingOrigin, withHarnessEnvDefaults } from '../../harness/env.mjs';
import { acceptAndConfirmEula } from '../../harness/eula-accept.mjs';

const require = createRequire(import.meta.url);
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch (error) {
    void error;
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

export function extractBearerFromCopyText(copyText) {
  const match = String(copyText || '').match(/Authorization:\s*Bearer\s+(\S+)/i);
  assert.ok(match, 'setup copyText must contain Bearer token');
  return match[1].trim();
}

async function startLocalWebhookReceiver() {
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let json = null;
    try { json = JSON.parse(rawBody); } catch (error) { void error; }
    received.push({ method: req.method, url: req.url, headers: { ...req.headers }, rawBody, json });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/vk-reservations-webhook`,
    received,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function sendStatic(res, status, body, contentType) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store', 'content-length': buf.length });
  res.end(buf);
}

async function createLocalHarnessServer(db, peopleByToken) {
  const [aiImportJs, aiAccessJs, picViewerJs, bundleJs, bundleCss] = await Promise.all([
    readFile(path.join(REPO_ROOT, 'public/vacation-app-ai-import.js'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'public/ts-mcp-ai-access.js'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'public/ts-pic-popup-viewer.js'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'public/assets/index-BKun7ofk.js'), 'utf8'),
    readFile(path.join(REPO_ROOT, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  ]);

  const server = createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(urlObj.pathname);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);

    if (pathname === '/vacation-app-ai-import.js') return sendStatic(res, 200, aiImportJs, 'text/javascript; charset=utf-8');
    if (pathname === '/ts-mcp-ai-access.js') return sendStatic(res, 200, aiAccessJs, 'text/javascript; charset=utf-8');
    if (pathname === '/ts-pic-popup-viewer.js') return sendStatic(res, 200, picViewerJs, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-BKun7ofk.js') return sendStatic(res, 200, bundleJs, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return sendStatic(res, 200, bundleCss, 'text/css; charset=utf-8');

    if (pathname === '/chat-view') {
      const sessionTok = urlObj.searchParams.get('session') || '';
      const tripId = urlObj.searchParams.get('tripId') || '';
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vacay Keepsake Chat</title><style>body{margin:0;padding:12px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}.messages{display:grid;gap:10px;max-width:720px;margin:0 auto}.bubble{border:1px solid #d9e0e8;border-radius:8px;padding:10px 12px;background:#fff;line-height:1.42}.bubble.user{background:#e8f1f7;border-color:#c4d8e6}.bubble small{display:block;color:#5a6573;font-weight:700;margin-bottom:4px}</style><script src="/ts-pic-popup-viewer.js"></script><script src="/vacation-app-ai-import.js"></script></head><body><div id="messages" class="messages"></div><form id="composer" hidden><textarea id="messageText"></textarea></form><script>(async()=>{const res=await fetch('/api/vacation-itinerary?app=1&session='+encodeURIComponent(${JSON.stringify(sessionTok)})+'&tripId='+encodeURIComponent(${JSON.stringify(tripId)}));const data=await res.json();const el=document.getElementById('messages');const esc=(v)=>String(v||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));el.innerHTML=(data.turns||[]).map((t)=>{const u=t.speaker==='customer'||t.direction==='inbound';return '<article class="bubble '+(u?'user':'')+'"><small>'+esc(t.authorLabel||(u?'You':'Vacay Keepsake'))+'</small>'+esc(t.body)+(u?'':window.tsVacationAppAiImport.renderTurnCardHtml(t))+'</article>';}).join('');window.tsVacationAppAiImport.bindMessages({getState:()=>({turns:data.turns||[],sending:false}),getSessionToken:()=>${JSON.stringify(sessionTok)},currentTrip:()=>({id:${JSON.stringify(tripId)}}),loadApp:async()=>{}});window.__tsChatReady=true;})();</script></body></html>`;
      return sendStatic(res, 200, html, 'text/html; charset=utf-8');
    }

    if (pathname.startsWith('/shared/')) {
      const slug = pathname.split('/').filter(Boolean)[1] || '';
      const tripRow = db.tables.trips.find((t) => t.metadata?.publicSlug === slug);
      const things = tripRow ? db.tables.trip_things.filter((r) => String(r.trip_id) === String(tripRow.id)).map(thingRecordFromTripRow) : [];
      const payload = tripRow ? sharedTripFromIntake({ trip: tripRow, things }) : { places: [], days: [], assignments: {}, thingOverrides: {} };
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${tripRow?.title || 'Vacay Keepsake'}</title><link rel="stylesheet" href="/assets/index-CbEHlMj6.css" /><script>window.__TS_SHARED_BOOT_SLUG__=${JSON.stringify(slug)};window.__TS_SHARED_BOOT_TRIP__=${JSON.stringify(payload)};</script><script src="/ts-pic-popup-viewer.js"></script><script src="/ts-mcp-ai-access.js"></script><script type="module" src="/assets/index-BKun7ofk.js"></script></head><body><div id="root"></div></body></html>`;
      return sendStatic(res, 200, html, 'text/html; charset=utf-8');
    }

    if (pathname.startsWith('/api/shared/')) {
      const parts = pathname.split('/').filter(Boolean);
      const slug = parts[2] || '';
      const tripRow = db.tables.trips.find((t) => t.metadata?.publicSlug === slug);
      if (!tripRow) return sendStatic(res, 404, '{"ok":false,"error":"Not found"}', 'application/json');
      if (parts[3] === 'edit-access') {
        const cookieHeader = String(req.headers.cookie || '');
        const cookieMatch = cookieHeader.match(/ts_vacation_web_access=([^;]+)/);
        const token = req.headers['x-timesyncher-web-access-token'] || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : '');
        const grant = token ? await webAccessForSession(db, { sessionToken: String(token), shareToken: slug, env: process.env }) : null;
        return sendStatic(res, 200, JSON.stringify(grant ? { canEdit: true, role: grant.role } : { canEdit: false }), 'application/json');
      }
      const things = db.tables.trip_things.filter((r) => String(r.trip_id) === String(tripRow.id)).map(thingRecordFromTripRow);
      const payload = sharedTripFromIntake({ trip: tripRow, things });
      return sendStatic(res, 200, JSON.stringify(payload), 'application/json');
    }

    if (pathname === '/api/vacation-itinerary' && urlObj.searchParams.get('app') === '1') {
      const sessionTok = urlObj.searchParams.get('session') || '';
      const person = peopleByToken.get(sessionTok);
      if (!person) return sendStatic(res, 401, '{"ok":false,"error":"Invalid session"}', 'application/json');
      const tripId = urlObj.searchParams.get('tripId') || person.tripId;
      const tripRow = db.tables.trips.find((t) => String(t.id) === String(tripId));
      if (req.method === 'GET') {
        const turns = await loadTripScopedVacationAppTurns(db, person.session, tripId, {
          loadTranscriptAuthorPeople: async () => [...peopleByToken.values()].map((p) => ({ id: p.customerId, displayName: p.displayName, firstName: p.displayName })),
        });
        const itinerary = db.tables.trip_things.filter((r) => String(r.trip_id) === String(tripId));
        return sendStatic(res, 200, JSON.stringify({ ok: true, trip: tripRow, turns, itinerary }), 'application/json');
      }
      if (req.method === 'POST') {
        const body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
        const postTripId = body.tripId || tripId;
        const postTrip = db.tables.trips.find((t) => String(t.id) === String(postTripId)) || tripRow;
        const reply = await tryHandleAiMcpChatTurn(db, {
          session: person.session,
          trip: postTrip ? { id: postTrip.id, title: postTrip.title, destination: postTrip.destination, startDate: postTrip.start_date, endDate: postTrip.end_date } : null,
          requestText: String(body.text || body.message || ''),
          httpReq: { headers: { host: req.headers.host || '127.0.0.1', 'x-forwarded-proto': 'http' } },
          env: process.env,
        });
        if (!reply) return sendStatic(res, 200, JSON.stringify({ ok: true, status: 'replied', reply: 'Got it.' }), 'application/json');
        return sendStatic(res, 201, JSON.stringify({ ok: true, ...reply }), 'application/json');
      }
    }

    if (pathname.startsWith('/api/mcp')) {
      const invoked = await invokeRoute(apiHandler, {
        method: req.method,
        url: urlObj.pathname + urlObj.search,
        headers: { ...req.headers, host: req.headers.host || '127.0.0.1', 'x-forwarded-proto': 'http' },
        body: rawBody.length ? rawBody : null,
      });
      res.writeHead(invoked.statusCode, {
        'content-type': invoked.headers['content-type'] || 'application/json',
        'cache-control': invoked.headers['cache-control'] || 'no-store',
        'content-length': invoked.raw.length,
      });
      return res.end(invoked.raw);
    }

    return sendStatic(res, 404, '{"ok":false,"error":"Not found"}', 'application/json');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

export async function createReservationsSuiteContext(suiteName = 'reservations') {
  const runDir = process.env.ACCEPT_RUN_DIR || process.env.SCREENSHOT_DIR || path.join(os.tmpdir(), 'vk-reservations-suite');
  fs.mkdirSync(runDir, { recursive: true });
  const live = hostEnvReady(process.env);
  const webhook = await startLocalWebhookReceiver();

  if (live) {
    const env = withHarnessEnvDefaults(process.env);
    const origin = stagingOrigin(env);
    const db = sql(env);
    const runId = `res-${suiteName}-${crypto.randomBytes(4).toString('hex')}`;
    const tag = `harness:${runId}`;
    const ownerProv = await provisionThrowaway(db, {
      story_id: `${suiteName}-owner`,
      destination: 'New York, NY',
      dates: { start: '2026-07-08', end: '2026-07-11' },
      customer: { name: 'Avery Quinn', email_alias: 'owner' },
      party: { adults: 2 },
    }, { tag, runId, env });
    await acceptAndConfirmEula({ origin, token: ownerProv.token, tripId: ownerProv.tripId, acceptedByName: 'Avery Quinn', fetchImpl: globalThis.fetch });

    const secondOwnerProv = await provisionThrowaway(db, {
      story_id: `${suiteName}-second`,
      destination: 'Napa, CA',
      dates: { start: '2026-09-12', end: '2026-09-15' },
      customer: { name: 'Jordan Blake', email_alias: 'host2' },
      party: { adults: 2 },
    }, { tag: `${tag}-2`, runId: `${runId}-2`, env });
    await acceptAndConfirmEula({ origin, token: secondOwnerProv.token, tripId: secondOwnerProv.tripId, acceptedByName: 'Jordan Blake', fetchImpl: globalThis.fetch });

    const outsiderProv = await provisionThrowaway(db, {
      story_id: `${suiteName}-outsider`,
      destination: 'Seattle, WA',
      dates: { start: '2026-08-12', end: '2026-08-15' },
      customer: { name: 'Casey Morgan', email_alias: 'outsider' },
      party: { adults: 2 },
    }, { tag: `${tag}-3`, runId: `${runId}-3`, env });

    const ownerEmail = `harness+${runId}+owner@harness.invalid`;
    const collabEmail = `harness+${runId}+collab@harness.invalid`;
    const opened = await openCollaboratorAppSeats(db, { ownerCustomerId: ownerProv.customerId, tripId: ownerProv.tripId, seats: [{ name: 'Riley Chen', email: collabEmail }], env });
    const invRows = await db`select * from vacation_collaborator_invites where id = ${opened[0].inviteId} limit 1`;
    const joinedCollab = await joinCollaboratorAppSession(db, { invite: invRows[0], contact: { email: collabEmail, displayName: 'Riley Chen' }, env });
    const openedOnSecond = await openCollaboratorAppSeats(db, { ownerCustomerId: secondOwnerProv.customerId, tripId: secondOwnerProv.tripId, seats: [{ name: 'Avery Quinn', email: ownerEmail }], env });
    const inv2Rows = await db`select * from vacation_collaborator_invites where id = ${openedOnSecond[0].inviteId} limit 1`;
    const ownerAsCollab = await joinCollaboratorAppSession(db, { invite: inv2Rows[0], contact: { email: ownerEmail, displayName: 'Avery Quinn' }, env });
    const ownerWeb = await createAcceptedWebAccessSession(db, { ownerCustomerId: ownerProv.customerId, tripId: ownerProv.tripId, email: ownerEmail, displayName: 'Avery Quinn', role: 'owner', metadata: { shareToken: ownerProv.shareToken }, env });
    const collabWeb = await createAcceptedWebAccessSession(db, { ownerCustomerId: ownerProv.customerId, tripId: ownerProv.tripId, email: collabEmail, displayName: 'Riley Chen', role: 'web_editor', metadata: { shareToken: ownerProv.shareToken }, env });
    const outsiderWeb = await createAcceptedWebAccessSession(db, { ownerCustomerId: outsiderProv.customerId, tripId: outsiderProv.tripId, email: `harness+${runId}-3+outsider@harness.invalid`, displayName: 'Casey Morgan', role: 'owner', metadata: { shareToken: outsiderProv.shareToken }, env });
    return buildSuiteApi({
      live: true, origin, runDir, webhook,
      owner: { customerId: ownerProv.customerId, email: ownerEmail, appSession: ownerProv.token, collabAppSession: ownerAsCollab.token, webToken: ownerWeb.sessionToken },
      collaborator: { email: collabEmail, appSession: joinedCollab.token, webToken: collabWeb.sessionToken },
      outsider: { customerId: outsiderProv.customerId, webToken: outsiderWeb.sessionToken },
      vacation1: { id: ownerProv.tripId, shareToken: ownerProv.shareToken, title: 'New York, NY harness' },
      vacation2: { id: secondOwnerProv.tripId, shareToken: secondOwnerProv.shareToken, title: 'Napa, CA harness' },
      outsiderVacation: { id: outsiderProv.tripId, shareToken: outsiderProv.shareToken, title: 'Seattle, WA harness' },
      cleanup: async () => { await webhook.close(); await deleteTaggedRows(db, tag); await deleteTaggedRows(db, `${tag}-2`); await deleteTaggedRows(db, `${tag}-3`); },
    });
  }

  const db = createReservationsTestDb();
  useVacationMcpDatabase(db);
  const ownerId = crypto.randomUUID();
  const secondOwnerId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  const ownerEmail = 'owner-suite@harness.invalid';
  const collabEmail = 'collab-suite@harness.invalid';
  const outsiderEmail = 'outsider-suite@harness.invalid';

  const v1 = db.seedVacation({
    ownerCustomerId: ownerId,
    title: 'NYC Food & Culture Vacation',
    destination: 'New York, NY',
    startDate: '2026-07-08',
    endDate: '2026-07-11',
  });
  db.seedThing({ tripId: v1.id, category: 'restaurant', title: 'Carbone', description: 'Italian restaurant in Greenwich Village' });
  const v2 = db.seedVacation({
    ownerCustomerId: secondOwnerId,
    title: 'Napa Valley Harvest Vacation',
    destination: 'Napa, CA',
    startDate: '2026-09-12',
    endDate: '2026-09-15',
  });
  const vOut = db.seedVacation({
    ownerCustomerId: outsiderId,
    title: 'Seattle Waterfront Vacation',
    destination: 'Seattle, WA',
    startDate: '2026-08-12',
    endDate: '2026-08-15',
  });

  const collabOnV1 = db.seedCollaborator({
    tripId: v1.id,
    ownerCustomerId: ownerId,
    email: collabEmail,
    displayName: 'Riley Chen',
  });
  const ownerOnV2 = db.seedCollaborator({
    tripId: v2.id,
    ownerCustomerId: secondOwnerId,
    collaboratorCustomerId: ownerId,
    email: ownerEmail,
    displayName: 'Avery Quinn',
  });

  const ownerWebToken = `web-owner-${crypto.randomBytes(6).toString('hex')}`;
  const collabWebToken = `web-collab-${crypto.randomBytes(6).toString('hex')}`;
  const outsiderWebToken = `web-outsider-${crypto.randomBytes(6).toString('hex')}`;
  db.seedEditorSession({ tripId: v1.id, ownerCustomerId: ownerId, email: ownerEmail, role: 'owner', sessionToken: ownerWebToken, shareSlug: v1.metadata.publicSlug });
  db.seedEditorSession({ tripId: v1.id, ownerCustomerId: ownerId, email: collabEmail, role: 'web_editor', sessionToken: collabWebToken, shareSlug: v1.metadata.publicSlug });
  db.seedEditorSession({ tripId: vOut.id, ownerCustomerId: outsiderId, email: outsiderEmail, role: 'owner', sessionToken: outsiderWebToken, shareSlug: vOut.metadata.publicSlug });

  const ownerAppToken = `app-owner-${crypto.randomBytes(6).toString('hex')}`;
  const peopleByToken = new Map([
    [ownerAppToken, {
      customerId: ownerId,
      tripId: v1.id,
      displayName: 'Avery Quinn',
      session: { customer_id: ownerId, email: ownerEmail, first_name: 'Avery', display_name: 'Avery Quinn', token: ownerAppToken },
    }],
    [ownerOnV2.token, {
      customerId: ownerId,
      tripId: v2.id,
      displayName: 'Avery Quinn',
      session: { customer_id: ownerId, email: ownerEmail, first_name: 'Avery', display_name: 'Avery Quinn', token: ownerOnV2.token, metadata: { seat: ownerOnV2.seat } },
    }],
    [collabOnV1.token, {
      customerId: collabOnV1.customerId,
      tripId: v1.id,
      displayName: 'Riley Chen',
      session: { customer_id: collabOnV1.customerId, email: collabEmail, first_name: 'Riley', display_name: 'Riley Chen', token: collabOnV1.token, metadata: { seat: collabOnV1.seat } },
    }],
  ]);

  const localServer = await createLocalHarnessServer(db, peopleByToken);

  return buildSuiteApi({
    live: false,
    origin: localServer.origin,
    runDir,
    webhook,
    owner: {
      customerId: ownerId,
      email: ownerEmail,
      appSession: ownerAppToken,
      collabAppSession: ownerOnV2.token,
      webToken: ownerWebToken,
    },
    collaborator: {
      customerId: collabOnV1.customerId,
      email: collabEmail,
      appSession: collabOnV1.token,
      webToken: collabWebToken,
    },
    outsider: {
      customerId: outsiderId,
      email: outsiderEmail,
      webToken: outsiderWebToken,
    },
    vacation1: { id: v1.id, shareToken: v1.metadata.publicSlug, title: v1.title },
    vacation2: { id: v2.id, shareToken: v2.metadata.publicSlug, title: v2.title },
    outsiderVacation: { id: vOut.id, shareToken: vOut.metadata.publicSlug, title: vOut.title },
    cleanup: async () => {
      await webhook.close();
      await localServer.close();
      useVacationMcpDatabase(null);
    },
  });
}

function buildSuiteApi(ctx) {
  async function chatSend(appSession, tripId, text) {
    const res = await fetch(`${ctx.origin}/api/vacation-itinerary?app=1&session=${encodeURIComponent(appSession)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ tripId, text }),
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  async function chatLoad(appSession, tripId) {
    const res = await fetch(`${ctx.origin}/api/vacation-itinerary?app=1&session=${encodeURIComponent(appSession)}&tripId=${encodeURIComponent(tripId)}`, {
      headers: { accept: 'application/json' },
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  async function mcpRpc(method, params = {}, token = '') {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${ctx.origin}/api/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  async function apiCall(pathname, { method = 'GET', webToken = '', bearerToken = '', body = null } = {}) {
    const headers = { accept: 'application/json' };
    if (webToken) headers['x-timesyncher-web-access-token'] = webToken;
    if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
    if (body !== null) headers['content-type'] = 'application/json';
    const res = await fetch(`${ctx.origin}${pathname}`, {
      method,
      headers,
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (error) {
      void error;
    }
    return { status: res.status, json, text };
  }

  async function captureViewports(namePrefix, { url, webToken = '', prepare = null }) {
    const chrome = resolveChromeExecutable();
    const puppeteer = loadPuppeteer();
    const browser = await puppeteer.launch({
      executablePath: chrome,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const outputs = [];
    try {
      for (const vp of [{ label: '390', width: 390, height: 844 }, { label: '1280', width: 1280, height: 800 }]) {
        const page = await browser.newPage();
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
        if (webToken) {
          await page.setExtraHTTPHeaders({ 'x-timesyncher-web-access-token': webToken });
          const host = new URL(ctx.origin).hostname;
          await page.setCookie({ name: 'ts_vacation_web_access', value: webToken, domain: host, path: '/' });
        }
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        if (typeof prepare === 'function') await prepare(page, vp);
        const outPath = path.join(ctx.runDir, `${namePrefix}-${vp.label}.png`);
        await page.screenshot({ path: outPath, fullPage: true });
        outputs.push({ viewport: vp.label, path: outPath });
        await page.close();
      }
    } finally {
      await browser.close();
    }
    return outputs;
  }

  return {
    ...ctx,
    chatSend,
    chatLoad,
    mcpRpc,
    apiCall,
    captureViewports,
  };
}
