#!/usr/bin/env node
/** PR #225: NYC fixture Cars tab — no horizontal overflow; Timeline checkbox visible at 390/1280. */
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

async function startServer({ html, js, css, tripPayload, logo }) {
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
const logo = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const app = await startServer({ html, js, css, tripPayload, logo });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const failures = [];
try {
  const page = await browser.newPage();
  for (const width of widths) {
    await page.setViewport({ width, height: width === 390 ? 844 : 800, deviceScaleFactor: 1 });
    await page.goto(`${app.origin}/shared/${NYC_PR225_SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => /Day-by-Day/i.test(document.body?.innerText || ''), { timeout: 90000 });
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll('button,[role="tab"]')) {
        if (btn.getAttribute('aria-label') === 'Cars') btn.click();
      }
    });
    await page.waitForFunction(() => /Priceline opaque/i.test(document.body?.innerText || ''), { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('input[type="checkbox"]'), { timeout: 30000 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    });
    await new Promise((r) => setTimeout(r, 500));
    const measure = await page.evaluate(() => {
      const scrollEl = document.scrollingElement;
      return {
        scrollWidth: scrollEl?.scrollWidth ?? document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    if (measure.scrollWidth > measure.innerWidth) failures.push({ width, ...measure });
    const box = await page.evaluate(() => {
      const input = [...document.querySelectorAll('input[type="checkbox"]')].find((el) => /timeline/i.test(el.parentElement?.textContent || ''));
      if (!input) return null;
      const r = input.getBoundingClientRect();
      return { left: r.left, right: r.right, innerWidth: window.innerWidth };
    });
    assert.ok(box, `PR225 Cars timeline checkbox missing at ${width}px`);
    assert.ok(box.left >= -1 && box.right <= box.innerWidth + 1, `PR225 Cars timeline checkbox clipped at ${width}px`);
  }
  await page.close();
} finally {
  await app.close();
  await browser.close();
}
assert.deepEqual(failures, []);
console.log('PR225 NYC Cars tab has no horizontal overflow at 390 and 1280');
