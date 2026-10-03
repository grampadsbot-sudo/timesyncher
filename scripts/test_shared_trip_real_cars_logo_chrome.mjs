#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { unpaintableLogoEmbed } from '../src/vacation/shared-logo-paint.mjs';

const BASE_SHA = '0b61d1d284e97b67203c3cfe103d25ecdc211dd0';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const slug = 'intake-435a4d049b1d';
const hertzSrc = 'https://hertz.com/favicon.ico';
const widths = [390, 1280];
const artifactRoot = process.env.SHARED_CARS_LOGO_ARTIFACT_ROOT || '/opt/cursor/artifacts/screenshots';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR42mMQlFD/TwlmoJoBnw8zkIQHoQEDH4hUiwVkSWLERg0YFgkJANGKvCQGtOn+AAAAAElFTkSuQmCC',
  'base64',
);

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

async function startServer({ html, js, css, tripPayload, timelinePatch, brandFilter, mediaOverlay }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/ts-timeline-icon-patch.js') return send(res, 200, timelinePatch, 'text/javascript; charset=utf-8');
    if (pathname === '/ts-car-brand-filter.js') return send(res, 200, brandFilter, 'text/javascript; charset=utf-8');
    if (pathname === '/ts-thing-media-overlay.js') return send(res, 200, mediaOverlay, 'text/javascript; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname.startsWith('/icons/')) return send(res, 200, png, 'image/png');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === slug) return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      return send(res, 404, '{}', 'application/json');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{}', 'application/json');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://vacation-staging.timesyncher.com:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickTab(page, label) {
  const clicked = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.getAttribute('aria-label') === want) {
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
  if (!clicked) throw new Error(`tab button missing: ${label}`);
}

function rowMeasure(tab) {
  const root = document.querySelector(`[data-shared-live-tab="${tab}"]`) || document;
  const img = root.querySelector('img.tiny-logo');
  if (!img) return { ok: false, reason: 'missing_img' };
  const src = String(img.currentSrc || img.getAttribute('src') || '').trim();
  const box = img.getBoundingClientRect();
  const visible = box.width >= 4 && box.height >= 4 && img.offsetParent !== null;
  if (!visible || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    return { ok: false, reason: 'not_painted', src, nw: img.naturalWidth, nh: img.naturalHeight, w: box.width, h: box.height };
  }
  return { ok: true, src, nw: img.naturalWidth, nh: img.naturalHeight, w: box.width, h: box.height };
}

async function measure(page, { save, tag }) {
  const out = [];
  for (const width of widths) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await clickTab(page, 'Hotels');
    await sleep(600);
    const hotels = await page.evaluate(rowMeasure, 'hotels');
    await clickTab(page, 'Cars');
    await sleep(700);
    const row = await page.evaluate(rowMeasure, 'cars');
    if (save) {
      await mkdir(artifactRoot, { recursive: true });
      const shotPath = path.join(artifactRoot, `real-cars-logo-${tag}-${width}.png`);
      await page.screenshot({ path: shotPath, type: 'png' });
    }
    out.push({ width, ...row, hotelsOk: hotels.ok === true, hotelsSrc: hotels.src, hotelsNw: hotels.nw });
  }
  return out;
}

async function runScenario({ html, js, css, payload, timelinePatch, brandFilter, mediaOverlay, mode, save, tag }) {
  const app = await startServer({ html, js, css, tripPayload: payload, timelinePatch, brandFilter, mediaOverlay });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/hertz\.com\/favicon\.ico/i.test(url)) {
      if (mode === 'png') return req.respond({ status: 200, contentType: 'image/png', body: png });
      return req.abort('failed');
    }
    if (/hyatt\.com\/favicon|marriott\.com\/favicon/i.test(url)) {
      return req.respond({ status: 200, contentType: 'image/png', body: png });
    }
    return req.continue();
  });
  try {
    await page.goto(`${app.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => (document.body?.innerText || '').includes('Maui'), { timeout: 90000 });
    return await measure(page, { save, tag });
  } finally {
    await page.close();
    await app.close();
  }
}

const fixture = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/intake-435a4d049b1d.json'), 'utf8'));
const svg = await readFile(path.join(root, 'scripts/fixtures/hertz-favicon.svg'));
const embed = unpaintableLogoEmbed(svg, 'image/svg+xml');
assert.equal(embed?.kind, 'svg');
const headPayload = finalizeServedSharedTripPayload(fixture, {
  logoBodies: new Map([[hertzSrc, embed]]),
});
assert.match(headPayload.liveTabLists.cars.join(''), new RegExp(`src="${hertzSrc.replace(/[.]/g, '\\.')}"`));
assert.match(headPayload.liveTabLists.cars.join(''), /data-logo-bytes="/);
assert.match(fixture.liveTabLists.cars.join(''), /img class="tiny-logo" src="https:\/\/hertz\.com\/favicon\.ico"/);
assert.doesNotMatch(fixture.liveTabLists.cars.join(''), /data-logo-bytes/);

const [html, css, js, headPatch, brandFilter, mediaOverlay] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-timeline-icon-patch.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-car-brand-filter.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-thing-media-overlay.js'), 'utf8'),
]);
const basePatch = execFileSync('git', ['show', `${BASE_SHA}:public/ts-timeline-icon-patch.js`], { encoding: 'utf8', maxBuffer: 512 * 1024 });

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--host-resolver-rules=MAP vacation-staging.timesyncher.com 127.0.0.1',
  ],
});

const sharedFiles = { html, js, css, brandFilter, mediaOverlay };
const blockedBase = await runScenario({ ...sharedFiles, payload: fixture, timelinePatch: basePatch, mode: 'blocked', save: true, tag: 'base-blocked' });
const blockedHead = await runScenario({ ...sharedFiles, payload: headPayload, timelinePatch: headPatch, mode: 'blocked', save: true, tag: 'head-blocked' });
const pngHead = await runScenario({ ...sharedFiles, payload: fixture, timelinePatch: headPatch, mode: 'png', save: true, tag: 'head-png' });
const pngBase = await runScenario({ ...sharedFiles, payload: fixture, timelinePatch: basePatch, mode: 'png', save: false, tag: 'base-png' });
await browser.close();

assert.equal(blockedBase.every((row) => row.ok === false), true, `0b61d1d should miss a painted cars logo when the favicon does not decode: ${JSON.stringify(blockedBase)}`);
assert.equal(blockedHead.every((row) => row.ok === true && row.hotelsOk === true), true, `head should paint cars and hotels when the favicon does not decode: ${JSON.stringify(blockedHead)}`);
assert.equal(pngHead.every((row) => row.ok === true && row.src === hertzSrc && row.nw > 0 && row.hotelsOk === true), true, `png intercept should keep the Hertz src: ${JSON.stringify(pngHead)}`);
assert.equal(pngBase.every((row) => row.ok === true && row.src === hertzSrc), true, `decoded png already paints on 0b61d1d: ${JSON.stringify(pngBase)}`);

console.log(JSON.stringify({ blockedBase, blockedHead, pngHead, pngBase }, null, 2));
console.log('real shared cars logo chrome test passed');
