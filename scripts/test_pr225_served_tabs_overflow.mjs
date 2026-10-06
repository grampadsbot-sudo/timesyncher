#!/usr/bin/env node
/** PR #225: NYC served page — no horizontal overflow on every tab @ 390; mobile icon-only inactive tabs. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { buildNycPr225SharedTrip, NYC_PR225_SLUG } from './fixtures/nyc-pr225-shared-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const tabs = [
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
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
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
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET' && decodeURIComponent(sharedMatch[1]) === NYC_PR225_SLUG) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json; charset=utf-8');
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

const tripPayload = finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip()));
const [html, css, js] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
]);
const app = await startServer({ html, js, css, tripPayload });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const failures = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(`${app.origin}/shared/${NYC_PR225_SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => /Day-by-Day/i.test(document.body?.innerText || ''), { timeout: 90000 });
  for (const label of tabs) {
    const clicked = await page.evaluate((want) => {
      for (const btn of document.querySelectorAll('button,[role="tab"]')) {
        if (btn.getAttribute('aria-label') === want) {
          btn.click();
          return true;
        }
      }
      return false;
    }, label);
    assert.equal(clicked, true, `missing tab ${label}`);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.scrollingElement.scrollLeft = 0;
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    });
    await new Promise((r) => setTimeout(r, 400));
    const measure = await page.evaluate(() => {
      const scrollEl = document.scrollingElement;
      return {
        scrollWidth: scrollEl?.scrollWidth ?? document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    if (measure.scrollWidth > measure.innerWidth) failures.push({ label, ...measure });
  }
  const mobileTabs = await page.evaluate(() => {
    const flights = [...document.querySelectorAll('button[aria-label="Flights"]')][0];
    const hotels = [...document.querySelectorAll('button[aria-label="Hotels"]')][0];
    const label = (btn) => btn && [...btn.children].find((el) => el.tagName === 'SPAN' && el.textContent?.trim() === btn.getAttribute('aria-label'));
    return {
      flightsLabelDisplay: label(flights) ? getComputedStyle(label(flights)).display : null,
      hotelsLabelDisplay: label(hotels) ? getComputedStyle(label(hotels)).display : null,
    };
  });
  assert.equal(mobileTabs.flightsLabelDisplay, 'none', 'inactive Flights tab must hide label at 390');
  assert.equal(mobileTabs.hotelsLabelDisplay, 'none', 'inactive Hotels tab must hide label at 390');
  await page.close();
} finally {
  await app.close();
  await browser.close();
}
assert.deepEqual(failures, []);
console.log('PR225 NYC served tabs: scrollWidth <= 390 on every tab; mobile icon-only inactive labels');
