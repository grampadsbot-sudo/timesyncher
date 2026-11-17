#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { sendCachedBindingMedia } from '../src/vacation/bind-thing-media-cache.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { execFileSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const COPY_SLUG = 'demo-acceptance-1005-local';
const COPY_TRIP_ID = 1005005;
const COPY_BIND_VIDEO_ID = '6ba36f2a-e9f2-467e-9e61-3aac64fe165a';
const COPY_VIDEO_PACK = ['las', 'vegas', 'vacation', '3'].join('-');
const FIXTURE_MP4 = `public/ts-thing-media/${COPY_VIDEO_PACK}/bellagio-fountain-night-video.mp4`;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-length': buf.length });
  res.end(buf);
}

function cloneCopyTripPayload() {
  const payload = structuredClone(buildNycCraigKimDaybydayTrip());
  payload.trip.id = COPY_TRIP_ID;
  for (const day of payload.days || []) {
    day.trip_id = COPY_TRIP_ID;
  }
  return finalizeServedSharedTripPayload(payload);
}

function servedBundleJs() {
  const upstream = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
    maxBuffer: 50 * 1024 * 1024,
    encoding: 'utf8',
  });
  const js = renderServedTrekBundle(upstream);
  assert.match(js, /tsPicScrollHint/);
  assert.match(js, /tsThingTimelineMedia=/);
  assert.match(js, /controls:!0,playsInline:!0,preload:"metadata"/);
  return js;
}

async function startLocalPreview(tripPayload) {
  const [html, css] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  ]);
  const js = servedBundleJs();
  const publicJs = [
    '/vacation-app-request.js',
    '/ts-timeline-icon-patch.js',
    '/ts-pic-popup-viewer.js',
    '/ts-car-brand-filter.js',
    '/ts-thing-media-overlay.js',
    '/post-purchase-gate.mjs',
  ];
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/json; charset=utf-8');
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/ts-thing-media/') && pathname !== '/ts-thing-media/bindings.json') {
      const assetPath = path.join(root, 'public', pathname.replace(/^\//, ''));
      if (existsSync(assetPath)) {
        const mime = assetPath.toLowerCase().endsWith('.mp4')
          ? 'video/mp4'
          : assetPath.toLowerCase().endsWith('.webm')
            ? 'video/webm'
            : 'image/jpeg';
        return send(res, 200, await readFile(assetPath), mime);
      }
      return send(res, 200, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg');
    }
    if (pathname === '/api/bind-thing-media') {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const raw = url.searchParams.get('raw') === '1';
      const id = decodeURIComponent(url.searchParams.get('id') || '');
      if (raw && id === COPY_BIND_VIDEO_ID && (req.method === 'GET' || req.method === 'HEAD')) {
        const bytes = await readFile(path.join(root, FIXTURE_MP4));
        sendCachedBindingMedia(res, req, {
          bytes,
          mimeType: 'video/mp4',
          originalName: 'bellagio-fountain-night-video.mp4',
        });
        return;
      }
    }
    if (publicJs.includes(pathname)) {
      return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":false}', 'application/json; charset=utf-8');
    if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.ico')) {
      const assetPath = path.join(root, 'public', pathname.replace(/^\//, ''));
      if (existsSync(assetPath)) return send(res, 200, await readFile(assetPath), 'image/png');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET' && decodeURIComponent(sharedMatch[1]) === COPY_SLUG) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/')) {
      return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    }
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickDayChip(page, dayNum) {
  await page.evaluate((n) => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const t = String(b.textContent || '').replace(/\s+/g, ' ').trim();
      return new RegExp(`^Day ${n}\\b`, 'i').test(t);
    });
    if (!btn) throw new Error(`day chip not found: Day ${n}`);
    btn.click();
  }, dayNum);
}

async function clickTab(page, label) {
  const clicked = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button')) {
      const text = (btn.getAttribute('aria-label') || btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (new RegExp(`^${want}$`, 'i').test(text)) {
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
  assert.ok(clicked, `tab missing: ${label}`);
}

function popupAuditScript() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 4;
  const popup = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]');
  if (!popup) return { open: false };
  const rect = popup.getBoundingClientRect();
  const inView =
    rect.left >= margin &&
    rect.top >= margin &&
    rect.right <= vw - margin &&
    rect.bottom <= vh - margin;
  const buttons = ['[data-ts-pic-popup-close="1"]', '[data-ts-pic-size-toggle="1"]', '[data-ts-pic-fs-btn="1"]'].map(
    (sel) => {
      const btn = popup.querySelector(sel);
      if (!btn) return { sel, found: false };
      const r = btn.getBoundingClientRect();
      return {
        sel,
        found: true,
        tappable: r.width >= 40 && r.height >= 40 && r.left >= margin && r.right <= vw - margin && r.top >= margin,
      };
    },
  );
  return { open: true, inView, rect: { left: rect.left, right: rect.right, width: rect.width }, buttons, vw };
}

const tripPayload = cloneCopyTripPayload();
const preview = await startLocalPreview(tripPayload);
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await page.goto(`${preview.origin}/shared/${COPY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => /day-by-day/i.test(b.getAttribute('aria-label') || b.textContent || '')),
      { timeout: 180000 },
    );
    await clickTab(page, 'Day-by-Day');
    await page.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });
    await clickDayChip(page, 1);
    await sleep(500);
    await page.waitForFunction(
      () =>
        Boolean(
          document.querySelector('[data-ts-day-timeline] [data-ts-pic-thumb-wrap="1"] a') ||
            document.querySelector('[data-ts-pic-thumb-wrap="1"] a'),
        ),
      { timeout: 120000 },
    );
    await sleep(1200);

    const thumb = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-ts-day-timeline]')];
      for (const row of rows) {
        const text = (row.innerText || '').replace(/\s+/g, ' ');
        if (!/zabar/i.test(text)) continue;
        const wrap = row.querySelector('[data-ts-pic-thumb-wrap="1"]');
        if (!wrap) continue;
        wrap.setAttribute('data-ts-1005-probe', '1');
        const link = wrap.querySelector('a');
        if (!link) continue;
        const r = link.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: text.slice(0, 120) };
      }
      return { err: 'no-zabar-thumb' };
    });
    assert.ok(thumb && !thumb.err, `Day-by-Day Zabar photo thumb missing on copy trip: ${JSON.stringify(thumb)}`);

    await page.touchscreen.tap(thumb.x, thumb.y);
    await sleep(700);
    await page.waitForSelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]', { timeout: 15000 });

    let audit = await page.evaluate(popupAuditScript);
    assert.ok(audit.open, `popover should open at ${viewport.width}`);

    const sizeBtn = await page.evaluate(() => {
      const btn = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-size-toggle="1"]');
      const r = btn?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    });
    assert.ok(sizeBtn, 'size toggle missing');
    await page.touchscreen.tap(sizeBtn.x, sizeBtn.y);
    await sleep(400);

    audit = await page.evaluate(popupAuditScript);
    assert.ok(audit.inView, `expanded popover in viewport at ${viewport.width}: ${JSON.stringify(audit)}`);
    assert.ok(audit.buttons.every((b) => b.found && b.tappable), `buttons tappable after expand at ${viewport.width}`);

    await page.touchscreen.tap(sizeBtn.x, sizeBtn.y);
    await sleep(300);
    const afterShrink = await page.evaluate(() => {
      const popup = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]');
      return popup ? popup.getBoundingClientRect().width : 0;
    });
    assert.ok(afterShrink < audit.rect.width - 20, 'second expand tap returns toward base width');

    const scrollStart = await page.evaluate(() => {
      const popup = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]');
      const r = popup?.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 24, (r?.right ?? 0) + 40);
      const y = Math.max(24, (r?.bottom ?? 0) + 80);
      return { x, y };
    });
    await page.touchscreen.touchStart(scrollStart.x, scrollStart.y);
    await page.touchscreen.touchMove(scrollStart.x, scrollStart.y - 120);
    await page.touchscreen.touchEnd();
    await sleep(500);

    const stillOpen = await page.evaluate(() =>
      Boolean(document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]')),
    );
    assert.ok(stillOpen, `outside touch-scroll must not dismiss popover at ${viewport.width}`);

    const outsideTap = await page.evaluate(() => {
      const popup = document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]');
      const r = popup?.getBoundingClientRect();
      return { x: 16, y: Math.min(window.innerHeight - 24, (r?.bottom ?? 200) + 48) };
    });
    await page.touchscreen.tap(outsideTap.x, outsideTap.y);
    await sleep(400);
    const closedAfterTap = await page.evaluate(
      () => !document.querySelector('[data-ts-1005-probe="1"] [data-ts-pic-popup="1"]'),
    );
    assert.ok(closedAfterTap, `deliberate outside tap may close popover at ${viewport.width}`);

    await page.close();
  }

  const videoPage = await browser.newPage();
  await videoPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await videoPage.goto(`${preview.origin}/shared/${COPY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
  await clickTab(videoPage, 'Day-by-Day');
  await videoPage.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });
  await clickDayChip(videoPage, 2);
  await videoPage.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-ts-timeline-title]')].some((el) =>
        /statue of liberty/i.test(String(el.textContent || '')),
      ),
    { timeout: 120000 },
  );
  const statueTitle = await videoPage.evaluate(() => {
    const tl = document.querySelector('[data-ts-day-timeline]');
    if (!tl) return { err: 'no-timeline' };
    for (const btn of tl.querySelectorAll('[data-ts-timeline-title]')) {
      const title = String(btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/statue|liberty/i.test(title)) continue;
      btn.scrollIntoView({ block: 'center' });
      let row = btn.parentElement;
      for (let p = btn.parentElement; p && p !== tl; p = p.parentElement) {
        if (p.querySelectorAll('[data-ts-timeline-title]').length === 1 && p.querySelector('[data-ts-timeline-icon], [data-ts-tab-emoji]')) {
          row = p;
          break;
        }
      }
      return { title, rowText: String(row?.innerText || '').slice(0, 160) };
    }
    return { err: 'no-statue-title' };
  });
  assert.ok(statueTitle && !statueTitle.err, `Statue row missing on Day-by-Day: ${JSON.stringify(statueTitle)}`);
  await sleep(700);
  const videoThumb = await videoPage.evaluate(() => {
    const tl = document.querySelector('[data-ts-day-timeline]');
    if (!tl) return { err: 'no-timeline' };
    for (const btn of tl.querySelectorAll('[data-ts-timeline-title]')) {
      const title = String(btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/statue|liberty/i.test(title)) continue;
      let row = btn.parentElement;
      for (let p = btn.parentElement; p && p !== tl; p = p.parentElement) {
        if (p.querySelectorAll('[data-ts-timeline-title]').length === 1 && p.querySelector('[data-ts-timeline-icon], [data-ts-tab-emoji]')) {
          row = p;
          break;
        }
      }
      const videoWrap = row?.querySelector('[data-row-video-qr="1"]')?.closest('[data-ts-pic-thumb-wrap="1"]');
      if (!videoWrap) {
        const thumbCount = row?.querySelectorAll('[data-ts-pic-thumb-wrap="1"]').length ?? 0;
        return { err: 'no-video-wrap-on-row', title, thumbCount };
      }
      videoWrap.setAttribute('data-ts-1005-video-probe', '1');
      const link = videoWrap.querySelector('a');
      const r = link.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, title };
    }
    return { err: 'no-video-thumb', qrCount: document.querySelectorAll('[data-row-video-qr="1"]').length };
  });
  assert.ok(videoThumb && !videoThumb.err, `Day-by-Day video tile missing: ${JSON.stringify(videoThumb)}`);
  await videoPage.touchscreen.tap(videoThumb.x, videoThumb.y);
  await sleep(700);
  const videoAudit = await videoPage.evaluate(() => {
    const popup = document.querySelector('[data-ts-1005-video-probe="1"] [data-ts-pic-popup="1"]');
    const vid = popup?.querySelector('video');
    if (!popup || !vid) return { open: false };
    const rect = popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 4;
    return {
      open: true,
      inView: rect.left >= margin && rect.right <= vw - margin,
      hasControls: vid.hasAttribute('controls'),
      playsInline: vid.hasAttribute('playsinline') || vid.playsInline,
    };
  });
  assert.ok(videoAudit.open && videoAudit.inView, `video popover in viewport: ${JSON.stringify(videoAudit)}`);
  assert.ok(videoAudit.hasControls, 'inline video must expose controls');

  const videoScrollStart = await videoPage.evaluate(() => {
    const popup = document.querySelector('[data-ts-1005-video-probe="1"] [data-ts-pic-popup="1"]');
    const r = popup?.getBoundingClientRect();
    return { x: Math.min(window.innerWidth - 24, (r?.right ?? 0) + 48), y: Math.max(24, (r?.bottom ?? 0) + 72) };
  });
  await videoPage.touchscreen.touchStart(videoScrollStart.x, videoScrollStart.y);
  await videoPage.touchscreen.touchMove(videoScrollStart.x, videoScrollStart.y - 100);
  await videoPage.touchscreen.touchEnd();
  await sleep(400);
  const videoStillOpen = await videoPage.evaluate(() =>
    Boolean(document.querySelector('[data-ts-1005-video-probe="1"] [data-ts-pic-popup="1"]')),
  );
  assert.ok(videoStillOpen, 'outside touch-scroll must not dismiss video popover at 390px');

  const videoReady = await videoPage.evaluate(async () => {
    const vid = document.querySelector('[data-ts-1005-video-probe="1"] [data-ts-pic-popup="1"] video');
    if (!vid) return { ok: false, reason: 'no-video' };
    await new Promise((resolve) => {
      if (vid.readyState >= 1) resolve();
      else vid.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
    return { ok: vid.readyState >= 1, src: vid.currentSrc || vid.getAttribute('src') || '' };
  });
  assert.ok(videoReady.ok, `itinerary inline video metadata loaded: ${JSON.stringify(videoReady)}`);

  await videoPage.close();

  const rangeRes = await fetch(
    `${preview.origin}/api/bind-thing-media?shareToken=${encodeURIComponent(COPY_SLUG)}&id=${COPY_BIND_VIDEO_ID}&raw=1`,
    { headers: { Range: 'bytes=0-1' } },
  );
  assert.equal(rangeRes.status, 206, 'Range bytes=0-1 must return 206 on copy-trip media route');
  assert.match(String(rangeRes.headers.get('content-type') || ''), /video\/mp4/i);
  const ranged = Buffer.from(await rangeRes.arrayBuffer());
  assert.equal(ranged.length, 2);
} finally {
  await browser.close();
  await preview.close();
}

console.log('acceptance #1005 photo popover touch OK');