#!/usr/bin/env node
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const DEMO_SLUG = 'demo-acceptance-994-local';
const FLIGHT_TITLE_RE = /^.+ [A-Z]{3} to [A-Z]{3}$/;
const FIXTURE_ROOT =
  process.env.TSV_ACCEPTANCE_FIXTURE_ROOT ||
  path.resolve(root, '../../tsv-dispatch/acceptance/fixtures/demo-nyc-99-snapshot-20261110');

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

if (process.env.CI && !existsSync(path.join(FIXTURE_ROOT, 'shared-trip.json'))) {
  console.log('test_acceptance_994_flight_titles: SKIP in CI (host-only fixture demo-nyc-99-snapshot-20261110 absent; host accept runs it)');
  process.exit(0);
}
const tripRaw = JSON.parse(await readFile(path.join(FIXTURE_ROOT, 'shared-trip.json'), 'utf8'));
const tripPayload = finalizeServedSharedTripPayload(tripRaw);

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
  if (sharedMatch && req.method === 'GET' && decodeURIComponent(sharedMatch[1]) === DEMO_SLUG) {
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

async function clickFlightsTab(page) {
  const clicked = await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button,[role="tab"]')) {
      const label = (btn.getAttribute('aria-label') || btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^flights$/i.test(label)) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  assert.equal(clicked, true, 'Flights tab button missing');
  await page.waitForFunction(
    () => [...document.querySelectorAll('li[data-list-row="1"]')].some((el) => el.offsetParent !== null),
    { timeout: 120000 },
  );
}

async function flightSnap(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('li[data-list-row="1"]')].filter((el) => {
      if (el.offsetParent === null) return false;
      const date = el.querySelector('[data-ts-list-date-range]');
      return /Depart/i.test(date?.textContent || '');
    });
    const cards = rows.map((row) => {
      const titleEl = row.querySelector('[data-ts-list-row-name] strong') || row.querySelector('strong');
      const title = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim();
      const dateLine = row.querySelector('[data-ts-list-date-range]');
      const dateText = (dateLine?.textContent || '').replace(/\s+/g, ' ').trim();
      const strongBox = titleEl?.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      return { title, dateText, right: strongBox?.right ?? 0, rowRight: rowBox.right };
    });
    return {
      cards,
      scrollWidth: document.scrollingElement?.scrollWidth ?? document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
}

try {
  for (const width of [390, 430]) {
    const height = width === 430 ? 932 : 844;
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`${origin}/shared/${DEMO_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button,[role="tab"]')].some((b) =>
          /^flights$/i.test((b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim()),
        ),
      { timeout: 180000 },
    );
    await clickFlightsTab(page);
    const snap = await flightSnap(page);
    assert.ok(snap.cards.length >= 4, `expected flight rows @ ${width}, got ${snap.cards.length}`);
    for (const card of snap.cards) {
      assert.match(card.title, FLIGHT_TITLE_RE, `title shape @ ${width}: ${card.title}`);
      assert.doesNotMatch(card.title, /\d{4}-\d{2}-\d{2}/, `no ISO date in title @ ${width}: ${card.title}`);
      assert.doesNotMatch(card.title, /\d{1,2}:\d{2}/, `no clock in title @ ${width}: ${card.title}`);
      assert.match(card.dateText, /Day \d+ Depart/i, `depart line @ ${width}: ${card.dateText}`);
      assert.match(card.dateText, /(Arrive|Day \d+)/i, `arrive/day line @ ${width}: ${card.dateText}`);
      assert.ok(card.right <= snap.innerWidth + 1, `title within viewport @ ${width}: ${card.title}`);
    }
    assert.ok(snap.scrollWidth <= snap.innerWidth + 1, `no horizontal overflow @ ${width}`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

await import('./test_flight_card_title.mjs');

console.log('acceptance #994 flight title checks passed');