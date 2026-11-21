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
import { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { createMcpTestDb } from './lib/mcp-test-harness.mjs';
import { invokeRoute } from './lib/mcp-test-exif.mjs';
import { buildCarmelWeekendFixture, ensureVacationClientDist, resolveChromeExecutable } from './lib/c10-test-media.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const proofDir = process.env.PREVIEW_PROOF_DIR || '';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TYPE_PREFIX_RE = /\b(?:flight|hotel|car|restaurant|store|sightseeing|activity|attraction|tour|bar|music|theatre|workout|tickets|family_event|artist|transport|event|note)\s*:/i;
const RAW_ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/;

function findPreviewCopyViolations({ visibleText, dayHeaders, itemLines }) {
  const violations = [];
  const text = String(visibleText || '');
  if (TYPE_PREFIX_RE.test(text)) violations.push(`type_prefix:${text.match(TYPE_PREFIX_RE)?.[0]}`);
  for (const header of dayHeaders || []) {
    if (RAW_ISO_DATE_RE.test(String(header || ''))) {
      violations.push(`raw_iso_day_header:${header}`);
    }
  }
  for (const line of itemLines || []) {
    if (/—\s*unscheduled/i.test(String(line || '')) || /\bunscheduled\b/i.test(String(line || ''))) {
      violations.push(`unscheduled_suffix:${line}`);
    }
  }
  if (/\(s\)/i.test(text)) violations.push('paren_s_plural');
  if (/long-list/i.test(text)) violations.push('long_list_copy');
  if (/\btrips?\b/i.test(text)) violations.push('banned_trip_word');
  if (/missing details/i.test(text)) violations.push('missing_details_heading');
  if (/could not be matched to a vacation day/i.test(text)) violations.push('engineering_unmatched_copy');
  if (/not placed yet/i.test(text)) violations.push('not_placed_yet_copy');
  return violations;
}

function testD7NegativeControls() {
  assert.ok(
    findPreviewCopyViolations({ visibleText: 'restaurant: Carmel Belle · 12:00 PM', dayHeaders: [], itemLines: [] })
      .some((v) => v.startsWith('type_prefix:')),
    'D7 detector must fail on type: prefix',
  );
  assert.ok(
    findPreviewCopyViolations({ visibleText: 'sightseeing: Point Lobos', dayHeaders: [], itemLines: [] })
      .some((v) => v.startsWith('type_prefix:')),
    'D7 detector must fail on sightseeing: prefix',
  );
  assert.ok(
    findPreviewCopyViolations({ visibleText: '', dayHeaders: ['Day 1 (2026-07-03) — Village Lunch'], itemLines: [] })
      .some((v) => v.startsWith('raw_iso_day_header:')),
    'D7 detector must fail on raw ISO date in day header',
  );
  assert.ok(
    findPreviewCopyViolations({ visibleText: '2 photo or video item(s)', dayHeaders: [], itemLines: [] })
      .includes('paren_s_plural'),
    'D7 detector must fail on (s)',
  );
  assert.ok(
    findPreviewCopyViolations({ visibleText: 'Unscheduled long-list items (1)', dayHeaders: [], itemLines: [] })
      .includes('long_list_copy'),
    'D7 detector must fail on long-list',
  );
  assert.ok(
    findPreviewCopyViolations({ visibleText: 'Ready to update your trip', dayHeaders: [], itemLines: [] })
      .includes('banned_trip_word'),
    'D7 detector must fail on trip',
  );
  assert.ok(
    findPreviewCopyViolations({ visibleText: 'Pilgrim Way Bookshop — Unscheduled', dayHeaders: [], itemLines: ['Pilgrim Way Bookshop — Unscheduled'] })
      .some((v) => v.startsWith('unscheduled_suffix:')),
    'D7 detector must fail on — Unscheduled suffix',
  );
  assert.ok(
    findPreviewCopyViolations({ visibleText: 'Not placed yet', dayHeaders: [], itemLines: [] })
      .includes('not_placed_yet_copy'),
    'D9 detector must fail on Not placed yet',
  );
}

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
  const chatHarnessHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vacay Keepsake Chat</title><style>body{margin:0;padding:12px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}.bubble{border:1px solid #d9e0e8;border-radius:8px;padding:10px 12px;background:#fff;max-width:720px;margin:0 auto}</style><script src="/ts-pic-popup-viewer.js"></script><script src="/vacation-app-ai-import.js"></script></head><body><div id="messages"></div><script>const card=${JSON.stringify(approvalCard)};const m=document.getElementById('messages');m.innerHTML='<article class="bubble"><small>Vacay Keepsake</small>Your AI staged a preview for your review.'+window.tsVacationAppAiImport.renderTurnCardHtml({payload:{aiApprovalCard:card}})+'</article>';window.tsVacationAppAiImport.bindMessages({getState:()=>({turns:[{payload:{aiApprovalCard:card}}],sending:false}),getSessionToken:()=>'',currentTrip:()=>({id:card.vacationId,shareToken:card.shareSlug}),loadApp:async()=>{}});</script></body></html>`;
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

async function auditPolishedSurface(page, surfaceName) {
  await page.waitForSelector('[data-ts-mcp-preview-days="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('[data-ts-preview-thumb="1"] img')];
    return imgs.length >= 6 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 20000 });

  const dom = await page.evaluate(() => {
    const rootEl = document.querySelector('[data-ts-mcp-preview="1"], [data-ts-ai-approval-card="1"]');
    const panelEl = document.querySelector('[data-ts-mcp-panel="1"], [data-ts-ai-approval-card="1"]');
    const dayHeaders = [...(rootEl?.querySelectorAll('[data-ts-preview-day-header="1"]') || [])]
      .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim());
    const dayTags = [...(rootEl?.querySelectorAll('[data-ts-preview-day]') || [])].map((el) => el.tagName);
    const thingRows = [...(rootEl?.querySelectorAll('[data-ts-preview-thing]') || [])].map((el) => ({
      ref: el.getAttribute('data-ts-preview-thing') || '',
      tag: el.tagName,
      hasIcon: Boolean(el.querySelector('[data-ts-preview-type-icon="1"]')),
      label: String(el.querySelector('[class*="thing-label"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
      thumbs: el.querySelectorAll('[data-ts-preview-thumb="1"]').length,
    }));
    const unscheduledHeading = rootEl?.querySelector('[data-ts-mcp-preview-unscheduled="1"] h4')?.textContent?.trim() || '';
    const wontImportEl = rootEl?.querySelector('[data-ts-mcp-preview-wont-import="1"]');
    const wontImportHeading = wontImportEl?.querySelector('h4')?.textContent?.trim() || '';
    const wontImportNote = wontImportEl?.querySelector('[data-ts-wont-import-note="1"]')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const wontImportThumbs = wontImportEl ? wontImportEl.querySelectorAll('[data-ts-preview-thumb="1"]').length : 0;
    const notesText = [...(rootEl?.querySelectorAll('[data-ts-mcp-preview-notes="1"] p') || [])]
      .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim());
    const ulCountInPreview = rootEl ? rootEl.querySelectorAll('ul').length : -1;
    return {
      visibleText: String(rootEl?.innerText || ''),
      panelText: String(panelEl?.innerText || ''),
      dayHeaders,
      dayTags,
      thingRows,
      unscheduledHeading,
      wontImportHeading,
      wontImportNote,
      wontImportThumbs,
      notesText,
      ulCountInPreview,
    };
  });

  assert.deepEqual(
    dom.dayHeaders,
    [
      'Day 1 · Fri, Jul 3 — Village Lunch & Point Lobos',
      'Day 2 · Sat, Jul 4 — Scenic Coast Drive',
      'Day 3 · Sun, Jul 5 — Morning Espresso & Departure',
    ],
    `${surfaceName}: D1 friendly day headers mismatch`,
  );

  const byRef = new Map(dom.thingRows.map((row) => [row.ref, row]));
  assert.equal(byRef.get('rest-carmel-belle')?.label, 'Carmel Belle · 12:00 PM', `${surfaceName}: D2 Carmel Belle row`);
  assert.equal(byRef.get('act-point-lobos')?.label, 'Point Lobos · 2:30 PM', `${surfaceName}: D2 Point Lobos row`);
  assert.equal(byRef.get('act-17-mile')?.label, '17-Mile Drive · 10:00 AM', `${surfaceName}: D2 17-Mile Drive row`);
  assert.equal(byRef.get('store-pilgrims')?.label, 'Pilgrim Way Bookshop', `${surfaceName}: D2 Saved for later row`);
  for (const row of dom.thingRows) {
    assert.equal(row.hasIcon, true, `${surfaceName}: D2 icon chip missing for ${row.ref}`);
    assert.notEqual(row.tag, 'LI', `${surfaceName}: D5 thing row must not be a bulleted <li>`);
  }
  for (const tag of dom.dayTags) {
    assert.notEqual(tag, 'LI', `${surfaceName}: D5 day card must not be a bulleted <li>`);
  }
  assert.equal(dom.ulCountInPreview, 0, `${surfaceName}: D5 preview must not use bulleted <ul> lists`);

  assert.equal(dom.unscheduledHeading, 'Saved for later', `${surfaceName}: D3 Saved for later heading`);
  assert.equal(dom.wontImportHeading, "Won't be imported", `${surfaceName}: D9 Won't be imported heading`);
  assert.equal(
    dom.wontImportNote,
    "These 2 photos don't have a date during this vacation, so they won't be imported.",
    `${surfaceName}: D9 plain won't-be-imported line mismatch`,
  );
  assert.equal(dom.wontImportThumbs, 2, `${surfaceName}: D9 Won't be imported thumbnails count`);
  assert.equal(
    dom.notesText.some((line) => /not placed yet|won't be imported/i.test(line)),
    false,
    `${surfaceName}: D9 skipped media must appear only in Won't be imported`,
  );

  assert.match(dom.panelText, /\bvacation\b/i, `${surfaceName}: D4 must say vacation`);
  assert.match(dom.panelText, /\bAI\b/, `${surfaceName}: D4 must say AI`);
  assert.doesNotMatch(dom.panelText, /\btrips?\b/i, `${surfaceName}: D4 must never say trip`);

  const violations = findPreviewCopyViolations({
    visibleText: dom.visibleText,
    dayHeaders: dom.dayHeaders,
    itemLines: dom.thingRows.map((r) => r.label),
  });
  assert.deepEqual(violations, [], `${surfaceName}: D7 preview DOM copy violations`);
}

testD7NegativeControls();

const db = createMcpTestDb();
useVacationMcpDatabase(db);
useSharedTripDatabase(db);
setVacationMcpClock(() => new Date('2026-11-20T18:00:00.000Z'));

const ownerId = crypto.randomUUID();
const sessionToken = 'sess-1073-carmel';
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
  email: 'throwaway-1073@example.test',
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
for (let i = 0; i < slots.length; i += 1) {
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

const commitRes = await mcpRpc('tools/call', {
  name: 'commit_import',
  arguments: { draft_id: draftId, preview_hash: preview.preview_hash },
}, aiToken);
assert.equal(commitRes.statusCode, 200);

const ownerSession = { customer_id: ownerId, email: 'throwaway-1073@example.test' };
const turns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
  loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan', firstName: 'Jordan' }],
});
const approvalCard = turns.find((t) => t.payload?.aiApprovalCard?.changeSetId === draftId)?.payload?.aiApprovalCard;
assert.ok(approvalCard);

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

const viewports = [
  { name: '390', width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { name: '1280', width: 1280, height: 800, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
];

try {
  if (proofDir) await mkdir(proofDir, { recursive: true });
  for (const vp of viewports) {
    const chatPage = await browser.newPage();
    await chatPage.setViewport(vp);
    await chatPage.goto(`${server.origin}/chat-preview`, { waitUntil: 'networkidle2' });
    await auditPolishedSurface(chatPage, `in-chat-card-${vp.name}`);
    if (proofDir) {
      await chatPage.screenshot({ path: path.join(proofDir, `carmel-preview-chat-${vp.name}.png`), fullPage: true });
    }
    await chatPage.close();

    const approvePage = await browser.newPage();
    await approvePage.setViewport(vp);
    await approvePage.goto(`${server.origin}/vacation-app-next.html?token=${encodeURIComponent(shareSlug)}&aiPanel=approvals`, { waitUntil: 'networkidle2' });
    await auditPolishedSurface(approvePage, `approve-screen-${vp.name}`);
    if (proofDir) {
      await approvePage.screenshot({ path: path.join(proofDir, `carmel-preview-approve-${vp.name}.png`) });
    }
    await approvePage.close();

    const gridPage = await browser.newPage();
    await gridPage.setViewport(vp);
    await gridPage.goto(`${server.origin}/shared/${encodeURIComponent(shareSlug)}/?panel=ai-approvals`, { waitUntil: 'networkidle2' });
    await auditPolishedSurface(gridPage, `grid-admin-${vp.name}`);
    if (proofDir) {
      await gridPage.evaluate(() => {
        const el = document.querySelector('[data-ts-mcp-preview="1"]');
        el?.scrollIntoView({ block: 'start' });
      });
      await sleep(150);
      await gridPage.screenshot({ path: path.join(proofDir, `carmel-preview-grid-${vp.name}.png`), fullPage: true });
    }
    await gridPage.close();
  }
} finally {
  await browser.close();
  await server.close();
}

useSharedTripDatabase(null);
useVacationMcpDatabase(null);
setVacationMcpClock(null);
console.log('issue #1073 import preview polish D1-D7 tests passed');
