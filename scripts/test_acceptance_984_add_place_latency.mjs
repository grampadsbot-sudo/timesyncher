#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import { resetSharedUpstreamCacheForTests } from '../src/vacation/shared-trip-upstream-cache.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': buf.length,
  });
  res.end(buf);
}

const sharedRaw = buildNycCraigKimDaybydayTrip();
const slug = `accept984-${Date.now().toString(36)}`;
let trekTrip = structuredClone(sharedRaw);
const tripId = trekTrip.trip?.id ?? 99;

const [html, js, css] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
]);

const publicJs = [
  '/vacation-app-request.js',
  '/ts-timeline-icon-patch.js',
  '/ts-car-brand-filter.js',
  '/ts-thing-media-overlay.js',
  '/post-purchase-gate.mjs',
  '/ts-vk-rebrand-chrome.js',
  '/ts-pic-popup-viewer.js',
  '/ts-trip-hero-collapse.js',
];

const trekServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === `/api/shared/${slug}/` || pathname === `/api/shared/${slug}`) {
    return send(res, 200, JSON.stringify(trekTrip), 'application/json; charset=utf-8');
  }
  if (req.method === 'POST' && pathname === `/api/trips/${tripId}/places`) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const nextId = Math.max(0, ...trekTrip.places.map((p) => Number(p.id) || 0)) + 1;
    const row = {
      id: nextId,
      trip_id: tripId,
      name: body.name || body.title || 'Acceptance probe',
      category: body.category || { id: 3, name: 'Restaurant', icon: '🍽️' },
      category_name: typeof body.category === 'string' ? body.category : 'Restaurant',
      lat: body.lat ?? 40.751,
      lng: body.lng ?? -73.985,
      address: body.address || '',
    };
    trekTrip.places.push(row);
    return send(res, 201, JSON.stringify(row), 'application/json; charset=utf-8');
  }
  send(res, 404, '{"error":"missing"}', 'application/json; charset=utf-8');
});

await new Promise((resolve) => trekServer.listen(0, '127.0.0.1', resolve));
const trekOrigin = `http://127.0.0.1:${trekServer.address().port}`;

const prevTrek = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = trekOrigin;
resetSharedUpstreamCacheForTests();

const appServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
  if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
  if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/json');
  if (publicJs.includes(pathname)) {
    return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
  }
  if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":true}', 'application/json; charset=utf-8');
  if (pathname === `/api/trips/${tripId}/places` && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const upstream = await fetch(`${trekOrigin}/api/trips/${tripId}/places`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.concat(chunks),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  if (pathname.startsWith('/api/shared/') || pathname.startsWith('/api/shared-trip/')) {
    return sharedTripHandler(req, res);
  }
  if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
  if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true}', 'application/json; charset=utf-8');
  send(res, 404, 'no', 'text/plain');
});

await new Promise((resolve) => appServer.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${appServer.address().port}`;

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function confirmToListMs(probeName) {
  trekTrip = structuredClone(sharedRaw);
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${origin}/shared/${slug}/`, { waitUntil: 'networkidle2', timeout: 240000 });
  await page.waitForFunction(
    () => (document.body?.innerText || '').includes('Carbone'),
    { timeout: 180000 },
  );
  const t0 = Date.now();
  await page.evaluate(async ({ tripId, probeName }) => {
    const create = await fetch(`/api/trips/${tripId}/places`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: probeName,
        category: 'restaurant',
        lat: 40.7512,
        lng: -73.9851,
        address: '390 W 55th St, New York, NY',
      }),
    });
    if (!create.ok) throw new Error(`add-place confirm failed: ${create.status}`);
  }, { tripId, probeName });
  await page.reload({ waitUntil: 'networkidle2', timeout: 240000 });
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find((b) => /restaurants/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    tab?.click();
  });
  await page.waitForFunction(
    (name) => {
      const tab = document.querySelector('[data-shared-live-tab="restaurants"]') || document.body;
      return (tab.textContent || '').includes(name);
    },
    { timeout: 120000 },
    probeName,
  );
  const durationMs = Date.now() - t0;
  await page.close();
  return durationMs;
}

const durations = [];
try {
  for (let i = 0; i < 3; i += 1) {
    const probeName = `Accept984 List Probe ${i}-${Date.now()}`;
    const durationMs = await confirmToListMs(probeName);
    assert.ok(durationMs > 0, 'duration recorded');
    durations.push(durationMs);
    console.log(JSON.stringify({ event: 'acceptance_984_add_place_run', run: i + 1, duration_ms: durationMs, probeName }));
  }
} finally {
  await browser.close();
  await new Promise((resolve) => appServer.close(() => resolve()));
  await new Promise((resolve) => trekServer.close(() => resolve()));
  resetSharedUpstreamCacheForTests();
  if (prevTrek == null) delete process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
  else process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = prevTrek;
}

const medianMs = median(durations);
assert.ok(Number.isFinite(medianMs) && medianMs > 0, 'median duration');
console.log(
  JSON.stringify({
    event: 'acceptance_984_add_place_median',
    median_ms: Math.round(medianMs),
    runs: durations.length,
    durations_ms: durations.map((n) => Math.round(n)),
    viewport: { width: 390, height: 844 },
  }),
);
