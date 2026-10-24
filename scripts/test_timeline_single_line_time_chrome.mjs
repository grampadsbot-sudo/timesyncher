#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './fixtures/nyc-craig-kim-daybyday-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const maxDelta = Number(process.env.TIMELINE_SINGLE_LINE_MAX_DELTA || '0.5');

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function startServer({ html, js, css, tripPayload }) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/json');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && decodeURIComponent(sharedMatch[1]) === NYC_DAYBYDAY_SLUG) {
      return send(res, 200, JSON.stringify(tripPayload), 'application/json');
    }
    if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.ico')) return send(res, 200, '');
    if (pathname.startsWith('/api/')) return send(res, 200, '{}', 'application/json');
    send(res, 404, 'not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function collectSingleLineBaselineRows() {
  const isTimelineRow = (row) => /minmax\(52px,\s*64px\)\s+22px/.test(row.style?.gridTemplateColumns || '');
  const rows = [];
  for (const row of document.querySelectorAll('div')) {
    if (!isTimelineRow(row)) continue;
    const timeRoot = row.querySelector('[data-ts-timeline-time="1"]');
    const title = row.querySelector('[data-ts-timeline-title="1"]');
    if (!timeRoot || !title) continue;
    if (timeRoot.querySelector('br')) continue;
    const timeText = (timeRoot.textContent || '').replace(/\s+/g, ' ').trim();
    if (!timeText) continue;
    const titleRange = document.createRange();
    titleRange.selectNodeContents(title);
    const titleLine = titleRange.getClientRects()[0];
    titleRange.detach();
    const timeRange = document.createRange();
    timeRange.selectNodeContents(timeRoot);
    const timeLine = timeRange.getClientRects()[0];
    timeRange.detach();
    if (!titleLine || !timeLine) continue;
    const titleBaseline = titleLine.bottom - 1;
    const timeBaseline = timeLine.bottom - 1;
    rows.push({
      title: (title.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
      timeText,
      deltaPx: timeBaseline - titleBaseline,
    });
  }
  return rows;
}

const tripPayload = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
const [html, css, js] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
]);

assert.match(js, /data-ts-timeline-time":"1"/, 'served trek bundle must mark single-line time cells');

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const app = await startServer({ html, js, css, tripPayload });

try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(app.origin) || url.startsWith('data:') || url.startsWith('blob:')) request.continue();
    else request.abort('blockedbyclient');
  });

  for (const width of [390, 1280]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 800, deviceScaleFactor: 1 });
    await page.goto(`${app.origin}/shared/${NYC_DAYBYDAY_SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => document.querySelector('[data-ts-timeline-time="1"]'), { timeout: 120000 });
    const rows = await page.evaluate(collectSingleLineBaselineRows);
    assert.ok(rows.length >= 3, `expected single-line NYC timeline rows at ${width}px, got ${rows.length}`);
    for (const row of rows) {
      assert.ok(
        Math.abs(row.deltaPx) <= maxDelta,
        `${width}px ${row.title} (${row.timeText}) baseline delta ${row.deltaPx}px exceeds ${maxDelta}`,
      );
    }
  }
} finally {
  await browser.close();
  await app.close();
}

console.log('timeline single-line time chrome tests passed');
