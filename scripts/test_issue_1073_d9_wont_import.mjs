#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiHandler from '../api/[...route].mjs';
import { setVacationMcpClock, useVacationMcpDatabase } from '../routes/vacation-mcp.mjs';
import { intakeSharedResponse, useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { createMcpTestDb } from './lib/mcp-test-harness.mjs';
import { buildJpegWithExif, buildPlainJpeg, invokeRoute } from './lib/mcp-test-exif.mjs';
import { buildCarmelWeekendFixture, ensureVacationClientDist, resolveChromeExecutable } from './lib/c10-test-media.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));

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

async function startSurfaceServer({ approvalCard, shareSlug, sessionToken, sharedPayload }) {
  ensureVacationClientDist(root);
  const distDir = path.join(root, 'apps/vacation-client/dist');
  const [viewerJs, gridPanelJs, chatAiJs, nextHtml] = await Promise.all([
    readFile(path.join(root, 'public/ts-pic-popup-viewer.js'), 'utf8'),
    readFile(path.join(root, 'public/ts-mcp-ai-access.js'), 'utf8'),
    readFile(path.join(root, 'public/vacation-app-ai-import.js'), 'utf8'),
    readFile(path.join(distDir, 'vacation-app-next.html'), 'utf8'),
  ]);
  const chatHarnessHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vacay Keepsake Chat</title><script src="/ts-pic-popup-viewer.js"></script><script src="/vacation-app-ai-import.js"></script></head><body><div id="messages"></div><script>const card=${JSON.stringify(approvalCard)};const m=document.getElementById('messages');m.innerHTML='<article class="bubble">'+window.tsVacationAppAiImport.renderTurnCardHtml({payload:{aiApprovalCard:card}})+'</article>';window.tsVacationAppAiImport.bindMessages({getState:()=>({turns:[{payload:{aiApprovalCard:card}}],sending:false}),getSessionToken:()=>'',currentTrip:()=>({id:card.vacationId,shareToken:card.shareSlug}),loadApp:async()=>{}});</script></body></html>`;
  const gridHarnessHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carmel Weekend</title><script>window.__TS_SHARED_BOOT_SLUG__=${JSON.stringify(shareSlug)};</script><script src="/ts-pic-popup-viewer.js"></script><script src="/ts-mcp-ai-access.js"></script></head><body></body></html>`;

  const server = createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(urlObj.pathname);
    if (pathname === '/chat-preview') return send(res, 200, chatHarnessHtml, 'text/html; charset=utf-8');
    if (pathname === `/shared/${shareSlug}/` || pathname === `/shared/${shareSlug}`) return send(res, 200, gridHarnessHtml, 'text/html; charset=utf-8');
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
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function auditD9Surface(page, surfaceName, expectedSkippedIds) {
  await page.waitForSelector('[data-ts-mcp-preview-wont-import="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('[data-ts-mcp-preview-wont-import="1"] img')];
    return imgs.length === 2 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 20000 });

  const dom = await page.evaluate(() => {
    const rootEl = document.querySelector('[data-ts-mcp-preview="1"], [data-ts-ai-approval-card="1"]');
    const panelEl = document.querySelector('[data-ts-mcp-panel="1"], [data-ts-ai-approval-card="1"]');
    const block = rootEl?.querySelector('[data-ts-mcp-preview-wont-import="1"]');
    const thumbs = block ? [...block.querySelectorAll('[data-ts-preview-thumb="1"]')] : [];
    const placedIds = [...(rootEl?.querySelectorAll('[data-ts-media-strip="thing"] [data-ts-preview-thumb="1"], [data-ts-media-strip="day"] [data-ts-preview-thumb="1"]') || [])]
      .map((el) => el.getAttribute('data-media-id') || '');
    return {
      panelText: String(panelEl?.innerText || ''),
      hasLegacyUnplacedEl: Boolean(rootEl?.querySelector('[data-ts-mcp-preview-unplaced]')),
      heading: block?.querySelector('h4')?.textContent?.trim() || '',
      note: block?.querySelector('[data-ts-wont-import-note="1"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      skippedIds: thumbs.map((el) => el.getAttribute('data-media-id') || '').sort(),
      placedIds,
    };
  });

  assert.doesNotMatch(dom.panelText, /not placed yet/i, `${surfaceName}: preview DOM must never contain Not placed yet`);
  assert.equal(dom.hasLegacyUnplacedEl, false, `${surfaceName}: legacy unplaced container must not exist`);
  assert.equal(dom.heading, "Won't be imported", `${surfaceName}: Won't be imported heading required`);
  assert.equal(
    dom.note,
    "These 2 photos don't have a date during this vacation, so they won't be imported.",
    `${surfaceName}: Won't be imported plain line mismatch`,
  );
  assert.deepEqual(dom.skippedIds, expectedSkippedIds, `${surfaceName}: Won't be imported must list exact skipped files`);
  for (const skippedId of expectedSkippedIds) {
    assert.equal(dom.placedIds.includes(skippedId), false, `${surfaceName}: skipped media ${skippedId} must not appear under any Day or Thing`);
  }
}

for (const rel of [
  'src/vacation/mcp-preview.mjs',
  'src/vacation/mcp-preview-common.mjs',
  'src/vacation/mcp-apply.mjs',
  'src/vacation/mcp-chat-import.mjs',
  'src/vacation/mcp-read.mjs',
  'apps/vacation-client/src/components/McpApprovalPanel.tsx',
  'apps/vacation-client/src/lib/mcpPanelModel.mjs',
  'public/ts-mcp-ai-access.js',
  'public/vacation-app-ai-import.js',
]) {
  const src = await readFile(path.join(root, rel), 'utf8');
  assert.doesNotMatch(src, /not placed yet/i, `${rel} must not contain Not placed yet`);
}

const db = createMcpTestDb();
useVacationMcpDatabase(db);
useSharedTripDatabase(db);
setVacationMcpClock(() => new Date('2026-11-20T18:00:00.000Z'));

const ownerId = crypto.randomUUID();
const sessionToken = 'sess-1073-d9';
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
  email: 'throwaway-d9@example.test',
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
assert.equal(reqUpload.statusCode, 200);
const slots = reqUpload.json.result.structuredContent.uploads;
const mediaIdByKey = new Map();
for (let i = 0; i < slots.length; i += 1) {
  mediaIdByKey.set(mediaFiles[i].key, slots[i].media_id);
  const parsed = new URL(slots[i].upload_url);
  const putRes = await invokeRoute(apiHandler, {
    method: 'PUT',
    url: parsed.pathname + parsed.search,
    headers: { 'content-type': mediaFiles[i].mime_type },
    body: mediaFiles[i].bytes,
  });
  assert.equal(putRes.statusCode, 200);
}

const finRes = await mcpRpc('tools/call', {
  name: 'upload_media',
  arguments: { action: 'finalize', draft_id: draftId, media_ids: slots.map((s) => s.media_id) },
}, aiToken);
assert.equal(finRes.statusCode, 200);

const previewRes = await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, aiToken);
assert.equal(previewRes.statusCode, 200);
const preview = previewRes.json.result.structuredContent.preview;
const expectedSkippedIds = [mediaIdByKey.get('undatedPhoto'), mediaIdByKey.get('outOfRangePhoto')].sort();

assert.equal(preview.unplaced_media, undefined);
assert.equal(preview.media.length, 6, 'preview.media must include only imported media');
assert.equal(preview.counts.media, 6);
assert.equal(preview.skipped_media.length, 2);
assert.deepEqual(preview.skipped_media.map((m) => m.media_id).sort(), expectedSkippedIds);
assert.equal(
  preview.skipped_media_note,
  "These 2 photos don't have a date during this vacation, so they won't be imported.",
);
assert.doesNotMatch(JSON.stringify(preview), /not placed yet/i);

const commitRes = await mcpRpc('tools/call', {
  name: 'commit_import',
  arguments: { draft_id: draftId, preview_hash: preview.preview_hash },
}, aiToken);
assert.equal(commitRes.statusCode, 200);

const ownerSession = { customer_id: ownerId, email: 'throwaway-d9@example.test' };
const turns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
  loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan', firstName: 'Jordan' }],
});
const approvalCard = turns.find((t) => t.payload?.aiApprovalCard?.changeSetId === draftId)?.payload?.aiApprovalCard;
assert.ok(approvalCard);
assert.equal(approvalCard.unplacedMedia, undefined);
assert.deepEqual(approvalCard.skippedMedia.map((m) => m.media_id).sort(), expectedSkippedIds);
assert.equal(
  approvalCard.skippedMediaNote,
  "These 2 photos don't have a date during this vacation, so they won't be imported.",
);

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

const server = await startSurfaceServer({ approvalCard, shareSlug, sessionToken, sharedPayload });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  for (const vp of [
    { name: '390', width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '1280', width: 1280, height: 800, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  ]) {
    const chatPage = await browser.newPage();
    await chatPage.setViewport(vp);
    await chatPage.goto(`${server.origin}/chat-preview`, { waitUntil: 'networkidle2' });
    await auditD9Surface(chatPage, `in-chat-card-${vp.name}`, expectedSkippedIds);
    await chatPage.close();

    const approvePage = await browser.newPage();
    await approvePage.setViewport(vp);
    await approvePage.goto(`${server.origin}/vacation-app-next.html?token=${encodeURIComponent(shareSlug)}&aiPanel=approvals`, { waitUntil: 'networkidle2' });
    await auditD9Surface(approvePage, `approve-screen-${vp.name}`, expectedSkippedIds);
    await approvePage.close();

    const gridPage = await browser.newPage();
    await gridPage.setViewport(vp);
    await gridPage.goto(`${server.origin}/shared/${encodeURIComponent(shareSlug)}/?panel=ai-approvals`, { waitUntil: 'networkidle2' });
    await auditD9Surface(gridPage, `grid-admin-${vp.name}`, expectedSkippedIds);
    await gridPage.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const approveRes = await invokeRoute(apiHandler, {
  method: 'POST',
  url: `/api/mcp/changes/${draftId}/approve`,
  headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': sessionToken },
  body: { tripId: trip.id, shareToken: shareSlug, preview_hash: preview.preview_hash },
});
assert.equal(approveRes.statusCode, 200);
assert.equal(approveRes.json.result.mediaPublished, 6);
assert.equal(approveRes.json.result.mediaSkipped, 2);

const liveBindings = db.tables.thing_media_bindings.filter((b) => b.share_token === shareSlug);
assert.equal(liveBindings.length, 6, 'approve must only store media attached to a day or Thing');
for (const binding of liveBindings) {
  const hasThing = Boolean(binding.metadata?.thingId);
  const hasDay = Number(binding.day_number) > 0 && Boolean(binding.metadata?.assignedDayDate);
  assert.ok(hasThing || hasDay, `stored media ${binding.original_name} has neither day nor Thing`);
  assert.notEqual(binding.metadata?.assignmentBucket, 'unassigned');
  assert.equal(expectedSkippedIds.includes(binding.metadata?.mcpMediaId), false, 'skipped media must never be stored');
}

const served = await intakeSharedResponse(shareSlug, db);
assert.equal((served.media || []).length, 6, 'live vacation payload must expose only imported media');
for (const entry of served.media || []) {
  assert.ok(entry.place_id || entry.day_id, 'every live media entry must belong to a day or Thing');
}

const readDoc = (await mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, aiToken)).json.result.structuredContent;
assert.equal(readDoc.media.length, 6);
for (const entry of readDoc.media) {
  assert.ok(entry.thing_id || (entry.day_number && entry.day_date), 'read_vacation media must attach to a day or Thing');
  assert.notEqual(entry.assignment_bucket, 'unassigned');
}

const editUpload = await mcpRpc('tools/call', {
  name: 'upload_media',
  arguments: {
    action: 'request_upload',
    files: [
      { filename: 'edit-undated.jpg', mime_type: 'image/jpeg', media_kind: 'photo', caption: 'No date' },
      { filename: 'edit-day1.jpg', mime_type: 'image/jpeg', media_kind: 'photo', caption: 'Day 1 sunset' },
    ],
  },
}, aiToken);
const [editSkipSlot, editDaySlot] = editUpload.json.result.structuredContent.uploads;
for (const [slot, bytes] of [
  [editSkipSlot, buildPlainJpeg()],
  [editDaySlot, buildJpegWithExif({ dateTimeOriginal: '2026:07:03 18:30:00', offsetTimeOriginal: '-07:00' })],
]) {
  const u = new URL(slot.upload_url);
  assert.equal((await invokeRoute(apiHandler, { method: 'PUT', url: u.pathname + u.search, headers: { 'content-type': 'image/jpeg' }, body: bytes })).statusCode, 200);
}
const editFin = await mcpRpc('tools/call', { name: 'upload_media', arguments: { action: 'finalize', media_ids: [editSkipSlot.media_id, editDaySlot.media_id] } }, aiToken);
assert.equal(editFin.statusCode, 200);

const editRes = await mcpRpc('tools/call', {
  name: 'update_vacation',
  arguments: {
    summary: 'Attach vacation photos',
    operations: [
      { op: 'attach_media', media_id: editSkipSlot.media_id },
      { op: 'attach_media', media_id: editDaySlot.media_id },
    ],
  },
}, aiToken);
assert.equal(editRes.statusCode, 200);
const editPreview = editRes.json.result.structuredContent.preview;
assert.equal(editPreview.media.length, 1);
assert.equal(editPreview.skipped_media.length, 1);
assert.equal(editPreview.skipped_media[0].media_id, editSkipSlot.media_id);
assert.equal(
  editPreview.skipped_media_note,
  "This photo doesn't have a date during this vacation, so it won't be imported.",
);

const editApprove = await invokeRoute(apiHandler, {
  method: 'POST',
  url: `/api/mcp/changes/${editRes.json.result.structuredContent.change_set_id}/approve`,
  headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': sessionToken },
  body: { tripId: trip.id, shareToken: shareSlug, preview_hash: editPreview.preview_hash },
});
assert.equal(editApprove.statusCode, 200);
assert.equal(editApprove.json.result.applied.mediaAttached, 1);
assert.equal(editApprove.json.result.applied.mediaSkipped, 1);

const bindingsAfterEdit = db.tables.thing_media_bindings.filter((b) => b.share_token === shareSlug);
assert.equal(bindingsAfterEdit.length, 7);
assert.equal(bindingsAfterEdit.some((b) => b.metadata?.mcpMediaId === editSkipSlot.media_id), false);
assert.equal(bindingsAfterEdit.some((b) => b.metadata?.mcpMediaId === editDaySlot.media_id && b.day_number === 1), true);
for (const binding of bindingsAfterEdit) {
  const hasThing = Boolean(binding.metadata?.thingId);
  const hasDay = Number(binding.day_number) > 0 && Boolean(binding.metadata?.assignedDayDate);
  assert.ok(hasThing || hasDay, 'no media may be stored without a day or Thing after targeted edit approve');
}

useSharedTripDatabase(null);
useVacationMcpDatabase(null);
setVacationMcpClock(null);
console.log('issue #1073 D9 wont-be-imported tests passed');
