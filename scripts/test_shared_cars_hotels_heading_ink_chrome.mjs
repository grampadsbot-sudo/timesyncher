import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { collectCategoryTabInkMetrics } from './lib/shared-trip-category-tab-icon-metrics.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const intakeSlug = 'intake-f687d29fec02';
const maxOffset = 1;
const focusTabs = ['Cars', 'Hotels'];
const shotDir = path.join(root, 'docs/category-tab-pill-ink');

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function sharedFromFixture(fixture) {
  const categories = {
    hotel: { id: 1, name: 'Hotel', icon: '🏨' },
    restaurant: { id: 2, name: 'Restaurant', icon: '🍽️' },
    store: { id: 11, name: 'Store', icon: '🛍️' },
    activity: { id: 3, name: 'Attraction', icon: '🏛️' },
  };
  const days = [1, 2, 3].map((day) => ({
    id: 100 + day, trip_id: 1, day_number: day, date: `2026-10-0${day}`, notes: '', title: '',
  }));
  const places = [];
  const assignments = Object.fromEntries(days.map((day) => [String(day.id), []]));
  const thingOverrides = {};
  (fixture.candidates || []).forEach((candidate, index) => {
    const kind = categories[candidate.category] || categories.activity;
    const id = 200 + index;
    const day = days[index % days.length];
    const place = {
      id, trip_id: 1, name: candidate.title, description: '', lat: null, lng: null, address: '',
      category_id: kind.id, category_name: kind.name, category_icon: kind.icon, category: kind,
      reservation_status: 'considering', place_time: '10:00', website: '', notes: '', source: 'fixture',
    };
    places.push(place);
    assignments[String(day.id)].push({ id: 300 + index, day_id: day.id, order_index: 0, notes: '', place });
    thingOverrides[`place:${id}`] = { timeline: true, category: 'other' };
  });
  return {
    trip: { id: 1, title: 'Fixture research trip', description: 'TimeSyncher Vacation', start_date: '2026-10-01', end_date: '2026-10-03', currency: 'USD' },
    days, assignments, dayNotes: {}, places, categories: Object.values(categories),
    permissions: { share_map: true, share_bookings: true, share_packing: false, share_budget: false, share_collab: false },
    media: [], reservations: [], accommodations: [], packing: [], budget: [], collab: [], thingOverrides,
    liveTabLists: { hotels: [], cars: [] },
  };
}

function send(res, status, body, type) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function startServer({ html, js, css, tripPayload }) {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return send(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return send(res, 200, css, 'text/css; charset=utf-8');
    if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/json');
    if (pathname.startsWith('/icons/')) return send(res, 200, '', 'image/png');
    if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":false}', 'application/json');
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/shared/')) return send(res, 200, '{"ok":true}', 'application/json');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, html, 'text/html; charset=utf-8');
    if (/^\/api\/shared\/[^/]+\/?$/.test(pathname)) return send(res, 200, JSON.stringify(tripPayload), 'application/json');
    send(res, 404, '{}', 'application/json');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function pillOffsets(page, origin, width, { waitForCanvas }) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
  await page.goto(`${origin}/shared/${intakeSlug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => (document.body?.innerText || '').includes('Fixture research trip'), { timeout: 90000 });
  const rows = {};
  for (const label of focusTabs) {
    await page.evaluate((want) => {
      for (const btn of document.querySelectorAll('button')) {
        if (btn.getAttribute('aria-label') === want) btn.click();
      }
    }, label);
    if (waitForCanvas) {
      await page.waitForFunction((want) => {
        const btn = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label') === want);
        return Boolean(btn?.querySelector('canvas'));
      }, { timeout: 10000 }, label);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const metrics = await collectCategoryTabInkMetrics(page);
    const row = metrics.find((entry) => entry.tab === label);
    if (!row || row.iconVsLabelPx == null) throw new Error(`missing ink metric for ${label} at ${width}`);
    rows[label] = row.iconVsLabelPx;
    const handle = await page.$(`button[aria-label="${label}"]`);
    const png = await handle.screenshot({ type: 'png' });
    await handle.dispose();
    await writeFile(path.join(shotDir, `${waitForCanvas ? 'after' : 'before'}-${label.toLowerCase()}-${width}.png`), png);
  }
  return { width, rows };
}

async function measureBundle(browser, { html, css, js, tripPayload, waitForCanvas }) {
  const app = await startServer({ html, js, css, tripPayload });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith(app.origin) || url.startsWith('data:') || url.startsWith('blob:')) request.continue();
      else request.abort('blockedbyclient');
    });
    const results = [];
    for (const width of [390, 1280]) results.push(await pillOffsets(page, app.origin, width, { waitForCanvas }));
    await page.close();
    return results;
  } finally {
    await app.close();
  }
}

const fixture = JSON.parse(await readFile(path.join(root, 'scripts/public-research-fixture.json'), 'utf8'));
const tripPayload = sharedFromFixture(fixture);
const [html, css, bundleAfter] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
]);
const bundleBefore = execFileSync('git', ['show', '0b61d1d:public/assets/index-BKun7ofk.js'], { maxBuffer: 25 * 1024 * 1024 }).toString('utf8');
await mkdir(shotDir, { recursive: true });

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const before = await measureBundle(browser, { html, css, js: bundleBefore, tripPayload, waitForCanvas: false });
const after = await measureBundle(browser, { html, css, js: bundleAfter, tripPayload, waitForCanvas: true });
await browser.close();
console.log(JSON.stringify({ before, after }, null, 2));

for (const entry of before) {
  for (const label of focusTabs) {
    assert.ok(Math.abs(entry.rows[label]) > maxOffset, `${label} at ${entry.width} on 0b61d1d must miss the 1px ink center, got ${entry.rows[label]}`);
  }
}
for (const entry of after) {
  for (const label of focusTabs) {
    assert.ok(Math.abs(entry.rows[label]) <= maxOffset, `${label} at ${entry.width} on head must be within 1px, got ${entry.rows[label]}`);
  }
}
console.log('Cars and Hotels heading ink center chrome tests passed');
