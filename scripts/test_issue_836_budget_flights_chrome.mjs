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
  process.env.ISSUE_836_ARTIFACT_ROOT ||
  path.join(root, 'evidence', 'vacation-client-836-budget-realdata');

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
    if (publicJs.includes(pathname)) {
      return send(res, 200, await readFile(path.join(root, 'public', pathname.slice(1)), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (pathname === '/ts-thing-media/bindings.json') {
      return send(res, 200, await readFile(path.join(root, 'public/ts-thing-media/bindings.json'), 'utf8'), 'application/json; charset=utf-8');
    }
    if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":false}', 'application/json; charset=utf-8');
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
  await new Promise((r) => setTimeout(r, 500));
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

    await clickTab(page, 'Cars');
    await page.waitForFunction(
      () => /Priceline Express Deal/i.test(document.body?.innerText || ''),
      { timeout: 120000 },
    );
    await new Promise((r) => setTimeout(r, 300));

    await clickTab(page, 'Budget');
    await page.waitForSelector('[data-ts-budget-panel="1"]', { timeout: 90000 });
    await new Promise((r) => setTimeout(r, 300));

    const budget = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-ts-budget-row="1"] button')];
      const overflowButtons = rows.filter((btn) => {
        const box = btn.getBoundingClientRect();
        return box.right > window.innerWidth + 1;
      });
      return {
        scrollWidth: document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        overflowButtons: overflowButtons.length,
        carBarOnBudget: !!document.querySelector('[data-ts-car-brands]'),
      };
    });
    assert.equal(budget.carBarOnBudget, false, `car brand bar must not show on Budget @ ${width}`);
    assert.ok(budget.scrollWidth <= budget.innerWidth, `budget overflow @ ${width}`);
    assert.equal(budget.overflowButtons, 0, `budget row controls past viewport @ ${width}`);
    await page.screenshot({ path: path.join(artifactRoot, `budget-${width}.png`) });

    await clickTab(page, 'Flights');
    await page.waitForFunction(
      () => /American Airlines LAS/i.test(document.body?.innerText || ''),
      { timeout: 120000 },
    );

    const leak = await page.evaluate(() => ({
      carBar: !!document.querySelector('[data-ts-car-brands]'),
      bodyRemove: /\bRemove\b/.test(document.body?.innerText || ''),
      scrollWidth: document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      aa601: /American Airlines LAS/i.test(document.body?.innerText || ''),
    }));

    assert.equal(leak.carBar, false, `car brand bar must not show on Flights @ ${width}`);
    assert.equal(leak.bodyRemove, false, `Flights body must not contain Remove chrome @ ${width}`);
    assert.ok(leak.scrollWidth <= leak.innerWidth, `Flights horizontal overflow @ ${width}: ${leak.scrollWidth}>${leak.innerWidth}`);
    assert.ok(leak.aa601, `NYC fixture must render AA 601 flight names @ ${width}`);
    await page.screenshot({ path: path.join(artifactRoot, `flights-after-budget-${width}.png`) });
  }
  await page.close();
} finally {
  await app.close();
  await browser.close();
}

console.log('issue 836 budget/flights chrome checks passed');
