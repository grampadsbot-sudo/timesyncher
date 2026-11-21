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
import { intakeSharedResponse, useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { createMcpTestDb } from './lib/mcp-test-harness.mjs';
import { invokeRoute } from './lib/mcp-test-exif.mjs';
import { buildCarmelWeekendFixture, ensureVacationClientDist, resolveChromeExecutable } from './lib/c10-test-media.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const proofDir = process.env.C10_PROOF_DIR || '';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const chatHarnessHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vacay Keepsake Chat</title><style>body{margin:0;padding:12px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}.bubble{border:1px solid #d9e0e8;border-radius:8px;padding:10px 12px;background:#fff}</style><script src="/ts-pic-popup-viewer.js"></script><script src="/vacation-app-ai-import.js"></script></head><body><div id="messages"></div><script>const card=${JSON.stringify(approvalCard)};const m=document.getElementById('messages');m.innerHTML='<article class="bubble"><small>Vacay Keepsake</small>Your AI staged a preview for your review.'+window.tsVacationAppAiImport.renderTurnCardHtml({payload:{aiApprovalCard:card}})+'</article>';window.tsVacationAppAiImport.bindMessages({getState:()=>({turns:[{payload:{aiApprovalCard:card}}],sending:false}),getSessionToken:()=>'',currentTrip:()=>({id:card.vacationId,shareToken:card.shareSlug}),loadApp:async()=>{}});</script></body></html>`;
  const gridHarnessHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carmel Weekend</title><script>window.__TS_SHARED_BOOT_SLUG__=${JSON.stringify(shareSlug)};</script><script src="/ts-pic-popup-viewer.js"></script><script src="/ts-mcp-ai-access.js"></script></head><body style="margin:0;background:#eef1f4"></body></html>`;

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

async function auditSurfaceInPage(page, surfaceName, bannedFilenames) {
  await page.waitForSelector('[data-ts-mcp-preview-days="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('[data-ts-preview-thumb="1"] img')];
    return imgs.length >= 6 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 20000 });

  const audit = await page.evaluate((filenames) => {
    const rootEl = document.querySelector('[data-ts-mcp-preview="1"], [data-ts-ai-approval-card="1"]');
    const visibleText = String(rootEl?.innerText || '');
    const thingThumbs = (ref) => {
      const li = rootEl?.querySelector(`[data-ts-preview-thing="${ref}"]`);
      if (!li) return { found: false, photos: 0, videos: 0, playBadges: 0 };
      const thumbs = [...li.querySelectorAll('[data-ts-preview-thumb="1"]')];
      return {
        found: true,
        photos: thumbs.filter((t) => t.getAttribute('data-media-kind') === 'photo').length,
        videos: thumbs.filter((t) => t.getAttribute('data-media-kind') === 'video').length,
        playBadges: li.querySelectorAll('[data-ts-media-play-badge="1"]').length,
        videoEls: li.querySelectorAll('video').length,
      };
    };
    const day2 = rootEl?.querySelector('[data-ts-preview-day="2026-07-04"]');
    const day2Direct = day2?.querySelector('[data-ts-media-strip="day"]');
    const day2Thumbs = day2Direct ? [...day2Direct.querySelectorAll('[data-ts-preview-thumb="1"]')] : [];
    const unplacedBlock = rootEl?.querySelector('[data-ts-mcp-preview-unplaced="1"]');
    const unplacedThumbs = unplacedBlock ? [...unplacedBlock.querySelectorAll('[data-ts-preview-thumb="1"]')] : [];
    const leakedFilenames = filenames.filter((name) => visibleText.toLowerCase().includes(name.toLowerCase()));
    const hasMediaAttachmentsHeading = /media attachments/i.test(visibleText);
    const hasByteSizeText = /\b\d+(?:\.\d+)?\s*(?:kb|mb|bytes)\b/i.test(visibleText);
    const hasExifOrGpsText = /\b(?:exif|gps)\b/i.test(visibleText);
    return {
      carmelBelle: thingThumbs('rest-carmel-belle'),
      pointLobos: thingThumbs('act-point-lobos'),
      pilgrims: thingThumbs('store-pilgrims'),
      day2DirectCount: day2Thumbs.length,
      day2DirectPhotos: day2Thumbs.filter((t) => t.getAttribute('data-media-kind') === 'photo').length,
      day2DirectVideos: day2Thumbs.filter((t) => t.getAttribute('data-media-kind') === 'video').length,
      day2PlayBadges: day2Direct ? day2Direct.querySelectorAll('[data-ts-media-play-badge="1"]').length : 0,
      unplacedHeading: unplacedBlock?.querySelector('h4')?.textContent?.trim() || '',
      unplacedCount: unplacedThumbs.length,
      leakedFilenames,
      hasMediaAttachmentsHeading,
      hasByteSizeText,
      hasExifOrGpsText,
    };
  }, bannedFilenames);

  assert.equal(audit.carmelBelle.found, true, `${surfaceName}: Carmel Belle missing`);
  assert.equal(audit.carmelBelle.photos, 1, `${surfaceName}: Carmel Belle photo thumb missing`);
  assert.equal(audit.pointLobos.found, true, `${surfaceName}: Point Lobos missing`);
  assert.equal(audit.pointLobos.photos, 1, `${surfaceName}: Point Lobos photo thumb missing`);
  assert.equal(audit.pointLobos.videos, 1, `${surfaceName}: Point Lobos video thumb missing`);
  assert.equal(audit.pointLobos.playBadges, 1, `${surfaceName}: Point Lobos video play badge missing`);
  assert.equal(audit.pointLobos.videoEls, 1, `${surfaceName}: Point Lobos video poster element missing`);
  assert.equal(audit.pilgrims.found, true, `${surfaceName}: long-list Pilgrim Way Bookshop missing`);
  assert.equal(audit.pilgrims.photos, 1, `${surfaceName}: long-list item photo thumb missing`);
  assert.equal(audit.day2DirectCount, 2, `${surfaceName}: Day 2 unmatched photo+video must show directly under Day 2`);
  assert.equal(audit.day2DirectPhotos, 1, `${surfaceName}: Day 2 unmatched photo missing`);
  assert.equal(audit.day2DirectVideos, 1, `${surfaceName}: Day 2 unmatched video missing`);
  assert.equal(audit.day2PlayBadges, 1, `${surfaceName}: Day 2 video play badge missing`);
  assert.equal(audit.unplacedHeading, 'Not placed yet', `${surfaceName}: Not placed yet heading missing`);
  assert.equal(audit.unplacedCount, 2, `${surfaceName}: only no-date + out-of-vacation media belong in Not placed yet`);
  assert.deepEqual(audit.leakedFilenames, [], `${surfaceName}: leaked filenames`);
  assert.equal(audit.hasMediaAttachmentsHeading, false, `${surfaceName}: Media attachments list must be removed`);
  assert.equal(audit.hasByteSizeText, false, `${surfaceName}: byte sizes must not appear`);
  assert.equal(audit.hasExifOrGpsText, false, `${surfaceName}: EXIF/GPS text must not appear`);
}

async function testViewerFlow(page, surfaceName, screenshotPath = '') {
  const firstLobosThumb = '[data-ts-preview-thing="act-point-lobos"] [data-ts-preview-thumb="1"]';
  await page.click(firstLobosThumb);
  await page.waitForSelector('[data-ts-pic-fs-overlay="1"]', { timeout: 10000 });
  await sleep(200);

  const openState = await page.evaluate(() => {
    const overlay = document.querySelector('[data-ts-pic-fs-overlay="1"]');
    const media = overlay?.querySelector('[data-ts-pic-fs-img="1"]');
    const counter = overlay?.querySelector('[data-ts-pic-fs-counter="1"]')?.textContent?.trim() || '';
    return {
      open: Boolean(overlay),
      tag: media?.tagName || '',
      naturalWidth: media?.tagName === 'IMG' ? media.naturalWidth : 0,
      counter,
      hasNext: Boolean(overlay?.querySelector('[data-ts-pic-fs-next="1"]')),
      hasClose: Boolean(overlay?.querySelector('[data-ts-pic-fs-exit="1"]')),
    };
  });
  assert.equal(openState.open, true, `${surfaceName}: viewer must open`);
  assert.equal(openState.tag, 'IMG', `${surfaceName}: first Point Lobos item must be photo IMG`);
  assert.ok(openState.naturalWidth > 0, `${surfaceName}: viewer photo must render real image bytes`);
  assert.equal(openState.counter, '1 / 2', `${surfaceName}: viewer must be scoped to Point Lobos (2 items)`);
  assert.equal(openState.hasNext, true, `${surfaceName}: viewer must have Next control`);
  assert.equal(openState.hasClose, true, `${surfaceName}: viewer must have Close control`);
  if (screenshotPath) await page.screenshot({ path: screenshotPath });

  await page.click('[data-ts-pic-fs-next="1"]');
  await sleep(250);
  const nextState = await page.evaluate(() => {
    const overlay = document.querySelector('[data-ts-pic-fs-overlay="1"]');
    const media = overlay?.querySelector('[data-ts-pic-fs-img="1"]');
    const counter = overlay?.querySelector('[data-ts-pic-fs-counter="1"]')?.textContent?.trim() || '';
    return {
      tag: media?.tagName || '',
      controls: Boolean(media?.controls),
      src: media?.getAttribute('src') || '',
      counter,
    };
  });
  assert.equal(nextState.tag, 'VIDEO', `${surfaceName}: Next must advance to Point Lobos video`);
  assert.equal(nextState.controls, true, `${surfaceName}: viewer video must have playback controls`);
  assert.ok(nextState.src.includes('/api/mcp/media/'), `${surfaceName}: viewer video must point to real media URL`);
  assert.equal(nextState.counter, '2 / 2', `${surfaceName}: counter must advance to 2 / 2`);

  await page.evaluate(() => {
    const overlay = document.querySelector('[data-ts-pic-fs-overlay="1"]');
    if (overlay && typeof Touch === 'function' && typeof TouchEvent === 'function') {
      const t1 = new Touch({ identifier: 1, target: overlay, clientX: 80, clientY: 300 });
      const t2 = new Touch({ identifier: 1, target: overlay, clientX: 240, clientY: 300 });
      overlay.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t1], changedTouches: [t1] }));
      overlay.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t2] }));
    }
  });
  await sleep(150);
  const swipedCounter = await page.evaluate(() => document.querySelector('[data-ts-pic-fs-counter="1"]')?.textContent?.trim() || '');
  assert.equal(swipedCounter, '1 / 2', `${surfaceName}: swipe must move back to item 1 / 2`);

  await page.click('[data-ts-pic-fs-exit="1"]');
  await sleep(150);
  const closed = await page.evaluate(() => ({
    overlay: Boolean(document.querySelector('[data-ts-pic-fs-overlay="1"]')),
    fsActive: Boolean(window.__tsPicFsActive),
  }));
  assert.equal(closed.overlay, false, `${surfaceName}: Close must dismiss viewer`);
  assert.equal(closed.fsActive, false, `${surfaceName}: __tsPicFsActive must clear on close`);
}

const db = createMcpTestDb();
useVacationMcpDatabase(db);
useSharedTripDatabase(db);
setVacationMcpClock(() => new Date('2026-11-20T18:00:00.000Z'));

const ownerId = crypto.randomUUID();
const sessionToken = 'sess-c10-carmel';
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
  email: 'throwaway-c10@example.test',
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
  const slot = slots[i];
  const file = mediaFiles[i];
  mediaIdByKey.set(file.key, slot.media_id);
  const parsed = new URL(slot.upload_url);
  const putRes = await invokeRoute(apiHandler, {
    method: 'PUT',
    url: parsed.pathname + parsed.search,
    headers: { 'content-type': file.mime_type },
    body: file.bytes,
  });
  assert.equal(putRes.statusCode, 200, `upload PUT failed for ${file.filename}`);
}

const finRes = await mcpRpc('tools/call', {
  name: 'upload_media',
  arguments: { action: 'finalize', draft_id: draftId, media_ids: slots.map((s) => s.media_id) },
}, aiToken);
assert.equal(finRes.statusCode, 200);

const previewRes = await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, aiToken);
assert.equal(previewRes.statusCode, 200);
const preview = previewRes.json.result.structuredContent.preview;
const day2Preview = preview.days.find((d) => d.date === '2026-07-04');
assert.equal(day2Preview.day_media.length, 2, 'unmatched Day 2 photo and video must attach to Day 2 in preview');
assert.deepEqual(
  day2Preview.day_media.map((m) => m.media_id).sort(),
  [mediaIdByKey.get('day2UnmatchedPhoto'), mediaIdByKey.get('day2UnmatchedVideo')].sort(),
);
assert.equal(preview.unplaced_media.length, 2, 'only no-date and out-of-vacation media belong in unplaced_media');
assert.deepEqual(
  preview.unplaced_media.map((m) => m.media_id).sort(),
  [mediaIdByKey.get('undatedPhoto'), mediaIdByKey.get('outOfRangePhoto')].sort(),
);
for (const line of preview.missing || []) {
  assert.doesNotMatch(line, /\b(?:exif|gps)\b/i);
}

const commitRes = await mcpRpc('tools/call', {
  name: 'commit_import',
  arguments: { draft_id: draftId, preview_hash: preview.preview_hash },
}, aiToken);
assert.equal(commitRes.statusCode, 200);

const ownerSession = { customer_id: ownerId, email: 'throwaway-c10@example.test' };
const turns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
  loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan', firstName: 'Jordan' }],
});
const approvalCard = turns.find((t) => t.payload?.aiApprovalCard?.changeSetId === draftId)?.payload?.aiApprovalCard;
assert.ok(approvalCard, 'in-chat approval card must be posted');
assert.equal(approvalCard.days.find((d) => d.date === '2026-07-04').day_media.length, 2);
assert.equal(approvalCard.unplacedMedia.length, 2);

const sharedPayload = {
  trip: { id: 1070, title: 'Carmel Weekend', destination: 'Carmel-by-the-Sea, CA', start_date: '2026-07-03', end_date: '2026-07-05' },
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

const bannedFilenames = mediaFiles.map((f) => f.filename);
const server = await startSurfaceServer({ approvalCard, shareSlug, sessionToken, sharedPayload });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  if (proofDir) await mkdir(proofDir, { recursive: true });

  const chatPage = await browser.newPage();
  await chatPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await chatPage.goto(`${server.origin}/chat-preview`, { waitUntil: 'networkidle2' });
  await auditSurfaceInPage(chatPage, 'in-chat-card-390', bannedFilenames);
  if (proofDir) await chatPage.screenshot({ path: path.join(proofDir, 'c10-carmel-chat-390.png'), fullPage: true });
  await testViewerFlow(chatPage, 'in-chat-card-390');
  await chatPage.close();

  const approvePage = await browser.newPage();
  await approvePage.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await approvePage.goto(`${server.origin}/vacation-app-next.html?token=${encodeURIComponent(shareSlug)}&aiPanel=approvals`, { waitUntil: 'networkidle2' });
  await auditSurfaceInPage(approvePage, 'approve-screen-1280', bannedFilenames);
  if (proofDir) await approvePage.screenshot({ path: path.join(proofDir, 'c10-carmel-approve-screen-1280.png') });
  await testViewerFlow(approvePage, 'approve-screen-1280');
  await approvePage.close();

  for (const vp of [
    { name: '390', width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '1280', width: 1280, height: 800, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  ]) {
    const gridPage = await browser.newPage();
    await gridPage.setViewport(vp);
    await gridPage.goto(`${server.origin}/shared/${encodeURIComponent(shareSlug)}/?panel=ai-approvals`, { waitUntil: 'networkidle2' });
    await auditSurfaceInPage(gridPage, `grid-admin-${vp.name}`, bannedFilenames);
    if (proofDir) {
      await gridPage.evaluate(() => {
        const el = document.querySelector('[data-ts-mcp-preview-days="1"]');
        el?.scrollIntoView({ block: 'start' });
      });
      await sleep(150);
      await gridPage.screenshot({ path: path.join(proofDir, `c10-carmel-preview-${vp.name}.png`) });
    }
    await testViewerFlow(
      gridPage,
      `grid-admin-${vp.name}`,
      proofDir && vp.name === '390' ? path.join(proofDir, 'c10-carmel-viewer-390.png') : '',
    );
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

const liveBindings = db.tables.thing_media_bindings.filter((b) => b.share_token === shareSlug);
assert.equal(liveBindings.length, mediaFiles.length);
const byMcpId = new Map(liveBindings.map((b) => [b.metadata.mcpMediaId, b]));
assert.equal(byMcpId.get(mediaIdByKey.get('day2UnmatchedPhoto')).day_number, 2);
assert.equal(byMcpId.get(mediaIdByKey.get('day2UnmatchedPhoto')).metadata.assignedDayDate, '2026-07-04');
assert.equal(byMcpId.get(mediaIdByKey.get('day2UnmatchedPhoto')).metadata.assignmentBucket, 'day');
assert.equal(byMcpId.get(mediaIdByKey.get('day2UnmatchedPhoto')).metadata.thingId, null);
assert.equal(byMcpId.get(mediaIdByKey.get('day2UnmatchedVideo')).day_number, 2);
assert.equal(byMcpId.get(mediaIdByKey.get('day2UnmatchedVideo')).metadata.assignedDayDate, '2026-07-04');
assert.equal(byMcpId.get(mediaIdByKey.get('day2UnmatchedVideo')).metadata.assignmentBucket, 'day');
assert.equal(byMcpId.get(mediaIdByKey.get('undatedPhoto')).day_number, null);
assert.equal(byMcpId.get(mediaIdByKey.get('undatedPhoto')).metadata.assignmentBucket, 'unassigned');
assert.equal(byMcpId.get(mediaIdByKey.get('outOfRangePhoto')).day_number, null);
assert.equal(byMcpId.get(mediaIdByKey.get('outOfRangePhoto')).metadata.assignmentBucket, 'unassigned');

const served = await intakeSharedResponse(shareSlug, db);
const day2Live = served.days.find((d) => Number(d.day_number) === 2);
const day2LiveMedia = (served.media || []).filter((m) => Number(m.day_id) === Number(day2Live.id));
assert.equal(day2LiveMedia.length, 2, 'approved Day 2 unmatched photo+video must attach to Day 2 on live vacation');

useSharedTripDatabase(null);
useVacationMcpDatabase(null);
setVacationMcpClock(null);
console.log('issue #1070 C10 media thumbnails and viewer tests passed');
