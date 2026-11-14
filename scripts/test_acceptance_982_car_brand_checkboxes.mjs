#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { NYC_DAYBYDAY_SLUG } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
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
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': buf.length,
  });
  res.end(buf);
}

const liveApiRaw = JSON.parse(
  await readFile(path.join(root, 'scripts/fixtures/nyc-screen-trip99-live-shared-api.json'), 'utf8'),
);
const tripPayload = finalizeServedSharedTripPayload(liveApiRaw);
const expectedCarBrandKeys = (() => {
  const brands = new Set();
  const ovs = tripPayload.thingOverrides || {};
  for (const place of liveApiRaw.places || []) {
    const cat = typeof place.category === 'object' ? place.category?.name : place.category;
    if (cat !== 'Car') continue;
    const rc = String(ovs[`place:${place.id}`]?.rentalCompany || '').trim();
    if (rc) brands.add(rc.toLowerCase());
  }
  return [...brands].sort();
})();

const [html, js, css, carFilter] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/ts-car-brand-filter.js'), 'utf8'),
]);

const publicJs = [
  '/vacation-app-request.js',
  '/ts-timeline-icon-patch.js',
  '/ts-car-brand-filter.js',
  '/ts-thing-media-overlay.js',
  '/post-purchase-gate.mjs',
];

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
  if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
  if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
  if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
  if (pathname === '/ts-car-brand-filter.js') return send(res, 200, carFilter, 'text/javascript; charset=utf-8');
  if (publicJs.includes(pathname)) {
    return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
  }
  if (pathname === '/ts-thing-media/bindings.json') {
    return send(
      res,
      200,
      await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'),
      'application/json; charset=utf-8',
    );
  }
  if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":true}', 'application/json; charset=utf-8');
  if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
  const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
  if (sharedMatch && req.method === 'GET' && decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
    return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
  }
  if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true}', 'application/json; charset=utf-8');
  send(res, 404, 'no', 'text/plain');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function clickCarsTab(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /^cars$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 900));
}

async function carsSnap(page) {
  return page.evaluate(() => {
    const carsRoot = document.querySelector('[data-shared-live-tab="cars"]');
    const visibleRows = [...document.querySelectorAll('[data-shared-live-tab="cars"] [data-list-row]')].filter(
      (el) => el.offsetParent !== null,
    );
    const removeBtns = [...document.querySelectorAll('button')].filter((b) => {
      const label = String(b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim();
      return /^remove\b/i.test(label);
    });
    const carRemoves = removeBtns.filter((b) => carsRoot?.contains(b));
    const toggles = [...document.querySelectorAll('[data-ts-brand-toggle]')].map((el) => {
      const box = el.getBoundingClientRect();
      return {
        key: el.dataset.tsBrandToggle,
        label: el.textContent?.replace(/\s+/g, ' ').trim() || '',
        hasLogo: !!el.querySelector('img[src]'),
        height: box.height,
        right: box.right,
      };
    });
    const bar = document.querySelector('[data-ts-car-brands]');
    const barBox = bar?.getBoundingClientRect();
    return {
      toggles,
      visibleRows: visibleRows.length,
      carRemoveCount: carRemoves.length,
      scrollWidth: document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      barRight: barBox?.right ?? 0,
      bodyHasRemoveInCars: carsRoot
        ? /\bRemove\b/.test(carsRoot.innerText || '')
        : /\bRemove\b/.test(document.body?.innerText || ''),
      hertzVisible: visibleRows.some((row) => /^hertz$/i.test(String(row.getAttribute('data-rental-company') || '').trim())),
      thriftyVisible: visibleRows.some((row) => /^thrifty$/i.test(String(row.getAttribute('data-rental-company') || '').trim())),
      dollarVisible: visibleRows.some((row) => /^dollar$/i.test(String(row.getAttribute('data-rental-company') || '').trim())),
    };
  });
}

async function toggleBrand(page, key, wantChecked) {
  await page.evaluate(
    ({ brandKey, checked }) => {
      const input = document.querySelector(`[data-ts-brand-toggle="${brandKey}"] input`);
      if (!input) return;
      if (input.checked !== checked) input.click();
    },
    { brandKey: key, checked: wantChecked },
  );
  await new Promise((r) => setTimeout(r, 400));
}

try {
  for (const width of [390, 430]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`${origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) => /cars/i.test(b.getAttribute('aria-label') || b.textContent || '')),
      { timeout: 180000 },
    );
    await clickCarsTab(page);
    const start = await carsSnap(page);

    assert.equal(start.carRemoveCount, 0, `no per-vehicle Remove in Cars @ ${width}`);
    assert.equal(start.bodyHasRemoveInCars, false, `Cars panel must not show Remove copy @ ${width}`);
    assert.deepEqual(
      start.toggles.map((t) => t.key).sort(),
      expectedCarBrandKeys,
      `one brand toggle per rentalCompany @ ${width}`,
    );
    assert.ok(
      start.toggles.every((t) => !/suv|sedan|compact|midsize|full-size/i.test(t.label)),
      `toggle labels are brand names @ ${width}`,
    );
    assert.ok(
      start.toggles.every((t) => /priceline express deal|hertz|thrifty|dollar/i.test(t.label)),
      `NYC brand labels present @ ${width}: ${start.toggles.map((t) => t.label).join(' | ')}`,
    );
    assert.ok(start.toggles.every((t) => t.hasLogo), `brand logos on toggles @ ${width}`);
    assert.ok(start.toggles.every((t) => t.height >= 44), `44px touch targets @ ${width}: ${JSON.stringify(start.toggles)}`);
    assert.ok(start.scrollWidth <= start.innerWidth + 1, `no horizontal overflow @ ${width}: ${start.scrollWidth}>${start.innerWidth}`);
    assert.ok(start.barRight <= start.innerWidth + 1, `brand bar within viewport @ ${width}`);
    assert.ok(start.hertzVisible, `Hertz rows visible initially @ ${width}`);
    assert.ok(start.thriftyVisible, `Thrifty rows visible initially @ ${width}`);

    const visibleBeforeHertz = start.visibleRows;
    await toggleBrand(page, 'hertz', false);
    const hidHertz = await carsSnap(page);
    assert.equal(hidHertz.hertzVisible, false, `uncheck Hertz hides Hertz rows @ ${width}`);
    assert.ok(hidHertz.thriftyVisible, `Thrifty remains after Hertz hide @ ${width}`);
    assert.ok(hidHertz.visibleRows < visibleBeforeHertz, `Hertz hide reduces visible count @ ${width}`);

    await toggleBrand(page, 'hertz', true);
    const restoredHertz = await carsSnap(page);
    assert.equal(restoredHertz.visibleRows, visibleBeforeHertz, `recheck Hertz restores rows @ ${width}`);
    assert.ok(restoredHertz.hertzVisible, `Hertz visible after restore @ ${width}`);

    await toggleBrand(page, 'thrifty', false);
    const hidThrifty = await carsSnap(page);
    assert.equal(hidThrifty.thriftyVisible, false, `uncheck Thrifty hides Thrifty rows @ ${width}`);
    assert.ok(hidThrifty.hertzVisible, `Hertz remains after Thrifty hide @ ${width}`);
    await toggleBrand(page, 'thrifty', true);
    const restoredThrifty = await carsSnap(page);
    assert.ok(restoredThrifty.thriftyVisible, `Thrifty visible after restore @ ${width}`);

    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

console.log('acceptance #982 car brand checkbox checks passed');
