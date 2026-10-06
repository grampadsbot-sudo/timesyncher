#!/usr/bin/env node
/** PR #225 gate (a)+(b): chip tabs pixel match prod + exact chip text @390/1280. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { patchSharedTripHostnameForLocalHarness } from '../src/vacation/trek-live-product-patches.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from './fixtures/nyc-pr225-shared-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const outRoot = process.env.PR225_SBS_OUT || process.env.PR225_R7_ARTIFACT_ROOT || '/opt/cursor/artifacts/pr225-nyc-sbs-r7';
const bundleName = 'index-BMaU4y5m.js';
const travelBase = `https://${['travel', 'timesyncher', 'com'].join('.')}`;
const prodBundleUrl = `${travelBase}/assets/${bundleName}`;

const CASES = [
  ['Hotels', 'hotels', ['All areas', 'Midtown / Central Park South']],
  ['Restaurants', 'restaurants', ['All areas', 'Citywide / Flexible']],
  ['Stores', 'stores', ['All areas', 'Midtown / Central Park South']],
  [
    'The Rest',
    'events',
    [
      'All areas',
      'Citywide / Flexible',
      'All types',
      'event',
      'Family Event',
      'tickets',
      'bar',
      'music',
      'workout',
      'artist',
      'theatre',
      'sightseeing',
      'tour',
      'transport',
      'other',
    ],
  ],
];
const WIDTHS = [
  { width: 390, tag: '390' },
  { width: 1280, tag: '1280' },
];
const TAB_LABELS = [
  'Day-by-Day',
  'Flights',
  'Hotels',
  'Cars',
  'Restaurants',
  'Stores',
  'The Rest',
  'Budget',
];

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

async function loadProdBundle() {
  const cache = path.join(outRoot, bundleName);
  try {
    return await readFile(cache);
  } catch {
    const res = await fetch(prodBundleUrl);
    if (!res.ok) throw new Error(`fetch ${prodBundleUrl} HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(outRoot, { recursive: true });
    await writeFile(cache, buf);
    return buf;
  }
}

async function startServer({ html, js, css, tripPayload, bundlePath }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === bundlePath) return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname === '/post-purchase-gate.mjs') {
      return send(res, 200, await readFile(path.join(root, 'public/post-purchase-gate.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname === '/ts-timeline-icon-patch.js' || pathname === '/ts-car-brand-filter.js' || pathname === '/ts-thing-media-overlay.js') {
      return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
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
    if (m && decodeURIComponent(m[1]) === NYC_PR225_SLUG) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
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

function pixelDiff(a, b, maxMismatchRatio = 0.04) {
  const da = downscale(a);
  const db = downscale(b);
  const w = Math.min(da.width, db.width);
  const h = Math.min(da.height, db.height);
  let mism = 0;
  const total = w * h;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const j = (da.width * y + x) << 2;
      const k = (db.width * y + x) << 2;
      if (Math.abs(da.data[j] - db.data[k]) > 18
        || Math.abs(da.data[j + 1] - db.data[k + 1]) > 18
        || Math.abs(da.data[j + 2] - db.data[k + 2]) > 18) mism += 1;
    }
  }
  assert.ok(mism / total <= maxMismatchRatio, `pixel mismatch ${mism}/${total}`);
}

async function captureHeader(page, tabLabel) {
  await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button,[role="tab"]')) {
      if (btn.getAttribute('aria-label') === want) btn.click();
    }
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollLeft = 0;
  }, tabLabel);
  await new Promise((r) => setTimeout(r, 500));
  const meta = await page.evaluate((wantTab) => {
    const rowLabels = (seedText) => {
      const seed = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').replace(/\s+/g, ' ').trim() === seedText);
      if (!seed || !seed.parentElement) return [];
      return [...seed.parentElement.querySelectorAll('button')].map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim());
    };
    const areaRow = rowLabels('All areas');
    const typeRow = wantTab === 'The Rest' ? rowLabels('All types') : [];
    const labels = [...areaRow, ...typeRow];
    const sortButtons = [...document.querySelectorAll('button')].filter((b) => {
      const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      return t === 'Name' || /^Price\b/.test(t);
    });
    const chipButtons = [...document.querySelectorAll('button')].filter((b) => {
      const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      return areaRow.includes(t) || typeRow.includes(t);
    });
    const nodes = [...chipButtons, ...sortButtons];
    if (!nodes.length) {
      return { clip: { x: 0, y: 0, width: window.innerWidth, height: 1 }, areaButtons: labels };
    }
    const box = nodes.reduce((acc, el) => {
      const r = el.getBoundingClientRect();
      return {
        left: Math.min(acc.left, r.left),
        top: Math.min(acc.top, r.top),
        right: Math.max(acc.right, r.right),
        bottom: Math.max(acc.bottom, r.bottom),
      };
    }, { left: Infinity, top: Infinity, right: 0, bottom: 0 });
    return {
      clip: {
        x: Math.max(0, Math.floor(box.left - 6)),
        y: Math.max(0, Math.floor(box.top - 6)),
        width: Math.ceil(box.right - box.left + 12),
        height: Math.ceil(box.bottom - box.top + 12),
      },
      areaButtons: labels,
    };
  }, tabLabel);
  const shot = await page.screenshot({ type: 'png', encoding: 'binary', clip: meta.clip });
  return { png: shot, chips: meta.areaButtons };
}

async function measureListContainer(page, tabLabel) {
  await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button,[role="tab"]')) {
      if (btn.getAttribute('aria-label') === want) btn.click();
    }
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollLeft = 0;
  }, tabLabel);
  await new Promise((r) => setTimeout(r, 400));
  return page.evaluate((want) => {
    const climb = (start) => {
      let el = start;
      for (let i = 0; i < 30 && el; i += 1) {
        const cs = getComputedStyle(el);
        const maxW = parseFloat(cs.maxWidth);
        const r = el.getBoundingClientRect();
        if (Number.isFinite(maxW) && maxW >= 1110 && maxW <= 1130 && r.width >= 1000) {
          return { left: r.left, right: r.right };
        }
        el = el.parentElement;
      }
      return null;
    };
    const tabBtn = [...document.querySelectorAll('button,[role="tab"]')].find((b) => b.getAttribute('aria-label') === want);
    const fromTab = tabBtn ? climb(tabBtn.parentElement) : null;
    if (fromTab) return fromTab;
    const nameBtn = [...document.querySelectorAll('button')].find((b) => /^Name$/i.test((b.textContent || '').trim()));
    const fromSort = nameBtn ? climb(nameBtn.parentElement) : null;
    if (fromSort) return fromSort;
    throw new Error(`list container not found for ${want}`);
  }, tabLabel);
}

const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip()));
const bundlePath = `/assets/${bundleName}`;
const prodJs = patchSharedTripHostnameForLocalHarness((await loadProdBundle()).toString('utf8'));
const [htmlRaw, css, patchedJs] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
]);
const html = htmlRaw.replace("trek.src = '/assets/index-BKun7ofk.js'", `trek.src = '${bundlePath}'`);
await mkdir(outRoot, { recursive: true });

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const edgeLines = [];
try {
  for (const { width, tag } of WIDTHS) {
    for (const [tabLabel, stem, expectedChips] of CASES) {
      for (const [label, js] of [['nyc-final', prodJs], ['live-patched', patchedJs]]) {
        const app = await startServer({ html, js, css, tripPayload, bundlePath });
        const page = await browser.newPage();
        await page.setViewport({ width, height: width === 390 ? 844 : 800 });
        await page.goto(`${app.origin}/shared/${NYC_PR225_SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => /Day-by-Day/i.test(document.body?.innerText || ''), { timeout: 90000 });
        const { png, chips } = await captureHeader(page, tabLabel);
        const outPath = path.join(outRoot, `${label}-${stem}-chips-sort-${tag}.png`);
        await writeFile(outPath, png);
        if (label === 'nyc-final') {
          await writeFile(path.join(outRoot, `_ref-${stem}-chips-sort-${tag}.png`), png);
        }
        await page.close();
        await app.close();
        if (label === 'live-patched') {
          assert.deepEqual(chips, expectedChips, `${stem}@${tag} chip text`);
          const ref = PNG.sync.read(await readFile(path.join(outRoot, `_ref-${stem}-chips-sort-${tag}.png`)));
          const got = PNG.sync.read(png);
          pixelDiff(ref, got);
        }
      }
    }
  }

  for (const tabLabel of TAB_LABELS) {
    let prodRect;
    {
      const app = await startServer({ html, js: prodJs, css, tripPayload, bundlePath });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${app.origin}/shared/${NYC_PR225_SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => /Day-by-Day/i.test(document.body?.innerText || ''), { timeout: 90000 });
      prodRect = await measureListContainer(page, tabLabel);
      await page.close();
      await app.close();
    }
    {
      const app = await startServer({ html, js: patchedJs, css, tripPayload, bundlePath });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${app.origin}/shared/${NYC_PR225_SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => /Day-by-Day/i.test(document.body?.innerText || ''), { timeout: 90000 });
      const servedRect = await measureListContainer(page, tabLabel);
      assert.ok(Math.abs(prodRect.left - servedRect.left) <= 2, `${tabLabel} left edge prod=${prodRect.left} served=${servedRect.left}`);
      assert.ok(Math.abs(prodRect.right - servedRect.right) <= 2, `${tabLabel} right edge prod=${prodRect.right} served=${servedRect.right}`);
      edgeLines.push(`${tabLabel}: L prod=${prodRect.left.toFixed(1)} served=${servedRect.left.toFixed(1)} | R prod=${prodRect.right.toFixed(1)} served=${servedRect.right.toFixed(1)}`);
      await page.close();
      await app.close();
    }
  }

  const app = await startServer({ html, js: patchedJs, css, tripPayload, bundlePath });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${app.origin}/shared/${NYC_PR225_SLUG}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Day-by-Day/i.test(document.body?.innerText || ''), { timeout: 90000 });
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if ((btn.textContent || '').trim() === 'Midtown / Central Park South') btn.click();
    }
  });
  await new Promise((r) => setTimeout(r, 300));
  const hotelVisible = await page.evaluate(() => /Midtown sample hotel/i.test(document.body?.innerText || ''));
  assert.equal(hotelVisible, true, 'area chip filters hotels');
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button,[role="tab"]')) {
      if (btn.getAttribute('aria-label') === 'Restaurants') btn.click();
    }
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if ((btn.textContent || '').trim() === 'Citywide / Flexible') btn.click();
    }
  });
  await new Promise((r) => setTimeout(r, 300));
  const restVisible = await page.evaluate(() => /Sample NYC restaurant/i.test(document.body?.innerText || ''));
  assert.equal(restVisible, true, 'area chip filters restaurants');
  await page.close();
  await app.close();
} finally {
  await browser.close();
}

console.log('PR225 area chips layout gate (a)+(b)+(c) passed');
console.log(`gate1280-edges: ${edgeLines.join('; ')}`);
