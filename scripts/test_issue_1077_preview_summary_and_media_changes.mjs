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
import { handlePendingPreviewChatTurn } from '../src/vacation/mcp-chat-preview-edit.mjs';
import { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { createMcpTestDb } from './lib/mcp-test-harness.mjs';
import { invokeRoute } from './lib/mcp-test-exif.mjs';
import { buildCarmelWeekendFixture, ensureVacationClientDist, resolveChromeExecutable } from './lib/c10-test-media.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const proofDir = process.env.PROOF_1077_DIR || '';
const FILE_EXT_RE = /\.(jpe?g|png|heic|mov|mp4)\b/i;

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch (error) {
    void error;
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const idx = haystack.indexOf(needle, offset);
    if (idx < 0) return count;
    count += 1;
    offset = idx + needle.length;
  }
}

assert.equal(FILE_EXT_RE.test('undated-dinner.jpg'), true);
assert.equal(FILE_EXT_RE.test('clip.MP4'), true);
assert.equal(FILE_EXT_RE.test('shot.HEIC'), true);
assert.equal(FILE_EXT_RE.test('photo.png'), true);
assert.equal(FILE_EXT_RE.test('surf.mov'), true);
assert.equal(FILE_EXT_RE.test("Moved a photo from Won't be imported to Day 2 · Sat, Jul 4"), false);

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

async function startServer({ latestCard, shareSlug, sessionToken, sharedPayload }) {
  ensureVacationClientDist(root);
  const distDir = path.join(root, 'apps/vacation-client/dist');
  const [viewerJs, gridPanelJs, chatAiJs, nextHtml] = await Promise.all([
    readFile(path.join(root, 'public/ts-pic-popup-viewer.js'), 'utf8'),
    readFile(path.join(root, 'public/ts-mcp-ai-access.js'), 'utf8'),
    readFile(path.join(root, 'public/vacation-app-ai-import.js'), 'utf8'),
    readFile(path.join(distDir, 'vacation-app-next.html'), 'utf8'),
  ]);
  const chatHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vacay Keepsake Chat</title><style>body{margin:0;padding:12px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}.stack{display:grid;gap:12px;max-width:720px;margin:0 auto}.bubble{border:1px solid #d9e0e8;border-radius:8px;padding:10px 12px;background:#fff}</style><script src="/ts-pic-popup-viewer.js"></script><script src="/vacation-app-ai-import.js"></script></head><body><div id="messages" class="stack"></div><script>const curCard=${JSON.stringify(latestCard)};const m=document.getElementById('messages');m.innerHTML='<article class="bubble" data-turn="latest"><small>Vacay Keepsake</small>Updated your pending preview.'+window.tsVacationAppAiImport.renderTurnCardHtml({payload:{aiApprovalCard:curCard}})+'</article>';window.tsVacationAppAiImport.bindMessages({getState:()=>({turns:[{payload:{aiApprovalCard:curCard}}],sending:false}),getSessionToken:()=>'',currentTrip:()=>({id:curCard.vacationId,shareToken:curCard.shareSlug}),loadApp:async()=>{}});</script></body></html>`;
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

async function auditSurface(page, { surfaceName, expectedHeading, expectedSummary, expectedChangeText, expectedMediaId, expectNoList }) {
  await page.waitForSelector('[data-ts-preview-changes="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('[data-ts-preview-changes="1"] img')];
    return imgs.length >= 1 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 20000 });

  const dom = await page.evaluate(() => {
    const panelEl = document.querySelector('[data-ts-mcp-panel="1"], [data-ts-ai-approval-card="1"]');
    const previewEl = document.querySelector('[data-ts-mcp-preview="1"], [data-ts-ai-approval-card="1"]');
    const changesEl = previewEl?.querySelector('[data-ts-preview-changes="1"]');
    const rows = [...(changesEl?.querySelectorAll('[data-ts-preview-change-row="1"]') || [])].map((row) => {
      const thumb = row.querySelector('[data-ts-preview-thumb="1"]');
      const img = thumb?.querySelector('img');
      return {
        text: String(row.innerText || '').replace(/\s+/g, ' ').trim(),
        mediaId: thumb?.getAttribute('data-media-id') || '',
        mediaKind: thumb?.getAttribute('data-media-kind') || '',
        imgLoaded: Boolean(img && img.complete && img.naturalWidth > 0),
      };
    });
    return {
      panelText: String(panelEl?.innerText || ''),
      previewText: String(previewEl?.innerText || ''),
      listCount: panelEl ? panelEl.querySelectorAll('.ts-mcp-list, .tsv-mcp-list').length : 0,
      rows,
    };
  });

  if (expectNoList) {
    assert.equal(dom.listCount, 0, `${surfaceName}: single preview must not render duplicate list card`);
  }
  assert.equal(
    countOccurrences(dom.panelText, expectedSummary),
    1,
    `${surfaceName}: E1 summary sentence must occur exactly once (got ${countOccurrences(dom.panelText, expectedSummary)})`,
  );
  assert.equal(
    countOccurrences(dom.panelText, expectedHeading),
    1,
    `${surfaceName}: E1 heading "${expectedHeading}" must occur exactly once (got ${countOccurrences(dom.panelText, expectedHeading)})`,
  );
  assert.doesNotMatch(dom.panelText, FILE_EXT_RE, `${surfaceName}: E3 file-name pattern leaked in panel text`);
  assert.doesNotMatch(dom.previewText, FILE_EXT_RE, `${surfaceName}: E3 file-name pattern leaked in preview text`);
  assert.match(dom.panelText, /\bvacation\b/i, `${surfaceName}: E4 must say vacation`);
  assert.match(dom.panelText, /\bAI\b/, `${surfaceName}: E4 must say AI`);
  assert.doesNotMatch(dom.panelText, /\btrips?\b/i, `${surfaceName}: E4 must never say trip`);

  const rescueRow = dom.rows.find((r) => r.text === expectedChangeText);
  assert.ok(rescueRow, `${surfaceName}: E2 expected change row "${expectedChangeText}" in ${JSON.stringify(dom.rows)}`);
  assert.equal(rescueRow.mediaId, expectedMediaId, `${surfaceName}: E2 rescued media thumbnail id mismatch`);
  assert.equal(rescueRow.mediaKind, 'photo', `${surfaceName}: E2 rescued media kind mismatch`);
  assert.equal(rescueRow.imgLoaded, true, `${surfaceName}: E2 rescued media thumbnail must render real image bytes`);
}

const db = createMcpTestDb();
useVacationMcpDatabase(db);
useSharedTripDatabase(db);
setVacationMcpClock(() => new Date('2026-11-21T10:00:00.000Z'));

const ownerId = crypto.randomUUID();
const sessionToken = 'sess-1077-carmel';
const trip = db.seedVacation({
  ownerCustomerId: ownerId,
  title: 'Carmel Weekend',
  destination: 'Carmel-by-the-Sea, CA',
  startDate: '2026-07-03',
  endDate: '2026-07-05',
  timezone: 'America/Los_Angeles',
});
const shareSlug = trip.metadata.publicSlug;
db.seedEditorSession({
  tripId: trip.id,
  ownerCustomerId: ownerId,
  email: 'throwaway-1077@example.test',
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

const previewV1 = (await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, aiToken)).json.result.structuredContent.preview;
assert.equal((await mcpRpc('tools/call', {
  name: 'commit_import',
  arguments: { draft_id: draftId, preview_hash: previewV1.preview_hash },
}, aiToken)).statusCode, 200);

const ownerSession = { customer_id: ownerId, email: 'throwaway-1077@example.test', first_name: 'Jordan', display_name: 'Jordan' };

const rescueThing = await handlePendingPreviewChatTurn(db, {
  session: ownerSession,
  trip,
  requestText: 'the winter archive photo was lunch on day 1',
});
assert.equal(rescueThing.previewVersion, 2);
assert.equal(
  rescueThing.appliedChanges[0],
  "Moved a photo from Won't be imported to Carmel Belle on Day 1 · Fri, Jul 3",
);
assert.doesNotMatch(rescueThing.reply, FILE_EXT_RE);

const rescueDay = await handlePendingPreviewChatTurn(db, {
  session: ownerSession,
  trip,
  requestText: 'the seashell photo was dinner on day 2',
});
assert.equal(rescueDay.previewVersion, 3);
const expectedDayRescueText = "Moved a photo from Won't be imported to Day 2 · Sat, Jul 4";
assert.equal(rescueDay.appliedChanges[0], expectedDayRescueText);
assert.doesNotMatch(rescueDay.reply, FILE_EXT_RE);

const turns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
  loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan', firstName: 'Jordan' }],
});
const latestCard = turns
  .map((t) => t.payload?.aiApprovalCard)
  .find((c) => c?.changeSetId === draftId && c.previewHash === rescueDay.previewHash);
assert.ok(latestCard);
const expectedSummary = latestCard.summary;
assert.match(expectedSummary, /^Ready to update vacation "Carmel Weekend" with /);

const sharedPayload = {
  trip: { id: 1077, title: 'Carmel Weekend', destination: 'Carmel-by-the-Sea, CA', start_date: '2026-07-03', end_date: '2026-07-05' },
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

const server = await startServer({ latestCard, shareSlug, sessionToken, sharedPayload });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  if (proofDir) await mkdir(proofDir, { recursive: true });
  const expectedMediaId = mediaIdByKey.get('undatedPhoto');
  for (const vp of [
    { name: '390', width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '1280', width: 1280, height: 800, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  ]) {
    const chatPage = await browser.newPage();
    await chatPage.setViewport(vp);
    await chatPage.goto(`${server.origin}/chat-preview`, { waitUntil: 'networkidle2' });
    await auditSurface(chatPage, {
      surfaceName: `chat-${vp.name}`,
      expectedHeading: 'Vacation draft import',
      expectedSummary,
      expectedChangeText: expectedDayRescueText,
      expectedMediaId,
      expectNoList: true,
    });
    if (proofDir) await chatPage.screenshot({ path: path.join(proofDir, `1077-chat-${vp.name}.png`), fullPage: true });
    await chatPage.close();

    const approvePage = await browser.newPage();
    await approvePage.setViewport(vp);
    await approvePage.goto(`${server.origin}/vacation-app-next.html?token=${encodeURIComponent(shareSlug)}&aiPanel=approvals`, { waitUntil: 'networkidle2' });
    await auditSurface(approvePage, {
      surfaceName: `approve-${vp.name}`,
      expectedHeading: 'Vacation draft import',
      expectedSummary,
      expectedChangeText: expectedDayRescueText,
      expectedMediaId,
      expectNoList: true,
    });
    if (proofDir) await approvePage.screenshot({ path: path.join(proofDir, `1077-approve-${vp.name}.png`) });
    await approvePage.close();

    const gridPage = await browser.newPage();
    await gridPage.setViewport(vp);
    await gridPage.goto(`${server.origin}/shared/${encodeURIComponent(shareSlug)}/?panel=ai-approvals`, { waitUntil: 'networkidle2' });
    await auditSurface(gridPage, {
      surfaceName: `grid-${vp.name}`,
      expectedHeading: 'Draft vacation import',
      expectedSummary,
      expectedChangeText: expectedDayRescueText,
      expectedMediaId,
      expectNoList: true,
    });
    if (proofDir) await gridPage.screenshot({ path: path.join(proofDir, `1077-grid-approvals-${vp.name}.png`), fullPage: true });
    await gridPage.close();
  }

  const secondStart = await mcpRpc('tools/call', { name: 'start_import', arguments: { ...draft, apply_mode: 'populate_scoped' } }, aiToken);
  const secondDraftId = secondStart.json.result.structuredContent.draft_id;
  const secondPreview = (await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: secondDraftId } }, aiToken)).json.result.structuredContent.preview;
  await mcpRpc('tools/call', { name: 'commit_import', arguments: { draft_id: secondDraftId, preview_hash: secondPreview.preview_hash } }, aiToken);
  await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${secondDraftId}/decline`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': sessionToken },
    body: { tripId: trip.id, shareToken: shareSlug },
  });

  const multiGrid = await browser.newPage();
  await multiGrid.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await multiGrid.goto(`${server.origin}/shared/${encodeURIComponent(shareSlug)}/?panel=ai-approvals`, { waitUntil: 'networkidle2' });
  await auditSurface(multiGrid, {
    surfaceName: 'grid-multi-390',
    expectedHeading: 'Draft vacation import',
    expectedSummary,
    expectedChangeText: expectedDayRescueText,
    expectedMediaId,
    expectNoList: false,
  });
  await multiGrid.close();

  const multiApprove = await browser.newPage();
  await multiApprove.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await multiApprove.goto(`${server.origin}/vacation-app-next.html?token=${encodeURIComponent(shareSlug)}&aiPanel=approvals`, { waitUntil: 'networkidle2' });
  await auditSurface(multiApprove, {
    surfaceName: 'approve-multi-1280',
    expectedHeading: 'Vacation draft import',
    expectedSummary,
    expectedChangeText: expectedDayRescueText,
    expectedMediaId,
    expectNoList: false,
  });
  await multiApprove.close();
} finally {
  await browser.close();
  await server.close();
}

useSharedTripDatabase(null);
useVacationMcpDatabase(null);
setVacationMcpClock(null);
console.log('issue #1077 preview summary and media changes tests passed');
