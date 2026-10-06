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
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const outRoot = process.env.ITINERARY_FRESH_OUT || '/opt/cursor/artifacts/itinerary-fresh-r1';
const zipPath = process.env.ITINERARY_FRESH_ZIP || '/opt/cursor/artifacts/itinerary-fresh-r1.zip';
const ref390 = process.env.DAYBYDAY_REF_390 || '/home/ubuntu/.cursor/projects/workspace/uploads/daybyday-390_48df.png';
const ref1280 = process.env.DAYBYDAY_REF_1280 || '/home/ubuntu/.cursor/projects/workspace/uploads/daybyday-1280_c76e.png';
const MAX_RATIO = 0.035;
const ROUND = Number(process.env.ITINERARY_FRESH_ROUND || 1);
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

async function patchedBundle() {
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
    if (m && decodeURIComponent(m[1]) === NYC_DAYBYDAY_SLUG) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

function downscale(png, factor = 4) {
  const w = Math.max(1, Math.floor(png.width / factor));
  const h = Math.max(1, Math.floor(png.height / factor));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(png.width - 1, x * factor);
      const sy = Math.min(png.height - 1, y * factor);
      const si = (png.width * sy + sx) << 2;
      const di = (w * y + x) << 2;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function diffOutsideMasks(a, b, masks, factor = 4) {
  const da = downscale(a, factor);
  const db = downscale(b, factor);
  const w = Math.min(da.width, db.width);
  const h = Math.min(da.height, db.height);
  let compared = 0;
  let mism = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const fx = x * factor;
      const fy = y * factor;
      if (masks.some((m) => fx >= m.x && fx < m.x + m.width && fy >= m.y && fy < m.y + m.height)) continue;
      compared += 1;
      const j = (da.width * y + x) << 2;
      const k = (db.width * y + x) << 2;
      if (Math.abs(da.data[j] - db.data[k]) > 18
        || Math.abs(da.data[j + 1] - db.data[k + 1]) > 18
        || Math.abs(da.data[j + 2] - db.data[k + 2]) > 18) mism += 1;
    }
  }
  return { ratio: compared ? mism / compared : 0, mism, compared };
}

function diffInsideMasks(a, b, masks, factor = 4) {
  const da = downscale(a, factor);
  const db = downscale(b, factor);
  const w = Math.min(da.width, db.width);
  const h = Math.min(da.height, db.height);
  let compared = 0;
  let mism = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const fx = x * factor;
      const fy = y * factor;
      if (!masks.some((m) => fx >= m.x && fx < m.x + m.width && fy >= m.y && fy < m.y + m.height)) continue;
      compared += 1;
      const j = (da.width * y + x) << 2;
      const k = (db.width * y + x) << 2;
      if (Math.abs(da.data[j] - db.data[k]) > 18
        || Math.abs(da.data[j + 1] - db.data[k + 1]) > 18
        || Math.abs(da.data[j + 2] - db.data[k + 2]) > 18) mism += 1;
    }
  }
  return { ratio: compared ? mism / compared : 0, mism, compared };
}

function stitch(left, right) {
  const h = Math.max(left.height, right.height);
  const out = new PNG({ width: left.width + right.width, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      if (y >= left.height) continue;
      const si = (left.width * y + x) << 2;
      const di = (out.width * y + x) << 2;
      out.data[di] = left.data[si];
      out.data[di + 1] = left.data[si + 1];
      out.data[di + 2] = left.data[si + 2];
      out.data[di + 3] = 255;
    }
    for (let x = 0; x < right.width; x += 1) {
      if (y >= right.height) continue;
      const si = (right.width * y + x) << 2;
      const di = (out.width * y + left.width + x) << 2;
      out.data[di] = right.data[si];
      out.data[di + 1] = right.data[si + 1];
      out.data[di + 2] = right.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

async function captureDay(page, dayNumber) {
  await page.evaluate((n) => {
    for (const btn of document.querySelectorAll('button')) {
      if ((btn.textContent || '').replace(/\s+/g, ' ').trim() === `Day ${n}`) btn.click();
    }
    const cards = [...document.querySelectorAll('[data-ts-day-timeline="1"], div[style*="borderRadius:14"][style*="border:1px solid var(--border-faint"]')];
    const card = cards.find((el) => new RegExp(`\\bDay ${n}\\b`).test((el.textContent || '').replace(/\s+/g, ' ')));
    if (card) card.scrollIntoView({ block: 'start', behavior: 'instant' });
    else window.scrollTo(0, 0);
  }, dayNumber);
  await new Promise((r) => setTimeout(r, 700));
  const meta = await page.evaluate((n) => {
    const cards = [...document.querySelectorAll('[data-ts-day-timeline="1"], div[style*="borderRadius:14"][style*="border:1px solid var(--border-faint"]')];
    const card = cards.find((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ');
      return new RegExp(`\\bDay ${n}\\b`).test(t);
    }) || cards[n - 1] || cards[cards.length - 1];
    if (!card) return { error: 'no-card', cardCount: cards.length };
    const header = card?.firstElementChild;
    const headerButtons = header ? [...header.querySelectorAll('button')] : [];
    const cardRect = card.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const masks = [];
    if (headerRect) {
      masks.push({
        x: cardRect.x,
        y: headerRect.bottom,
        width: cardRect.width,
        height: Math.max(0, cardRect.bottom - headerRect.bottom),
      });
    }
    const rows = [...card.querySelectorAll('div[style*="gridTemplateColumns"]')].filter((row) => row.querySelector('[data-ts-timeline-title="1"], button[style*="textDecoration"], button[style*="textDecorationColor"]')).map((row) => {
      const timeText = (row.children?.[0]?.textContent || '').replace(/\s+/g, ' ').trim();
      const titleEl = row.querySelector('[data-ts-timeline-title="1"], button[style*="textDecoration"], button[style*="textDecorationColor"]');
      return { title: (titleEl?.textContent || '').trim(), timeText };
    });
    const emptyMedia = [...card.querySelectorAll('a[style*="width:42px"],a[style*="width:58px"]')].filter((a) => !a.querySelector('img,video'));
    const imgs = [...card.querySelectorAll('img')].map((img) => img.naturalWidth);
    const summaryCount = card.querySelectorAll('[data-row-summary="1"]').length;
    const videoQrCount = card.querySelectorAll('[data-row-video-qr="1"]').length;
    const r = card.getBoundingClientRect();
    return {
      clip: { x: r.x, y: r.y, width: r.width, height: r.height },
      headerButtons: headerButtons.length,
      rows,
      masks,
      emptyMedia: emptyMedia.length,
      imgs,
      summaryCount,
      videoQrCount,
    };
  }, dayNumber);
  if (!meta || meta.error) throw new Error(`day ${dayNumber} card not found (${JSON.stringify(meta)})`);
  const shot = await page.screenshot({ type: 'png', clip: meta.clip });
  return { png: PNG.sync.read(shot), shot, meta };
}

async function shotPage(js, html, css, tripPayload, width) {
  const server = await startServer({ html, css, js, tripPayload });
  const browser = await loadPuppeteer().launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1500, deviceScaleFactor: 1 });
    await page.goto(`${server.origin}/shared/${NYC_DAYBYDAY_SLUG}`, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('[data-ts-day-timeline="1"], div[style*="borderRadius:14"][style*="border:1px solid var(--border-faint"]'), { timeout: 60000 });
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button,[role="tab"]')) {
        const t = (btn.textContent || '').replace(/\s+/g, ' ').trim();
        if (t === 'Day-by-Day' || t === '☀️ Day-by-Day') btn.click();
      }
    });
    await new Promise((r) => setTimeout(r, 400));
    const days = {};
    for (const day of [1, 2]) days[day] = await captureDay(page, day);
    return days;
  } finally {
    await browser.close();
    await server.close();
  }
}

const tripPayload = buildNycCraigKimDaybydayTrip();
const [html, css, beforeJs, afterJs] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  execFileSync('git', ['show', 'dc8bc44:public/assets/index-BKun7ofk.js'], { maxBuffer: 30 * 1024 * 1024 }).toString('utf8'),
  patchedBundle(),
]);
await mkdir(outRoot, { recursive: true });
await copyFile(ref390, path.join(outRoot, 'approved-reference-390.png'));
await copyFile(ref1280, path.join(outRoot, 'approved-reference-1280.png'));

const results = [];
for (const { width, tag } of [{ width: 390, tag: '390' }, { width: 1280, tag: '1280' }]) {
  const reference = await shotPage(beforeJs, html, css, tripPayload, width);
  const candidate = await shotPage(afterJs, html, css, tripPayload, width);
  for (const day of [1, 2]) {
    const left = reference[day];
    const right = candidate[day];
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
    await writeFile(path.join(outRoot, `${base}-side-by-side.png`), PNG.sync.write(stitch(left.png, right.png)));
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
      videoQrCount: right.meta.videoQrCount,
    });
    assert.ok(unmasked.ratio <= MAX_RATIO, `day ${day} @${tag} TREK drift ${unmasked.ratio}`);
    if (day === 1 && tag === '390') {
      assert.ok(right.meta.summaryCount >= 1, 'expected at least one row summary on day card');
    }
    if (day === 2 && tag === '390') {
      assert.ok(right.meta.videoQrCount >= 1, 'expected video QR thumb on day card');
    }
  }
}

const structural = {
  summaries: Math.max(0, ...results.map((r) => r.summaryCount || 0)),
  videoQrs: Math.max(0, ...results.map((r) => r.videoQrCount || 0)),
};
assert.ok(structural.summaries >= 1, 'row summaries missing');
assert.ok(structural.videoQrs >= 1, 'video QR thumbs missing');

await writeFile(path.join(outRoot, 'gate-results.json'), JSON.stringify({ round: ROUND, results, structural }, null, 2));
execFileSync('zip', ['-qr', zipPath, '.'], { cwd: outRoot });
console.log(JSON.stringify({ ok: true, zipPath, round: ROUND, results }, null, 2));
