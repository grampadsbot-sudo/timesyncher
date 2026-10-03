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

const BASE_SHA = '04207311e27a891ef2fdd5cc3c74be1e1dd0ce47';
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const slug = 'intake-c15be2f6d7bf';
const widths = [390, 1280];
const artifactRoot = process.env.SHARED_CARS_LOGO_ARTIFACT_ROOT || '/opt/cursor/artifacts/screenshots';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function carRentalPayload() {
  const shared = sharedTripFromIntake({
    trip: {
      id: 'c15be2f6-d7bf-498a-b2e7-aa2b828dfab6',
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
          logoUrl: '/car-rental-logo.png',
        },
      }),
    ],
  });
  const place = shared.places[0];
  place.image_url = '/car-rental-logo.png';
  const key = `place:${place.id}`;
  delete shared.thingOverrides[key].logoUrl;
  delete place.logoUrl;
  return finalizeServedSharedTripPayload(shared);
}

function sendText(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

async function startServer({ html, js, css, tripPayload, timelinePatch }) {
  const publicFiles = {
    '/ts-car-brand-filter.js': path.join(root, 'public/ts-car-brand-filter.js'),
    '/ts-thing-media-overlay.js': path.join(root, 'public/ts-thing-media-overlay.js'),
    '/post-purchase-gate.mjs': path.join(root, 'public/post-purchase-gate.mjs'),
  };
  const logoPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return sendText(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return sendText(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/ts-timeline-icon-patch.js') {
      return sendText(res, 200, timelinePatch, 'text/javascript; charset=utf-8');
    }
    if (pathname === '/car-rental-logo.png') return sendText(res, 200, logoPng, 'image/png');
    if (publicFiles[pathname]) {
      const file = await readFile(publicFiles[pathname]);
      const type = pathname.endsWith('.mjs') ? 'text/javascript' : 'text/javascript; charset=utf-8';
      return sendText(res, 200, file, type);
    }
    if (pathname === '/manifest.webmanifest') {
      return sendJson(res, 200, { name: 'TimeSyncher Vacation', start_url: '/' });
    }
    if (pathname.startsWith('/icons/')) return sendText(res, 200, '', 'image/png');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return sendText(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === slug) return sendJson(res, 200, tripPayload);
      return sendJson(res, 404, { error: 'missing' });
    }
    if (pathname.startsWith('/api/')) return sendJson(res, 200, { ok: true });
    sendJson(res, 404, { error: 'not found' });
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

async function measureCarsBrandLogo(page, { saveScreenshots = false, tag = 'head', expectPass = true }) {
  const out = [];
  for (const width of widths) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await sleep(400);
    if (expectPass) {
      await page.waitForFunction(
        () => {
          const img = document.querySelector('li[data-list-row="1"] img.tiny-logo');
          return img && img.complete && img.naturalWidth > 0;
        },
        { timeout: 10000 },
      );
    } else {
      await sleep(800);
    }
    const row = await page.evaluate(() => {
      const img = document.querySelector('li[data-list-row="1"] img.tiny-logo');
      if (!img) return { ok: false, reason: 'missing_img' };
      const src = String(img.getAttribute('src') || '').trim();
      if (!src || src.includes('timesyncher-icon')) return { ok: false, reason: 'bad_src', src };
      const box = img.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) return { ok: false, reason: 'zero_layout', src, w: box.width, h: box.height };
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        return { ok: false, reason: 'zero_natural', src, nw: img.naturalWidth, nh: img.naturalHeight };
      }
      return { ok: true, src, w: box.width, h: box.height, nw: img.naturalWidth, nh: img.naturalHeight };
    });
    if (saveScreenshots) {
      await mkdir(artifactRoot, { recursive: true });
      const shotPath = path.join(artifactRoot, `shared-cars-logo-${tag}-${width}.png`);
      await page.screenshot({ path: shotPath, type: 'png' });
      await writeFile(`${shotPath}.json`, `${JSON.stringify({ width, row }, null, 2)}\n`);
    }
    out.push({ width, ...row });
  }
  return out;
}

async function runScenario({ html, js, css, payload, timelinePatch, saveScreenshots, tag, expectPass }) {
  const app = await startServer({ html, js, css, tripPayload: payload, timelinePatch });
  const page = await browser.newPage();
  try {
    await page.goto(`${app.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => (document.body?.innerText || '').includes('TimeSyncher Maui'),
      { timeout: 90000 },
    );
    await sleep(1500);
    await clickTab(page, 'Cars');
    await sleep(1200);
    return await measureCarsBrandLogo(page, { saveScreenshots, tag, expectPass });
  } finally {
    await page.close();
    await app.close();
  }
}

const payload = carRentalPayload();
assert.match(payload.liveTabLists.cars.join('\n'), /img class="tiny-logo" src="\/car-rental-logo\.png"/);

const [html, css, js, headPatch] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/ts-timeline-icon-patch.js'), 'utf8'),
]);
const basePatch = execFileSync('git', ['show', `${BASE_SHA}:public/ts-timeline-icon-patch.js`], {
  encoding: 'utf8',
  maxBuffer: 512 * 1024,
});

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const baseResults = await runScenario({
  html,
  js,
  css,
  payload,
  timelinePatch: basePatch,
  saveScreenshots: true,
  tag: 'base-0420731',
  expectPass: false,
});
const headResults = await runScenario({
  html,
  js,
  css,
  payload,
  timelinePatch: headPatch,
  saveScreenshots: true,
  tag: 'head',
  expectPass: true,
});
await browser.close();

assert.equal(baseResults.every((row) => row.ok === false), true, `expected base ${BASE_SHA} to miss visible car logos: ${JSON.stringify(baseResults)}`);
assert.equal(headResults.every((row) => row.ok === true), true, `expected head to show car logos: ${JSON.stringify(headResults)}`);
for (const row of headResults) {
  assert.match(row.src, /\/car-rental-logo\.png$/);
}

console.log(JSON.stringify({ base: baseResults, head: headResults }, null, 2));
console.log('shared trip cars tab logo served chrome tests passed');
