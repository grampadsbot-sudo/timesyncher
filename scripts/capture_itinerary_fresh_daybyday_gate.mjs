#!/usr/bin/env node
/** Day-by-day keepsake gate: prod travel bundle vs patched, Day 1/2 @390/1280. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';

import handlePdfQrSvg from '../src/vacation/pdf-qr-svg-handler.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { patchSharedTripHostnameForLocalHarness } from '../src/vacation/trek-live-product-patches.mjs';

function trekLogoReferenceBundle() {
  const raw = execFileSync('git', ['show', UPSTREAM], { maxBuffer: 30 * 1024 * 1024 });
  return patchSharedTripHostnameForLocalHarness(raw.toString('utf8'));
}
import {
  captureTabClip,
  clickSharedTab,
  compareLogoMidlineRows,
  measureListRowLogoCentering,
} from './lib/itinerary-fresh-gate-metrics.mjs';
import { cropPng, diffInsideMasks, diffOutsideMasks, stitch } from './lib/itinerary-fresh-gate-png.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  expectedSummariesOnDay,
  listStoredSummaries,
  NYC_CONFLICT_DAY,
  NYC_DAYBYDAY_SLUG,
  STORED_SUMMARY_FIELD,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const outRoot = process.env.ITINERARY_FRESH_OUT || '/opt/cursor/artifacts/itinerary-fresh-r6-logo';
const zipPath = process.env.ITINERARY_FRESH_ZIP || '/opt/cursor/artifacts/itinerary-fresh-r6-logo.zip';
const ref390 = process.env.DAYBYDAY_REF_390 || '/home/ubuntu/.cursor/projects/workspace/uploads/daybyday-390_5673.png';
const ref1280 = process.env.DAYBYDAY_REF_1280 || '/home/ubuntu/.cursor/projects/workspace/uploads/daybyday-1280_dc44.png';
const refHotels390 = process.env.HOTELS_REF_390 || '/home/ubuntu/.cursor/projects/workspace/uploads/hotels-390_9b06.png';
const refHotels1280 = process.env.HOTELS_REF_1280 || '/home/ubuntu/.cursor/projects/workspace/uploads/hotels-1280_6fd4.png';
const refCars390 = process.env.CARS_REF_390 || '/home/ubuntu/.cursor/projects/workspace/uploads/cars-390_0fc8.png';
const refCars1280 = process.env.CARS_REF_1280 || '/home/ubuntu/.cursor/projects/workspace/uploads/cars-1280_f11a.png';
const MAX_RATIO = 0.035;
const ROUND = Number(process.env.ITINERARY_FRESH_ROUND || 6);
const EXPECTED_SUMMARIES = listStoredSummaries();
const UPSTREAM = '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js';
const travelBase = `https://${['travel', 'timesyncher', 'com'].join('.')}`;
const prodBundleName = 'index-BMaU4y5m.js';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('puppeteer-core');
  }
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': buf.length });
  res.end(buf);
}

async function loadProdBundle(cacheDir) {
  const cache = path.join(cacheDir, prodBundleName);
  try {
    return await readFile(cache);
  } catch {
    const res = await fetch(`${travelBase}/assets/${prodBundleName}`);
    if (!res.ok) throw new Error(`fetch prod bundle HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cache, buf);
    return buf;
  }
}

function patchedBundle() {
  const raw = execFileSync('git', ['show', UPSTREAM], { maxBuffer: 30 * 1024 * 1024 });
  return patchSharedTripHostnameForLocalHarness(renderServedTrekBundle(raw.toString('utf8')));
}

async function startServer({ html, js, css, tripPayload }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname === '/api/pdf/qr.svg' || pathname.startsWith('/api/pdf/qr.svg')) {
      handlePdfQrSvg(req, res);
      return;
    }
    for (const p of ['/ts-timeline-icon-patch.js', '/ts-car-brand-filter.js', '/ts-thing-media-overlay.js']) {
      if (pathname === p) return send(res, 200, await readFile(path.join(root, 'public', p.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname.startsWith('/ts-thing-media/')) {
      const file = path.join(root, 'public', pathname);
      const ext = path.extname(file).toLowerCase();
      const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
      return send(res, 200, await readFile(file), type);
    }
    if (pathname === '/post-purchase-gate.mjs') {
      return send(res, 200, await readFile(path.join(root, 'public/post-purchase-gate.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname === '/src/onboarding/eula-markdown.mjs') {
      return send(res, 200, await readFile(path.join(root, 'src/onboarding/eula-markdown.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":false}', 'application/json; charset=utf-8');
    if (pathname.startsWith('/icons/')) {
      return send(res, 200, await readFile(path.join(root, 'public/icons/icon.svg'), 'utf8'), 'image/svg+xml');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const m = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (m) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

async function captureDay(page, dayNumber, { assertStored = false } = {}) {
  await page.evaluate((n) => {
    for (const btn of document.querySelectorAll('button')) {
      if ((btn.textContent || '').replace(/\s+/g, ' ').trim() === `Day ${n}`) btn.click();
    }
    const cards = [...document.querySelectorAll('[data-ts-day-timeline="1"], div[style*="borderRadius:14"]')];
    const card = cards.find((el) => new RegExp(`\\bDay ${n}\\b`).test((el.textContent || '').replace(/\s+/g, ' ')));
    if (card) card.scrollIntoView({ block: 'start', behavior: 'instant' });
    else window.scrollTo(0, 0);
  }, dayNumber);
  await new Promise((r) => setTimeout(r, 700));
  const meta = await page.evaluate((n) => {
    const cards = [...document.querySelectorAll('[data-ts-day-timeline="1"], div[style*="borderRadius:14"]')];
    const card = cards.find((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ');
      return new RegExp(`\\bDay ${n}\\b`).test(t);
    }) || cards[n - 1] || cards[cards.length - 1];
    const isTimelineRow = (row) => {
      const cols = getComputedStyle(row).gridTemplateColumns || '';
      return cols.includes('74px') && cols.includes('22px') && row.children?.length >= 3;
    };
    const scope = card || document;
    const timelineRows = [...scope.querySelectorAll('div')].filter((row) => isTimelineRow(row));
    if (!card && timelineRows.length === 0) return { error: 'no-card', cardCount: cards.length };
    const header = card?.firstElementChild;
    const headerButtons = header ? [...header.querySelectorAll('button')] : [];
    const cardRect = card?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const masks = [];
    if (cardRect && headerRect) {
      masks.push({
        x: cardRect.x,
        y: headerRect.bottom,
        width: cardRect.width,
        height: Math.max(0, cardRect.bottom - headerRect.bottom),
      });
    }
    const titleInRow = (row) => row.querySelector('[data-ts-timeline-title="1"], button[style*="textDecoration"], button[style*="textDecorationColor"]')
      || row.children[2]?.querySelector('button,span[style*="fontWeight"]');
    const rows = timelineRows.filter((row) => titleInRow(row)).map((row) => {
      const timeText = (row.children?.[0]?.textContent || '').replace(/\s+/g, ' ').trim();
      const titleEl = titleInRow(row);
      return { title: (titleEl?.textContent || '').trim(), timeText };
    });
    const emptyMedia = [...scope.querySelectorAll('a[style*="width:42px"],a[style*="width:58px"]')].filter((a) => !a.querySelector('img,video'));
    const imgs = [...scope.querySelectorAll('img')].map((img) => img.naturalWidth);
    const summaryCount = scope.querySelectorAll('[data-row-summary="1"]').length;
    const storedSummaryTexts = [...scope.querySelectorAll('[data-row-summary="1"][data-summary-stored="1"]')].map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const conflictCount = [...scope.querySelectorAll('div')].filter((el) => /Conflict with/i.test(el.textContent || '')).length;
    const videoQrCount = scope.querySelectorAll('[data-row-video-qr="1"]').length;
    const rectsOverlap = (a, b, tol = 2) => !(a.bottom <= b.top + tol || b.bottom <= a.top + tol || a.right <= b.left + tol || b.right <= a.left + tol);
    const conflictLineLayouts = [...scope.querySelectorAll('[data-ts-conflict-label="1"]')].map((label) => {
      const panel = label.parentElement;
      const title = panel?.querySelector('[data-ts-timeline-title="1"]');
      const summary = panel?.querySelector('[data-row-summary="1"][data-summary-stored="1"]');
      if (!title || !summary) return { ok: false, reason: 'missing-nodes' };
      const lr = label.getBoundingClientRect();
      const tr = title.getBoundingClientRect();
      const sr = summary.getBoundingClientRect();
      const orderOk = lr.bottom <= tr.top + 2 && tr.bottom <= sr.top + 2;
      const noOverlap = !rectsOverlap(lr, tr) && !rectsOverlap(tr, sr) && !rectsOverlap(lr, sr);
      return { ok: orderOk && noOverlap, orderOk, noOverlap };
    });
    const iconCount = scope.querySelectorAll('[data-ts-timeline-icon="1"]').length;
    const logoRows = timelineRows.filter((row) => titleInRow(row)).map((rowGrid) => {
      const title = titleInRow(rowGrid);
      const icon = rowGrid.querySelector('[data-ts-timeline-icon="1"]')
        || rowGrid.children[1]?.querySelector('div');
      if (!title || !icon) return null;
      const chipRect = icon.getBoundingClientRect();
      const nameRect = title.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(title);
      const firstLine = range.getClientRects()[0];
      range.detach();
      const titleMid = firstLine
        ? firstLine.top + firstLine.height / 2
        : nameRect.top + Math.min(parseFloat(getComputedStyle(title).lineHeight) || 16, nameRect.height) / 2;
      const iconMid = chipRect.top + chipRect.height / 2;
      const midDeltaPx = iconMid - titleMid;
      return {
        midDeltaPx,
        deltaPx: Math.abs(midDeltaPx),
        title: (title.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
      };
    }).filter(Boolean);
    const r = card
      ? card.getBoundingClientRect()
      : (() => {
        const rects = timelineRows.map((row) => row.getBoundingClientRect());
        const x = Math.min(...rects.map((rect) => rect.x));
        const y = Math.min(...rects.map((rect) => rect.y)) - 36;
        const right = Math.max(...rects.map((rect) => rect.right));
        const bottom = Math.max(...rects.map((rect) => rect.bottom)) + 8;
        return { x, y, width: right - x, height: bottom - y };
      })();
    return {
      clip: { x: r.x, y: r.y, width: r.width, height: r.height },
      headerButtons: headerButtons.length,
      rows,
      masks,
      emptyMedia: emptyMedia.length,
      imgs,
      summaryCount,
      storedSummaryTexts,
      conflictCount,
      conflictLineLayoutPass: conflictLineLayouts.length > 0 && conflictLineLayouts.every((row) => row.ok),
      conflictLineLayouts,
      videoQrCount,
      iconCount,
      logoRows,
    };
  }, dayNumber);
  if (!meta || meta.error) throw new Error(`day ${dayNumber} card not found (${JSON.stringify(meta)})`);
  if (assertStored) {
    for (const text of expectedSummariesOnDay(dayNumber)) {
      assert.ok(meta.storedSummaryTexts.includes(text), `day ${dayNumber} missing stored summary: ${text}`);
    }
  }
  const shot = await page.screenshot({ type: 'png', clip: meta.clip });
  return { png: PNG.sync.read(shot), shot, meta };
}

async function captureListTab(page, tag, tabLabel, waitRe = /Zabar|Strand Book/i, { requireListRows = false } = {}) {
  const clicked = await clickSharedTab(page, tabLabel);
  assert.ok(clicked, `${tabLabel} tab not found @${tag}`);
  await new Promise((r) => setTimeout(r, 450));
  if (requireListRows) {
    await page.waitForFunction(
      (label) => {
        const body = document.body?.innerText || '';
        if (/hotels/i.test(label)) return /Midtown sample hotel/i.test(body);
        if (/cars/i.test(label)) return /Priceline opaque/i.test(body);
        return /Zabar|Strand Book/i.test(body);
      },
      { timeout: 20000 },
      tabLabel,
    );
  }
  try {
    await page.waitForFunction(
      (reSource) => new RegExp(reSource, 'i').test(document.body?.innerText || ''),
      { timeout: 15000 },
      waitRe.source,
    );
  } catch (err) {
    assert.ok(String(err?.message || err).includes('timeout'), err);
  }
  const logoCenter = await measureListRowLogoCentering(page, tabLabel);
  const clip = await captureTabClip(page);
  const shot = await page.screenshot({ type: 'png', clip });
  const png = PNG.sync.read(shot);
  const masks = [{ x: 0, y: clip.y + 80, width: clip.width, height: Math.max(0, clip.height - 80) }];
  return { png, shot, meta: { clip, masks, logoCenter } };
}

async function shotPage(js, html, css, tripPayload, slug, width, { candidate = false } = {}) {
  const server = await startServer({ html, css, js, tripPayload });
  const browser = await loadPuppeteer().launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1500, deviceScaleFactor: 1 });
    await page.goto(`${server.origin}/shared/${slug}`, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(
      () => document.querySelector('[data-ts-day-timeline="1"], div[style*="borderRadius:14"][style*="border:1px solid var(--border-faint"]')
        || /Craig \/ Kim NYC June 2026/i.test(document.body?.innerText || ''),
      { timeout: 60000 },
    );
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button,[role="tab"]')) {
        const t = (btn.textContent || '').replace(/\s+/g, ' ').trim();
        if (t === 'Day-by-Day' || t === '☀️ Day-by-Day') btn.click();
      }
    });
    await new Promise((r) => setTimeout(r, 400));
    const days = {};
    for (const day of [1, 2, NYC_CONFLICT_DAY]) {
      days[day] = await captureDay(page, day, { assertStored: candidate });
    }
    const listTab = await captureListTab(page, String(width), 'Stores');
    const listTabs = {};
    for (const { label, stem, waitRe } of [
      { label: 'Hotels', stem: 'hotels', waitRe: /Midtown sample hotel/i },
      { label: 'Cars', stem: 'cars', waitRe: /Priceline opaque/i },
    ]) {
      listTabs[stem] = await captureListTab(page, String(width), label, waitRe, { requireListRows: true });
    }
    return { days, listTab, listTabs };
  } finally {
    await browser.close();
    await server.close();
  }
}

const tripPayload = buildNycCraigKimDaybydayTrip();
const [html, css, beforeJs, trekRefJs, afterJs] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  execFileSync('git', ['show', 'dc8bc44:public/assets/index-BKun7ofk.js'], { maxBuffer: 30 * 1024 * 1024 }).toString('utf8'),
  trekLogoReferenceBundle(),
  patchedBundle(),
]);
await mkdir(outRoot, { recursive: true });
await copyFile(ref390, path.join(outRoot, 'approved-reference-390.png'));
await copyFile(ref1280, path.join(outRoot, 'approved-reference-1280.png'));
await copyFile(refHotels390, path.join(outRoot, 'approved-reference-hotels-390.png'));
await copyFile(refHotels1280, path.join(outRoot, 'approved-reference-hotels-1280.png'));
await copyFile(refCars390, path.join(outRoot, 'approved-reference-cars-390.png'));
await copyFile(refCars1280, path.join(outRoot, 'approved-reference-cars-1280.png'));

const results = [];
const listRefPng = {
  hotels: { 390: refHotels390, 1280: refHotels1280 },
  cars: { 390: refCars390, 1280: refCars1280 },
};
for (const { width, tag } of [{ width: 390, tag: '390' }, { width: 1280, tag: '1280' }]) {
  const reference = await shotPage(beforeJs, html, css, tripPayload, NYC_DAYBYDAY_SLUG, width);
  const trekReference = await shotPage(trekRefJs, html, css, tripPayload, NYC_DAYBYDAY_SLUG, width);
  const candidate = await shotPage(afterJs, html, css, tripPayload, NYC_DAYBYDAY_SLUG, width, { candidate: true });
  for (const day of [1, 2, NYC_CONFLICT_DAY]) {
    const left = reference.days[day];
    const right = candidate.days[day];
    assert.ok(left.meta && right.meta);
    assert.equal(right.meta.emptyMedia, 0, `day ${day} @${tag} empty media`);
    assert.ok(right.meta.imgs.every((nw) => nw > 0), `day ${day} @${tag} unloaded imgs`);
    const clip = right.meta.clip;
    const masks = (right.meta.masks || []).map((m) => ({
      x: m.x - clip.x,
      y: m.y - clip.y,
      width: m.width,
      height: m.height,
    }));
    const unmasked = diffOutsideMasks(left.png, right.png, masks);
    const masked = diffInsideMasks(left.png, right.png, masks);
    const base = `day${day}-${tag}`;
    await writeFile(path.join(outRoot, `${base}-reference-crop.png`), left.shot);
    await writeFile(path.join(outRoot, `${base}-candidate-crop.png`), right.shot);
    const uploadRef = PNG.sync.read(await readFile(tag === '390' ? ref390 : ref1280));
    const uploadCrop = (day === 1 || day === NYC_CONFLICT_DAY)
      ? cropPng(uploadRef, trekReference.days[day].meta.clip)
      : left.png;
    await writeFile(
      path.join(outRoot, `${base}-side-by-side.png`),
      PNG.sync.write(stitch((day === 1 || day === NYC_CONFLICT_DAY) ? uploadCrop : left.png, right.png)),
    );
    const logoCompare = compareLogoMidlineRows(trekReference.days[day].meta.logoRows, right.meta.logoRows);
    results.push({
      day,
      tag,
      unmasked,
      masked,
      headerButtons: right.meta.headerButtons,
      rowTimes: right.meta.rows.map((r) => r.timeText),
      rowTitles: right.meta.rows.map((r) => r.title),
      maskRects: masks.length,
      summaryCount: right.meta.summaryCount,
      conflictCount: right.meta.conflictCount,
      videoQrCount: right.meta.videoQrCount,
      logoCenterPass: logoCompare.pass,
      logoRows: logoCompare.rows,
      conflictLineLayoutPass: right.meta.conflictLineLayoutPass,
    });
    assert.ok(unmasked.ratio <= MAX_RATIO, `day ${day} @${tag} TREK drift ${unmasked.ratio}`);
    if (day === 1 && tag === '390') {
      assert.ok(right.meta.summaryCount >= 1, 'expected at least one row summary on day card');
    }
    if (day === 2 && tag === '390') {
      assert.ok(right.meta.videoQrCount >= 1, 'expected video QR thumb on day card');
    }
    if (day === NYC_CONFLICT_DAY) {
      assert.ok(right.meta.conflictCount >= 1, `expected conflict chrome on conflict day @${tag}`);
      for (const text of [EXPECTED_SUMMARIES[606], EXPECTED_SUMMARIES[607]]) {
        assert.ok(right.meta.storedSummaryTexts.includes(text), `conflict day missing stored summary: ${text}`);
      }
      assert.ok(right.meta.conflictLineLayoutPass, `conflict callout title/summary/label must not overlap @${tag}`);
    }
    if (day === 1 || day === NYC_CONFLICT_DAY) {
      assert.ok(logoCompare.pass, `day ${day} timeline icon/title vertical centering @${tag}`);
    }
  }
  for (const stem of ['stores']) {
    const left = reference.listTab;
    const right = candidate.listTab;
    const clip = right.meta.clip;
    const masks = (right.meta.masks || []).map((m) => ({
      x: m.x - clip.x,
      y: m.y - clip.y,
      width: m.width,
      height: m.height,
    }));
    const unmasked = diffOutsideMasks(left.png, right.png, masks);
    const masked = diffInsideMasks(left.png, right.png, masks);
    const base = `${stem}-${tag}`;
    await writeFile(path.join(outRoot, `${base}-reference-crop.png`), left.shot);
    await writeFile(path.join(outRoot, `${base}-candidate-crop.png`), right.shot);
    await writeFile(path.join(outRoot, `${base}-side-by-side.png`), PNG.sync.write(stitch(left.png, right.png)));
    results.push({
      shot: stem,
      tag,
      unmasked,
      masked,
      logoCenter: right.meta.logoCenter,
    });
    assert.ok(unmasked.ratio <= MAX_RATIO, `${stem} @${tag} TREK drift ${unmasked.ratio}`);
  }
  for (const stem of ['hotels', 'cars']) {
    const left = reference.listTabs[stem];
    const right = candidate.listTabs[stem];
    const refListRows = left.meta.logoCenter.rows;
    assert.ok(right?.meta?.logoCenter?.rows?.length, `${stem} candidate rows @${tag}`);
    const logoCompare = refListRows.length
      ? compareLogoMidlineRows(refListRows, right.meta.logoCenter.rows)
      : {
        pass: right.meta.logoCenter.rows.every((row) => Math.abs(row.midDeltaPx) <= 2),
        rows: right.meta.logoCenter.rows.map((row) => ({
          title: row.title,
          candidateMidDeltaPx: row.midDeltaPx,
          referenceMidDeltaPx: null,
          absCandidatePx: Math.abs(row.midDeltaPx),
          driftFromReferencePx: null,
          pass: Math.abs(row.midDeltaPx) <= 2,
          improvedVsTrek: false,
        })),
      };
    assert.ok(refListRows.length || logoCompare.pass, `${stem} reference rows @${tag}`);
    assert.ok(logoCompare.pass, `${stem} tab logo/name vertical centering @${tag}`);
    const uploaded = PNG.sync.read(await readFile(listRefPng[stem][tag]));
    const base = `${stem}-${tag}`;
    await writeFile(path.join(outRoot, `${base}-reference-crop.png`), left.shot);
    await writeFile(path.join(outRoot, `${base}-candidate-crop.png`), right.shot);
    await writeFile(path.join(outRoot, `${base}-upload-baseline.png`), await readFile(listRefPng[stem][tag]));
    await writeFile(path.join(outRoot, `${base}-side-by-side.png`), PNG.sync.write(stitch(uploaded, right.png)));
    const clip = right.meta.clip;
    const masks = (right.meta.masks || []).map((m) => ({
      x: m.x - clip.x,
      y: m.y - clip.y,
      width: m.width,
      height: m.height,
    }));
    const unmasked = diffOutsideMasks(left.png, right.png, masks);
    results.push({
      shot: stem,
      tag,
      unmasked,
      logoCenterPass: logoCompare.pass,
      logoRows: logoCompare.rows,
      baseline: 'upload',
    });
    assert.ok(unmasked.ratio <= MAX_RATIO, `${stem} @${tag} TREK drift ${unmasked.ratio}`);
  }
}

const structural = {
  summaries: Math.max(0, ...results.map((r) => r.summaryCount || 0)),
  videoQrs: Math.max(0, ...results.map((r) => r.videoQrCount || 0)),
  conflicts: Math.max(0, ...results.map((r) => r.conflictCount || 0)),
  storedSummaryField: STORED_SUMMARY_FIELD,
};
assert.ok(structural.summaries >= 1, 'row summaries missing');
assert.ok(structural.videoQrs >= 1, 'video QR thumbs missing');
assert.ok(structural.conflicts >= 1, 'conflict day missing');

await writeFile(path.join(outRoot, 'gate-results.json'), JSON.stringify({ round: ROUND, results, structural }, null, 2));
execFileSync('zip', ['-qr', zipPath, '.'], { cwd: outRoot });
console.log(JSON.stringify({ ok: true, zipPath, round: ROUND, results }, null, 2));
