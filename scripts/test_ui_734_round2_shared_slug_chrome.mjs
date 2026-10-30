#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const widths = [390, 1280];

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

async function startServer({ html, js, css, tripPayload }) {
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
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (publicJs.includes(pathname)) {
      return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname === '/src/onboarding/eula-markdown.mjs') {
      return send(res, 200, await readFile(path.join(root, 'src/onboarding/eula-markdown.mjs'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":false}', 'application/json; charset=utf-8');
    if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.ico')) {
      return send(res, 200, '', 'image/png');
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
        return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
      }
      return send(res, 404, '{}', 'application/json');
    }
    if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true,"notices":[],"bindings":[],"media":[]}', 'application/json; charset=utf-8');
    send(res, 404, 'no', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function expectedHotelRows(payload) {
  let hotels = 0;
  let withSummary = 0;
  for (const place of payload.places || []) {
    const override = payload.thingOverrides?.[`place:${place.id}`] || {};
    if (productThingCategory(place, override) !== 'hotel') continue;
    hotels += 1;
    const summary = String(override.summary || place.description || '').replace(/\s+/g, ' ').trim();
    if (summary.length > 15) withSummary += 1;
  }
  return { hotels, withSummary };
}

const js = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
const css = await readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const html = await readFile(path.join(root, 'shared-app.html'), 'utf8');
const tripPayload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
const { hotels: hotelExpect, withSummary: summaryExpect } = expectedHotelRows(tripPayload);
assert.equal(hotelExpect, 22);
assert.equal(summaryExpect, 22);

const app = await startServer({ html, js, css, tripPayload });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function clickTab(page, label) {
  await page.evaluate((tabLabel) => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim();
      return new RegExp(`^${tabLabel}$`, 'i').test(t);
    });
    if (!btn) throw new Error(`tab not found: ${tabLabel}`);
    btn.click();
  }, label);
}

try {
  for (const width of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${app.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('button[aria-label="Hotels"]', { timeout: 120000 });
    await clickTab(page, 'Hotels');
    await page.waitForSelector('[data-shared-live-tab="hotels"]', { timeout: 120000 });

    const hotelStats = await page.evaluate(() => {
      const root = document.querySelector('[data-shared-live-tab="hotels"]');
      const rows = root ? [...root.querySelectorAll('[data-ts-list-row-name="1"], [data-list-summary="1"]')].length : 0;
      const nameNodes = root ? root.querySelectorAll('[data-ts-list-row-name="1"]').length : 0;
      const summaries = root
        ? [...root.querySelectorAll('[data-list-summary="1"]')].filter((el) => String(el.textContent || '').trim().length > 15)
        : [];
      return { nameNodes, summaryVisible: summaries.length };
    });
    assert.ok(hotelStats.nameNodes >= hotelExpect, `hotels rows at ${width}: ${hotelStats.nameNodes}`);
    const ratio = hotelStats.summaryVisible / hotelExpect;
    assert.ok(ratio >= 0.8, `H1 hotel list descriptions ${hotelStats.summaryVisible}/${hotelExpect} at ${width}`);

    await clickTab(page, 'Day-by-Day');
    await page.waitForSelector('[data-trip-view-root]', { timeout: 120000 });
    await page.evaluate(() => {
      const btn = document.querySelector('[data-trip-view-root] button[aria-label="Config Options"]');
      if (!btn) throw new Error('Config Options button missing');
      btn.click();
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-trip-view-root]');
      return root && /Trip View/i.test(root.textContent || '');
    }, { timeout: 120000 });
    const tripView = await page.evaluate(() => {
      const root = document.querySelector('[data-trip-view-root]');
      const text = root ? root.innerText.replace(/\s+/g, ' ').trim() : '';
      return { text };
    });
    assert.match(tripView.text, /Trip View/i);
    assert.match(tripView.text, /Flights/i, `B7 flights toggle at ${width}`);
    assert.match(tripView.text, /Hotels/i, `B7 hotels toggle at ${width}`);
    assert.match(tripView.text, /Cars/i, `B7 cars toggle at ${width}`);

    await page.evaluate(() => {
      document.body.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    await clickTab(page, 'Restaurants');
    await page.waitForFunction(
      () => /Restaurants|Carbone|Zabar|Italian/i.test(document.body.innerText || ''),
      { timeout: 60000 },
    );
    const travelChips = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /\b\d+\s*min\b/i.test(t) || /how to get there|subway line/i.test(t)),
    );
    assert.equal(travelChips.length, 0, `B9 travel chips at ${width}: ${travelChips.join(' | ')}`);

    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
}

console.log(`ui #734 round2 shared slug ${NYC_DAYBYDAY_SLUG} chrome checks passed`);
