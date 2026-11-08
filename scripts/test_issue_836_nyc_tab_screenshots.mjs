#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const artifactRoot =
  process.env.ISSUE_836_TAB_ARTIFACT_ROOT ||
  path.join(root, 'evidence', 'vacation-client-836-nyc-tabs');

const TABS = [
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
    if (publicJs.includes(pathname)) {
      return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
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
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function clickTab(page, label) {
  await page.evaluate((want) => {
    const btn = [...document.querySelectorAll('button,[role="tab"]')].find(
      (b) => b.getAttribute('aria-label') === want,
    );
    if (!btn) throw new Error(`tab not found: ${want}`);
    btn.click();
  }, label);
  await new Promise((r) => setTimeout(r, 400));
}

const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos(buildNycCraigKimDaybydayTrip()));
const [html, css, js] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
]);
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const app = await startServer({ html, js, css, tripPayload });
await mkdir(artifactRoot, { recursive: true });

try {
  const page = await browser.newPage();
  for (const width of [390, 1280]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 800, deviceScaleFactor: 1 });
    await page.goto(`${app.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => /Day-by-Day/i.test(document.body?.innerText || ''), { timeout: 120000 });

    for (const tab of TABS) {
      await clickTab(page, tab);
      const slug = tab.toLowerCase().replace(/\s+/g, '-');
      await page.screenshot({ path: path.join(artifactRoot, `nyc-${slug}-${width}.png`) });
    }

    await clickTab(page, 'Day-by-Day');
    await page.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });
    const dayCount = await page.evaluate(() => {
      const dayPicker = [...document.querySelectorAll('button')].filter((btn) =>
        /^Day\s+\d+/i.test(String(btn.getAttribute('aria-label') || btn.textContent || '').trim()),
      );
      return dayPicker.length;
    });
    assert.ok(dayCount >= 8, `expected 8 NYC day chips, got ${dayCount}`);
    for (let i = 0; i < 8; i += 1) {
      await page.evaluate((idx) => {
        const dayPicker = [...document.querySelectorAll('button')].filter((btn) =>
          /^Day\s+\d+/i.test(String(btn.getAttribute('aria-label') || btn.textContent || '').trim()),
        );
        const btn = dayPicker[idx];
        if (!btn) throw new Error(`missing day chip ${idx + 1}`);
        btn.click();
      }, i);
      await new Promise((r) => setTimeout(r, 350));
      await page.screenshot({ path: path.join(artifactRoot, `nyc-day-${i + 1}-${width}.png`) });
    }
  }
  await page.close();
} finally {
  await app.close();
  await browser.close();
}

console.log(`issue 836 NYC tab screenshots written to ${artifactRoot}`);
