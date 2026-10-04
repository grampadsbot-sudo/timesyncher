#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { measureLogoComFromPngBuffer } from './shepherd-staging-smoke-logo-metrics.mjs';
import { logoChipInkPresent } from './lib/logo-pixel-ink-grade.mjs';

const BASE_SHA = 'bf44379f38e434b313719e0cfcec25d2a1c0bcd2';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const slug = 'intake-435a4d049b1d';
const hertzSrc = 'https://hertz.com/favicon.ico';
const widths = [390, 1280];
const artifactRoot = process.env.SHARED_LIVE_TAB_LOGO_ARTIFACT_ROOT || '/opt/cursor/artifacts/screenshots';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function send(res, status, body, type, extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': buf.length,
    ...extra,
  });
  res.end(buf);
}

async function startServer({ html, js, css, tripPayload, timelinePatch, brandFilter, mediaOverlay, staticBodies }) {
  const publicFiles = {
    '/ts-car-brand-filter.js': path.join(root, 'public/ts-car-brand-filter.js'),
    '/ts-thing-media-overlay.js': path.join(root, 'public/ts-thing-media-overlay.js'),
    '/post-purchase-gate.mjs': path.join(root, 'public/post-purchase-gate.mjs'),
  };
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/ts-timeline-icon-patch.js') return send(res, 200, timelinePatch, 'text/javascript; charset=utf-8');
    if (publicFiles[pathname]) {
      const file = await readFile(publicFiles[pathname]);
      const type = pathname.endsWith('.mjs') ? 'text/javascript' : 'text/javascript; charset=utf-8';
      return send(res, 200, file, type);
    }
    if (pathname === '/ts-car-brand-filter.js') return send(res, 200, brandFilter, 'text/javascript; charset=utf-8');
    if (pathname === '/ts-thing-media-overlay.js') return send(res, 200, mediaOverlay, 'text/javascript; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
    if (pathname.startsWith('/icons/')) return send(res, 200, Buffer.alloc(0), 'image/png');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === slug) {
        return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json');
    }
    if (staticBodies?.[pathname]) {
      const entry = staticBodies[pathname];
      return send(res, 200, entry.body, entry.type, entry.headers || {});
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{}', 'application/json');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
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

async function measureHertzRow(page) {
  return page.evaluate(() => {
    const row = [...document.querySelectorAll('li[data-list-row="1"]')].find((li) => /hertz/i.test(li.textContent || ''));
    if (!row) return { ok: false, reason: 'missing_row' };
    const img = row.querySelector('img.tiny-logo');
    const emoji = row.querySelector('[data-ts-logo-chip] .thing-emoji');
    if (!img) {
      if (emoji) return { ok: false, reason: 'emoji_only', emoji: emoji.textContent };
      return { ok: false, reason: 'missing_img' };
    }
    const box = img.getBoundingClientRect();
    const chip = img.closest('[data-ts-logo-chip]');
    const chipBox = chip?.getBoundingClientRect();
    return {
      ok: box.width >= 4 && box.height >= 4 && img.naturalWidth > 0 && img.naturalHeight > 0,
      reason: 'measured',
      src: String(img.currentSrc || img.getAttribute('src') || ''),
      w: box.width,
      h: box.height,
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      chipW: chipBox?.width,
      chipH: chipBox?.height,
      style: img.getAttribute('style') || '',
      rowRect: (() => {
        const r = row.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })(),
    };
  });
}

async function cropHertzRowPng(page) {
  const handle = await page.$('li[data-list-row="1"] [data-ts-logo-chip="1"]');
  if (!handle) return null;
  return handle.screenshot({ type: 'png', encoding: 'binary' });
}

async function runLogoScenario({
  html, js, css, payload, timelinePatch, brandFilter, mediaOverlay, hertzBody, hertzType, tag, saveShots,
}) {
  const app = await startServer({
    html,
    js,
    css,
    tripPayload: payload,
    timelinePatch,
    brandFilter,
    mediaOverlay,
    staticBodies: {
      '/__hertz-favicon.svg': {
        body: hertzBody,
        type: hertzType,
        headers: { 'x-content-type-options': 'nosniff' },
      },
    },
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (/hertz\.com\/favicon\.ico/i.test(url)) {
      return req.respond({
        status: 200,
        contentType: hertzType,
        headers: { 'X-Content-Type-Options': 'nosniff' },
        body: hertzBody,
      });
    }
    if (/hyatt\.com\/favicon|marriott\.com\/favicon/i.test(url)) {
      return req.respond({ status: 200, contentType: 'image/png', body: Buffer.alloc(8) });
    }
    return req.continue();
  });
  const out = [];
  try {
    await page.goto(`${app.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => (document.body?.innerText || '').includes('TimeSyncher Maui'), { timeout: 90000 });
    await sleep(1200);
    await clickTab(page, 'Cars');
    await sleep(1200);
    for (const width of widths) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await sleep(500);
      const row = await measureHertzRow(page);
      let ink = null;
      if (row.ok) {
        const png = await cropHertzRowPng(page);
        if (png) {
          ink = await measureLogoComFromPngBuffer(png);
          row.inkMass = ink?.mass;
          row.inkPresent = logoChipInkPresent(ink);
          if (saveShots && width === 390) {
            await mkdir(artifactRoot, { recursive: true });
            const shotPath = path.join(artifactRoot, `shared-live-tab-hertz-row-${tag}-${width}.png`);
            await writeFile(shotPath, png);
            if (row.rowRect && Number.isFinite(row.rowRect.y)) {
              const rowClip = {
                x: 0,
                y: Math.max(0, Math.floor(row.rowRect.y - 6)),
                width: 390,
                height: Math.max(36, Math.ceil(row.rowRect.height + 12)),
              };
              const rowPng = await page.screenshot({ type: 'png', clip: rowClip, encoding: 'binary' });
              await writeFile(path.join(artifactRoot, `shared-live-tab-hertz-row-crop-${tag}-${width}.png`), rowPng);
            }
          }
        }
      }
      out.push({ width, ...row });
    }
    return out;
  } finally {
    await page.close();
    await app.close();
  }
}

async function runGarbageScenario({ html, js, css, payload, timelinePatch, brandFilter, mediaOverlay }) {
  const garbage = Buffer.from('not-valid-svg-bytes', 'utf8');
  const app = await startServer({
    html,
    js,
    css,
    tripPayload: payload,
    timelinePatch,
    brandFilter,
    mediaOverlay,
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (/hertz\.com\/favicon\.ico/i.test(req.url())) {
      return req.respond({
        status: 200,
        contentType: 'image/svg+xml',
        headers: { 'X-Content-Type-Options': 'nosniff' },
        body: garbage,
      });
    }
    return req.continue();
  });
  try {
    await page.goto(`${app.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1200);
    await clickTab(page, 'Cars');
    await sleep(1500);
    await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 1 });
    await sleep(600);
    return page.evaluate(() => {
      const row = [...document.querySelectorAll('li[data-list-row="1"]')].find((li) => /hertz/i.test(li.textContent || ''));
      const chip = row?.querySelector('[data-ts-logo-chip]');
      const img = chip?.querySelector('img.tiny-logo');
      const emoji = chip?.querySelector('.thing-emoji');
      const chipBox = chip?.getBoundingClientRect();
      return {
        hasEmoji: Boolean(emoji && (emoji.textContent || '').includes('🚗')),
        hasImg: Boolean(img && img.offsetParent !== null && img.getBoundingClientRect().width > 0),
        chipW: chipBox?.width,
        chipH: chipBox?.height,
        chipFailed: chip?.dataset?.tsLogoFailed === '1',
      };
    });
  } finally {
    await page.close();
    await app.close();
  }
}

const hertzSvg = await readFile(path.join(root, 'scripts/fixtures/hertz-favicon.svg'));
assert.equal(hertzSvg.length, 509);

function hertzTripPayload() {
  const shared = sharedTripFromIntake({
    trip: {
      id: '435a4d04-9b1d-4a2e-8f0a-intake435a',
      title: 'TimeSyncher Maui March 2027',
      destination: 'Maui',
      start_date: '2027-03-10',
      end_date: '2027-03-17',
      metadata: { intakeShare: true, publicSlug: slug },
    },
    things: [
      thingRecordFromTripRow({
        id: 'car-hertz-fixture',
        category: 'car',
        title: 'Hertz Car Rental - Kahului Airport',
        description: '',
        source: 'brave',
        location: { lat: 20.89, lng: -156.43, address: 'OGG' },
        metadata: {
          categoryName: 'Store',
          providerCategories: ['Store', 'Car rental'],
          sourceRecord: { url: 'https://hertz.com/', source: 'brave' },
          logoUrl: hertzSrc,
        },
      }),
    ],
  });
  return finalizeServedSharedTripPayload(shared);
}

function baseLiveTabListsFromHead(liveTabLists) {
  const cars = liveTabLists.cars.map((row) => row
    .replace(/width:18px;height:18px;max-width:18px;max-height:18px;/g, 'max-width:100%;max-height:100%;width:auto;height:auto;')
    .replace(/ onerror="[^"]*"/g, '')
    .replace(/ onload="[^"]*"/g, '')
    .replace(/ data-ts-fallback-emoji="[^"]*"/g, ''));
  return { ...liveTabLists, cars };
}

const headPayload = hertzTripPayload();
assert.match(headPayload.liveTabLists.cars.join(''), /width:18px;height:18px/);
assert.match(headPayload.liveTabLists.cars.join(''), /data-ts-fallback-emoji="🚗"/);

const basePayload = { ...headPayload, liveTabLists: baseLiveTabListsFromHead(headPayload.liveTabLists) };
assert.doesNotMatch(basePayload.liveTabLists.cars.join(''), /width:18px;height:18px/);

const [html, css, js, timelinePatch, brandFilter, mediaOverlay] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-timeline-icon-patch.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-car-brand-filter.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-thing-media-overlay.js'), 'utf8'),
]);

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const sharedFiles = { html, js, css, timelinePatch, brandFilter, mediaOverlay };
const baseResults = await runLogoScenario({
  ...sharedFiles,
  payload: basePayload,
  hertzBody: hertzSvg,
  hertzType: 'image/svg+xml',
  tag: `base-${BASE_SHA.slice(0, 7)}`,
  saveShots: true,
});
const headResults = await runLogoScenario({
  ...sharedFiles,
  payload: headPayload,
  hertzBody: hertzSvg,
  hertzType: 'image/svg+xml',
  tag: 'head',
  saveShots: true,
});
const garbage = await runGarbageScenario({ ...sharedFiles, payload: headPayload });
await browser.close();

const baseModuleSrc = execFileSync('git', ['show', `${BASE_SHA}:src/vacation/shared-trip-live-tab-lists.mjs`], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024,
});
assert.doesNotMatch(
  baseModuleSrc,
  /width:18px;height:18px/,
  `expected ${BASE_SHA} list-row logos to lack explicit 18px box (test would fail before fix)`,
);
assert.match(
  await readFile(path.join(root, 'src/vacation/shared-trip-live-tab-lists.mjs'), 'utf8'),
  /width:18px;height:18px/,
);
assert.match(baseResults[0]?.style || '', /width:auto;height:auto/);
assert.doesNotMatch(headResults[0]?.style || '', /width:auto;height:auto/);
assert.equal(
  headResults.every((row) => row.ok === true && row.inkPresent === true && row.w >= 4 && row.h >= 4),
  true,
  `expected head to paint Hertz logo chip: ${JSON.stringify(headResults)}`,
);
assert.equal(garbage.hasEmoji, true, `garbage svg should fall back to car emoji: ${JSON.stringify(garbage)}`);
assert.equal(garbage.hasImg, false, `garbage svg should not keep visible img: ${JSON.stringify(garbage)}`);
assert.ok((garbage.chipW || 0) >= 12 && (garbage.chipH || 0) >= 12);

console.log(JSON.stringify({ baseResults, headResults, garbage }, null, 2));
console.log('shared trip live tab logo chip chrome tests passed');
