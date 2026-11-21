#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiHandler from '../api/[...route].mjs';
import { setVacationMcpClock, useVacationMcpDatabase } from '../routes/vacation-mcp.mjs';
import { handlePendingPreviewChatTurn, tryHandlePendingPreviewChatTurn } from '../src/vacation/mcp-chat-preview-edit.mjs';
import { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { createMcpTestDb } from './lib/mcp-test-harness.mjs';
import { invokeRoute } from './lib/mcp-test-exif.mjs';
import { buildCarmelWeekendFixture, ensureVacationClientDist, resolveChromeExecutable } from './lib/c10-test-media.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const proofDir = process.env.D10_PROOF_DIR || '';
const TYPE_PREFIX_RE = /\b(?:flight|hotel|car|restaurant|store|sightseeing|activity|attraction|tour|bar|music|theatre|workout|tickets|family_event|artist|transport|event|note)\s*:/i;
const RAW_ISO_RE = /\b\d{4}-\d{2}-\d{2}\b/;

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch (error) {
    void error;
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

async function mcpRpc(method, params = {}, token = '') {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp',
    headers,
    body: { jsonrpc: '2.0', id: crypto.randomUUID(), method, params },
  });
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': buf.length });
  res.end(buf);
}

async function startD10Server({ replacedCard, latestCard, shareSlug, sessionToken, sharedPayload }) {
  ensureVacationClientDist(root);
  const distDir = path.join(root, 'apps/vacation-client/dist');
  const [viewerJs, gridPanelJs, chatAiJs, nextHtml] = await Promise.all([
    readFile(path.join(root, 'public/ts-pic-popup-viewer.js'), 'utf8'),
    readFile(path.join(root, 'public/ts-mcp-ai-access.js'), 'utf8'),
    readFile(path.join(root, 'public/vacation-app-ai-import.js'), 'utf8'),
    readFile(path.join(distDir, 'vacation-app-next.html'), 'utf8'),
  ]);
  const chatHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vacay Keepsake Chat</title><style>body{margin:0;padding:12px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}.stack{display:grid;gap:12px;max-width:720px;margin:0 auto}.bubble{border:1px solid #d9e0e8;border-radius:8px;padding:10px 12px;background:#fff}</style><script src="/ts-pic-popup-viewer.js"></script><script src="/vacation-app-ai-import.js"></script></head><body><div id="messages" class="stack"></div><script>const oldCard=${JSON.stringify(replacedCard)};const curCard=${JSON.stringify(latestCard)};const m=document.getElementById('messages');m.innerHTML='<article class="bubble" data-turn="old"><small>Vacay Keepsake</small>Your AI staged a preview for your review.'+window.tsVacationAppAiImport.renderTurnCardHtml({payload:{aiApprovalCard:oldCard}})+'</article><article class="bubble" data-turn="latest"><small>Vacay Keepsake</small>Updated your pending preview.'+window.tsVacationAppAiImport.renderTurnCardHtml({payload:{aiApprovalCard:curCard}})+'</article>';window.tsVacationAppAiImport.bindMessages({getState:()=>({turns:[{payload:{aiApprovalCard:oldCard}},{payload:{aiApprovalCard:curCard}}],sending:false}),getSessionToken:()=>'',currentTrip:()=>({id:curCard.vacationId,shareToken:curCard.shareSlug}),loadApp:async()=>{}});</script></body></html>`;
  const gridHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carmel Weekend</title><script>window.__TS_SHARED_BOOT_SLUG__=${JSON.stringify(shareSlug)};</script><script src="/ts-pic-popup-viewer.js"></script><script src="/ts-mcp-ai-access.js"></script></head><body style="margin:0;background:#eef1f4"></body></html>`;

  const server = createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(urlObj.pathname);
    if (pathname === '/chat-preview') return send(res, 200, chatHtml, 'text/html; charset=utf-8');
    if (pathname === `/shared/${shareSlug}/` || pathname === `/shared/${shareSlug}`) return send(res, 200, gridHtml, 'text/html; charset=utf-8');
    if (pathname === '/vacation-app-next.html') return send(res, 200, nextHtml, 'text/html; charset=utf-8');
    if (pathname === '/ts-pic-popup-viewer.js') return send(res, 200, viewerJs, 'text/javascript; charset=utf-8');
    if (pathname === '/ts-mcp-ai-access.js') return send(res, 200, gridPanelJs, 'text/javascript; charset=utf-8');
    if (pathname === '/vacation-app-ai-import.js') return send(res, 200, chatAiJs, 'text/javascript; charset=utf-8');
    if (pathname === '/ts-build-stamp-customer-hide.css') return send(res, 200, '', 'text/css; charset=utf-8');
    if (pathname === '/ts-build-stamp-customer-hide.js') return send(res, 200, '', 'text/javascript; charset=utf-8');
    if (pathname.startsWith('/assets/')) {
      const assetPath = path.join(distDir, pathname.slice(1));
      if (existsSync(assetPath)) {
        const mime = pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
        return send(res, 200, await readFile(assetPath), mime);
      }
    }
    if (pathname === `/api/shared/${shareSlug}/` || pathname === `/api/shared/${shareSlug}`) {
      return send(res, 200, JSON.stringify(sharedPayload), 'application/json; charset=utf-8');
    }
    if (pathname === `/api/shared/${shareSlug}/edit-access`) {
      return send(res, 200, JSON.stringify({ canEdit: true, role: 'owner' }), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/mcp/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = chunks.length ? Buffer.concat(chunks) : null;
      const invoked = await invokeRoute(apiHandler, {
        method: req.method,
        url: urlObj.pathname + urlObj.search,
        headers: { ...req.headers, 'x-timesyncher-web-access-token': sessionToken },
        body: rawBody,
      });
      res.writeHead(invoked.statusCode, {
        'content-type': invoked.headers['content-type'] || 'application/octet-stream',
        'cache-control': invoked.headers['cache-control'] || 'no-store',
        'content-length': invoked.raw.length,
      });
      return res.end(invoked.raw);
    }
    return send(res, 404, 'not found', 'text/plain');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function assertCleanPreviewCopy(dom, label) {
  assert.doesNotMatch(dom.text, TYPE_PREFIX_RE, `${label}: no type: prefix`);
  assert.doesNotMatch(dom.text, /\(s\)/i, `${label}: no (s) plural`);
  assert.doesNotMatch(dom.text, /long-list/i, `${label}: no long-list copy`);
  assert.doesNotMatch(dom.text, /\btrips?\b/i, `${label}: never say trip`);
  assert.doesNotMatch(dom.text, /not placed yet/i, `${label}: no Not placed yet`);
  for (const h of dom.dayHeaders) assert.doesNotMatch(h, RAW_ISO_RE, `${label}: no raw ISO in day header`);
  assert.equal(dom.ulCount, 0, `${label}: no bulleted <ul> in preview`);
}

const db = createMcpTestDb();
useVacationMcpDatabase(db);
useSharedTripDatabase(db);
setVacationMcpClock(() => new Date('2026-11-20T20:00:00.000Z'));

const ownerId = crypto.randomUUID();
const sessionToken = 'sess-1073-d10';
const trip = db.seedVacation({
  ownerCustomerId: ownerId,
  title: 'Carmel Weekend',
  destination: 'Carmel-by-the-Sea, CA',
  startDate: '2026-07-03',
  endDate: '2026-07-05',
  timezone: 'America/Los_Angeles',
});
const shareSlug = trip.metadata.publicSlug;
const liveOnlyInn = db.seedThing({
  tripId: trip.id,
  category: 'hotel',
  title: 'Live Cypress Inn',
  description: 'Already live hotel stay',
  metadata: { dayDate: '2026-07-03', scheduled: true, unscheduled: false, source: 'live' },
});
db.seedEditorSession({
  tripId: trip.id,
  ownerCustomerId: ownerId,
  email: 'throwaway-d10@example.test',
  role: 'owner',
  sessionToken,
  shareSlug,
});

const tokenRes = await invokeRoute(apiHandler, {
  method: 'POST',
  url: '/api/mcp/tokens',
  headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': sessionToken },
  body: { tripId: trip.id, label: 'Carmel AI', role: 'owner' },
});
assert.equal(tokenRes.statusCode, 201);
const aiToken = tokenRes.json.token;

const { draft, mediaFiles } = buildCarmelWeekendFixture();
const startRes = await mcpRpc('tools/call', { name: 'start_import', arguments: { ...draft, apply_mode: 'populate_scoped' } }, aiToken);
assert.equal(startRes.statusCode, 200);
const draftId = startRes.json.result.structuredContent.draft_id;

const reqUpload = await mcpRpc('tools/call', {
  name: 'upload_media',
  arguments: {
    action: 'request_upload',
    draft_id: draftId,
    files: mediaFiles.map((f) => ({
      filename: f.filename,
      mime_type: f.mime_type,
      media_kind: f.media_kind,
      caption: f.caption,
      ...(f.thing_ref ? { thing_ref: f.thing_ref } : {}),
    })),
  },
}, aiToken);
const slots = reqUpload.json.result.structuredContent.uploads;
const mediaIdByKey = new Map();
for (let i = 0; i < slots.length; i += 1) {
  mediaIdByKey.set(mediaFiles[i].key, slots[i].media_id);
  const parsed = new URL(slots[i].upload_url);
  assert.equal((await invokeRoute(apiHandler, {
    method: 'PUT',
    url: parsed.pathname + parsed.search,
    headers: { 'content-type': mediaFiles[i].mime_type },
    body: mediaFiles[i].bytes,
  })).statusCode, 200);
}
assert.equal((await mcpRpc('tools/call', {
  name: 'upload_media',
  arguments: { action: 'finalize', draft_id: draftId, media_ids: slots.map((s) => s.media_id) },
}, aiToken)).statusCode, 200);

const previewV1Res = await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, aiToken);
const previewV1 = previewV1Res.json.result.structuredContent.preview;
const hashV1 = previewV1.preview_hash;
assert.equal((await mcpRpc('tools/call', {
  name: 'commit_import',
  arguments: { draft_id: draftId, preview_hash: hashV1 },
}, aiToken)).statusCode, 200);

const ownerSession = { customer_id: ownerId, email: 'throwaway-d10@example.test', first_name: 'Jordan', display_name: 'Jordan' };
const liveBeforeEdits = db.liveSnapshot();

const outOfRangeDay = await handlePendingPreviewChatTurn(db, { session: ownerSession, trip, requestText: 'move Pilgrim Way Bookshop to Day 5' });
assert.equal(outOfRangeDay.limitBlocked, true);
assert.equal(outOfRangeDay.previewHash, hashV1);
assert.equal(outOfRangeDay.aiApprovalCard, null);

const outOfRangeDate = await handlePendingPreviewChatTurn(db, { session: ownerSession, trip, requestText: 'move Point Lobos to 2026-08-12' });
assert.equal(outOfRangeDate.limitBlocked, true);
assert.equal(outOfRangeDate.previewHash, hashV1);

const liveEditAttempt = await handlePendingPreviewChatTurn(db, { session: ownerSession, trip, requestText: 'move Live Cypress Inn to Day 2' });
assert.equal(liveEditAttempt.limitBlocked, true);
assert.equal(liveEditAttempt.previewHash, hashV1);
assert.equal(db.liveSnapshot(), liveBeforeEdits);

const vagueTurn = await handlePendingPreviewChatTurn(db, { session: ownerSession, trip, requestText: 'fix the preview' });
assert.equal(vagueTurn.clarified, true);
assert.match(vagueTurn.reply, /\?/);
assert.equal(vagueTurn.previewHash, hashV1);

const ambiguousVideo = await handlePendingPreviewChatTurn(db, { session: ownerSession, trip, requestText: 'drop that video' });
assert.equal(ambiguousVideo.clarified, true);
assert.match(ambiguousVideo.reply, /\?/);
assert.equal(ambiguousVideo.previewHash, hashV1);

const d9Violation = await handlePendingPreviewChatTurn(db, { session: ownerSession, trip, requestText: 'move the coastal bluffs photo to no date' });
assert.equal(d9Violation.limitBlocked, true);
assert.equal(d9Violation.previewHash, hashV1);

const editV2 = await tryHandlePendingPreviewChatTurn(db, {
  session: ownerSession,
  trip,
  requestText: 'move the bookshop to Day 2 and drop day2-surf-video.mp4',
});
assert.ok(editV2 && editV2.aiApprovalCard);
assert.equal(editV2.previewVersion, 2);
const hashV2 = editV2.previewHash;
assert.notEqual(hashV2, hashV1);
assert.equal(editV2.aiApprovalCard.days[1].items.some((i) => i.title === 'Pilgrim Way Bookshop'), true);
assert.equal(editV2.aiApprovalCard.unscheduledThings.length, 0);
assert.equal(editV2.aiApprovalCard.days[1].day_media.some((m) => m.media_id === mediaIdByKey.get('day2UnmatchedVideo')), false);
assert.equal(db.liveSnapshot(), liveBeforeEdits);

const editV3 = await handlePendingPreviewChatTurn(db, { session: ownerSession, trip, requestText: 'the lunch is at 1 PM' });
assert.equal(editV3.previewVersion, 3);
const hashV3 = editV3.previewHash;
assert.notEqual(hashV3, hashV2);
assert.equal(editV3.aiApprovalCard.days[0].items.find((i) => i.ref === 'rest-carmel-belle')?.start_time, '13:00');

const rescueDayFallback = await handlePendingPreviewChatTurn(db, {
  session: ownerSession,
  trip,
  requestText: 'the seashell photo was dinner on day 2',
});
assert.equal(rescueDayFallback.previewVersion, 4);
const hashV4 = rescueDayFallback.previewHash;
assert.notEqual(hashV4, hashV3);
assert.equal(rescueDayFallback.aiApprovalCard.skippedMedia.some((m) => m.media_id === mediaIdByKey.get('undatedPhoto')), false);
assert.equal(rescueDayFallback.aiApprovalCard.days[1].day_media.some((m) => m.media_id === mediaIdByKey.get('undatedPhoto')), true);

const rescueThingMatch = await handlePendingPreviewChatTurn(db, {
  session: ownerSession,
  trip,
  requestText: 'the winter archive photo was lunch on day 1',
});
assert.equal(rescueThingMatch.previewVersion, 5);
const hashV5 = rescueThingMatch.previewHash;
assert.notEqual(hashV5, hashV4);
assert.equal(rescueThingMatch.aiApprovalCard.skippedMedia.length, 0);
assert.equal(
  rescueThingMatch.aiApprovalCard.days[0].items.find((i) => i.ref === 'rest-carmel-belle')?.media.some((m) => m.media_id === mediaIdByKey.get('outOfRangePhoto')),
  true,
);

for (const staleHash of [hashV1, hashV2, hashV3, hashV4]) {
  const staleApprove = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${draftId}/approve`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': sessionToken },
    body: { tripId: trip.id, shareToken: shareSlug, preview_hash: staleHash },
  });
  assert.equal(staleApprove.statusCode, 409);
  assert.equal(staleApprove.json.code, 'preview_hash_mismatch');
}
assert.equal(db.liveSnapshot(), liveBeforeEdits);

const chatTurns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
  loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan', firstName: 'Jordan' }],
});
const allCards = chatTurns.map((t) => t.payload?.aiApprovalCard).filter((c) => c?.changeSetId === draftId);
const replacedCard = allCards.find((c) => c.previewHash === hashV1);
const latestCard = allCards.find((c) => c.previewHash === hashV5);
assert.equal(replacedCard?.status, 'replaced');
assert.equal(latestCard?.status, 'pending_approval');

const sharedPayload = {
  trip: { id: 1073, title: 'Carmel Weekend', destination: 'Carmel-by-the-Sea, CA', start_date: '2026-07-03', end_date: '2026-07-05' },
  days: [
    { id: 1, day_number: 1, date: '2026-07-03', title: 'Village Lunch & Point Lobos' },
    { id: 2, day_number: 2, date: '2026-07-04', title: 'Scenic Coast Drive' },
  ],
  places: [],
  assignments: {},
  thingOverrides: {},
  media: [],
  permissions: { canEdit: true },
};

const noteText = 'Please add a morning coffee stop on Day 3 before departure.';
const server = await startD10Server({ replacedCard, latestCard, shareSlug, sessionToken, sharedPayload });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  if (proofDir) await mkdir(proofDir, { recursive: true });
  for (const vp of [
    { name: '390', width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '1280', width: 1280, height: 800, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  ]) {
    const chatPage = await browser.newPage();
    await chatPage.setViewport(vp);
    await chatPage.goto(`${server.origin}/chat-preview`, { waitUntil: 'networkidle2' });
    await chatPage.waitForSelector('[data-turn="latest"] [data-ts-request-changes-btn="1"]', { timeout: 20000 });
    const chatState = await chatPage.evaluate(() => {
      const oldEl = document.querySelector('[data-turn="old"] [data-ts-ai-approval-card="1"]');
      const curEl = document.querySelector('[data-turn="latest"] [data-ts-ai-approval-card="1"]');
      return {
        oldApproveDisabled: Boolean(oldEl?.querySelector('[data-ai-chat-approve]')?.disabled),
        oldReplacedPill: oldEl?.querySelector('[data-ai-approval-state="replaced"]')?.textContent?.trim() || '',
        hasChangesBlock: Boolean(curEl?.querySelector('[data-ts-preview-changes="1"]')),
        text: String(curEl?.innerText || ''),
        dayHeaders: [...(curEl?.querySelectorAll('[data-ts-preview-day-header="1"]') || [])].map((e) => e.textContent?.trim() || ''),
        ulCount: curEl ? curEl.querySelectorAll('ul').length : -1,
      };
    });
    assert.equal(chatState.oldApproveDisabled, true);
    assert.match(chatState.oldReplacedPill, /Replaced/i);
    assert.equal(chatState.hasChangesBlock, true);
    assertCleanPreviewCopy(chatState, `chat-${vp.name}`);
    if (proofDir) await chatPage.screenshot({ path: path.join(proofDir, `d10-updated-card-chat-${vp.name}.png`), fullPage: true });

    await chatPage.click('[data-turn="latest"] [data-ts-request-changes-btn="1"]');
    await chatPage.waitForSelector('[data-turn="latest"] [data-ts-request-changes-box="1"]:not([hidden])');
    await chatPage.type('[data-turn="latest"] [data-ts-request-changes-input="1"]', noteText);
    if (proofDir) await chatPage.screenshot({ path: path.join(proofDir, `d10-request-changes-box-chat-${vp.name}.png`), fullPage: true });
    if (vp.name === '1280') {
      await chatPage.click('[data-turn="latest"] [data-ts-request-changes-submit="1"]');
      await chatPage.waitForSelector('[data-turn="latest"] [data-ts-requested-changes="1"]', { timeout: 10000 });
      const savedText = await chatPage.$eval('[data-turn="latest"] [data-ts-requested-changes="1"]', (el) => el.innerText);
      assert.match(savedText, /morning coffee stop on Day 3/);
    }
    await chatPage.close();

    const approvePage = await browser.newPage();
    await approvePage.setViewport(vp);
    await approvePage.goto(`${server.origin}/vacation-app-next.html?token=${encodeURIComponent(shareSlug)}&aiPanel=approvals`, { waitUntil: 'networkidle2' });
    await approvePage.waitForSelector('[data-ts-request-changes-btn="1"]', { timeout: 20000 });
    const approveDom = await approvePage.evaluate(() => {
      const rootEl = document.querySelector('[data-ts-mcp-preview="1"]');
      return {
        text: String(rootEl?.innerText || ''),
        dayHeaders: [...(rootEl?.querySelectorAll('[data-ts-preview-day-header="1"]') || [])].map((e) => e.textContent?.trim() || ''),
        ulCount: rootEl ? rootEl.querySelectorAll('ul').length : -1,
      };
    });
    assertCleanPreviewCopy(approveDom, `approve-${vp.name}`);
    await approvePage.click('[data-ts-request-changes-btn="1"]');
    await approvePage.waitForSelector('[data-ts-request-changes-box="1"]');
    if (proofDir) await approvePage.screenshot({ path: path.join(proofDir, `d10-request-changes-box-approve-${vp.name}.png`) });
    await approvePage.close();

    const gridPage = await browser.newPage();
    await gridPage.setViewport(vp);
    await gridPage.goto(`${server.origin}/shared/${encodeURIComponent(shareSlug)}/?panel=ai-approvals`, { waitUntil: 'networkidle2' });
    await gridPage.waitForSelector('[data-ts-request-changes-btn="1"]', { timeout: 20000 });
    const gridDom = await gridPage.evaluate(() => {
      const rootEl = document.querySelector('[data-ts-mcp-preview="1"]');
      return {
        text: String(rootEl?.innerText || ''),
        dayHeaders: [...(rootEl?.querySelectorAll('[data-ts-preview-day-header="1"]') || [])].map((e) => e.textContent?.trim() || ''),
        ulCount: rootEl ? rootEl.querySelectorAll('ul').length : -1,
      };
    });
    assertCleanPreviewCopy(gridDom, `grid-${vp.name}`);
    await gridPage.click('[data-ts-request-changes-btn="1"]');
    await gridPage.waitForSelector('[data-ts-request-changes-box="1"]');
    await gridPage.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const mcpPreviewStatus = (await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, aiToken)).json.result.structuredContent;
assert.equal(mcpPreviewStatus.preview_version, 5);
assert.equal(mcpPreviewStatus.latest_change_request?.note, noteText);
assert.equal(mcpPreviewStatus.change_requests.some((r) => r.note === noteText), true);

const mcpReadDoc = (await mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, aiToken)).json.result.structuredContent;
const pendingEntry = mcpReadDoc.pending_previews.find((p) => p.draft_id === draftId);
assert.ok(pendingEntry);
assert.equal(pendingEntry.latest_change_request?.note, noteText);

const approveRes = await invokeRoute(apiHandler, {
  method: 'POST',
  url: `/api/mcp/changes/${draftId}/approve`,
  headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': sessionToken },
  body: { tripId: trip.id, shareToken: shareSlug, preview_hash: hashV5 },
});
assert.equal(approveRes.statusCode, 200);

const liveThings = db.tables.trip_things.filter((r) => r.trip_id === trip.id);
const bookshop = liveThings.find((r) => r.title === 'Pilgrim Way Bookshop');
const carmelBelle = liveThings.find((r) => r.title === 'Carmel Belle');
const untouchedInn = liveThings.find((r) => r.id === liveOnlyInn.id);
assert.equal(bookshop?.metadata?.dayDate, '2026-07-04');
assert.equal(bookshop?.metadata?.scheduled, true);
assert.equal(carmelBelle?.metadata?.startTime, '13:00');
assert.equal(untouchedInn?.metadata?.dayDate, '2026-07-03');

const liveBindings = db.tables.thing_media_bindings.filter((b) => b.share_token === shareSlug);
assert.equal(liveBindings.some((b) => b.metadata?.mcpMediaId === mediaIdByKey.get('day2UnmatchedVideo')), false);
const rescuedDayBinding = liveBindings.find((b) => b.metadata?.mcpMediaId === mediaIdByKey.get('undatedPhoto'));
assert.ok(rescuedDayBinding);
assert.equal(rescuedDayBinding.day_number, 2);
assert.equal(rescuedDayBinding.metadata?.assignedDayDate, '2026-07-04');
const rescuedThingBinding = liveBindings.find((b) => b.metadata?.mcpMediaId === mediaIdByKey.get('outOfRangePhoto'));
assert.ok(rescuedThingBinding);
assert.equal(rescuedThingBinding.metadata?.thingId, carmelBelle.id);
for (const b of liveBindings) {
  assert.ok(b.metadata?.thingId || (Number(b.day_number) > 0 && b.metadata?.assignedDayDate));
}

const afterApproveTurns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
  loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan', firstName: 'Jordan' }],
});
const finalCards = afterApproveTurns.map((t) => t.payload?.aiApprovalCard).filter((c) => c?.changeSetId === draftId);
assert.equal(finalCards.find((c) => c.previewHash === hashV1)?.status, 'replaced');
assert.equal(finalCards.find((c) => c.previewHash === hashV5)?.status, 'approved');

useSharedTripDatabase(null);
useVacationMcpDatabase(null);
setVacationMcpClock(null);
console.log('issue #1073 D10 request-changes tests passed');
