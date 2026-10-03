#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { productThingCategory } from '../src/vacation/keepsake-product-overrides.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const slug = 'intake-c15be2f6d7bf';
const widths = [1280, 390];
const categoryTabs = [
  { label: 'Flights', key: 'flights' },
  { label: 'Hotels', key: 'hotels' },
  { label: 'Cars', key: 'cars' },
  { label: 'Restaurants', key: 'restaurants' },
  { label: 'Stores', key: 'stores' },
  { label: 'The Rest', key: 'events' },
  { label: 'Day-by-Day', key: 'plan' },
  { label: 'Budget', key: 'budget' },
];

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function mnFromBundle(js) {
  const start = js.indexOf('Mn=G=>{const Re=');
  const end = js.indexOf(',Fn=G=>', start);
  assert.ok(start >= 0 && end > start, 'bundle Mn() missing');
  return new Function(`${js.slice(start, end)}; return Mn;`)();
}

function tabKeyForCategory(category) {
  if (category === 'hotel') return 'hotels';
  if (category === 'car') return 'cars';
  if (category === 'restaurant') return 'restaurants';
  if (category === 'store') return 'stores';
  if (category === 'flight') return 'flights';
  if (category === 'event' || category === 'other' || category === 'attraction' || category === 'activity') return 'events';
  return 'events';
}

function apiCounts(payload) {
  const counts = Object.fromEntries(categoryTabs.map((tab) => [tab.key, 0]));
  counts.plan = 0;
  counts.budget = 0;
  for (const place of payload.places || []) {
    const override = payload.thingOverrides?.[`place:${place.id}`] || {};
    const key = tabKeyForCategory(productThingCategory(place, override));
    counts[key] += 1;
  }
  return counts;
}

function legacyExactLodgingLabel(thing) {
  const raw = String(thing.categoryName || '').trim().toLowerCase();
  return raw === 'hotel' || raw === 'lodging' || raw === 'accommodation';
}

function stayThings() {
  const tripId = 'c15be2f6-d7bf-498a-b2e7-aa2b828dfab6';
  const things = [
    {
      id: '66f4916e-fe4e-4333-ba48-632696bcf139',
      category: 'hotel',
      title: 'Hyatt Regency Maui Resort & Spa',
      description: '',
      source: 'brave',
      location: { lat: 20.912971, lng: -156.6921667, address: '200 Nohea Kai Dr, Lahaina, HI 96761' },
      metadata: {
        categoryName: 'Resort',
        providerCategories: ['Resort', 'lodging'],
        customerStatedLodging: true,
        sourceRecord: {
          url: 'https://hyatt.com/',
          source: 'brave',
          categories: ['Resort', 'lodging'],
          icon_category: 'lodging',
        },
        logoUrl: 'https://hyatt.com/favicon.ico',
      },
    },
    {
      id: '5305492c-a1b5-4543-a4d8-d3e3fbe74523',
      category: 'lodging',
      title: "The Westin Maui Resort & Spa, Ka'anapali",
      description: '',
      source: 'brave',
      location: { lat: 20.919752, lng: -156.6950079, address: '2365 Kaanapali Pkwy, Lahaina, HI 96761' },
      metadata: {
        categoryName: 'lodging',
        providerCategories: ['lodging'],
        customerStatedLodging: true,
        sourceRecord: {
          url: 'https://marriott.com/',
          source: 'brave',
          categories: ['lodging'],
          icon_category: 'lodging',
        },
        logoUrl: 'https://marriott.com/favicon.ico',
      },
    },
    {
      id: 'car-sample-rental',
      category: 'car',
      title: 'Sample Rental Co',
      description: '',
      source: 'brave',
      location: { lat: 20.89, lng: -156.43, address: 'OGG' },
      metadata: {
        categoryName: 'car',
        sourceRecord: { url: 'https://example.com/', source: 'brave' },
        logoUrl: 'https://example.com/favicon.ico',
      },
    },
  ].map((row) => thingRecordFromTripRow(row));
  return { tripId, things };
}

function fixedPayload() {
  const { tripId, things } = stayThings();
  const shared = applyCapturedLogos(sharedTripFromIntake({
    trip: {
      id: tripId,
      title: 'TimeSyncher Maui March 2027',
      destination: 'Maui',
      start_date: '2027-03-10',
      end_date: '2027-03-17',
      metadata: { intakeShare: true, publicSlug: slug },
    },
    things,
  }));
  const payload = finalizeServedSharedTripPayload(shared);
  payload.trip.description = 'TimeSyncher Vacation';
  payload.trip.title = 'TimeSyncher Maui March 2027';
  return { payload, things };
}

function legacyHotelHtml(payload, things) {
  const hotelThings = things.filter((thing) => thing.category === 'hotel' || thing.category === 'lodging');
  assert.equal(payload.liveTabLists.hotels.length, hotelThings.length);
  return payload.liveTabLists.hotels.filter((_, index) => legacyExactLodgingLabel(hotelThings[index]));
}

function sendText(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

async function startServer({ html, js, css, tripPayload }) {
  const publicFiles = {
    '/ts-timeline-icon-patch.js': path.join(root, 'public/ts-timeline-icon-patch.js'),
    '/ts-car-brand-filter.js': path.join(root, 'public/ts-car-brand-filter.js'),
    '/ts-thing-media-overlay.js': path.join(root, 'public/ts-thing-media-overlay.js'),
    '/post-purchase-gate.mjs': path.join(root, 'public/post-purchase-gate.mjs'),
    '/ts-thing-media/bindings.json': path.join(root, 'public/ts-thing-media/bindings.json'),
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return sendText(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return sendText(res, 200, css, 'text/css; charset=utf-8');
    if (publicFiles[pathname]) {
      const file = await readFile(publicFiles[pathname]);
      const type = pathname.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8';
      return sendText(res, 200, file, type);
    }
    if (pathname === '/manifest.webmanifest') {
      return sendText(res, 200, JSON.stringify({ name: 'TimeSyncher Vacation', start_url: '/' }), 'application/manifest+json');
    }
    if (pathname.startsWith('/icons/')) return sendText(res, 200, '', 'image/png');
    if (pathname.endsWith('/edit-access')) return sendJson(res, 200, { canEdit: false });
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/shared/')) {
      return sendJson(res, 200, { ok: true, notices: [], bindings: [], media: [] });
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return sendText(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      if (decodeURIComponent(sharedMatch[1]) === slug) return sendJson(res, 200, tripPayload);
      return sendJson(res, 404, { error: 'missing', code: 'shared_trip_slug_not_found' });
    }
    sendJson(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickTab(page, label) {
  const clicked = await page.evaluate((want) => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.getAttribute('aria-label') === want) {
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
  if (!clicked) throw new Error(`tab button missing: ${label}`);
}

async function countRows(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('li[data-list-row="1"]')].filter((row) => {
      const box = row.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && row.offsetParent !== null;
    });
    return {
      count: rows.length,
      texts: rows.map((row) => (row.innerText || '').replace(/\s+/g, ' ').trim()),
    };
  });
}

async function measure(page, origin, width) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => (document.body?.innerText || '').includes('TimeSyncher Maui'),
    { timeout: 90000 },
  );
  await sleep(1500);
  const tabs = {};
  for (const tab of categoryTabs) {
    await clickTab(page, tab.label);
    await sleep(400);
    tabs[tab.key] = await countRows(page);
  }
  return { width, tabs };
}

async function measureBundle(browser, files) {
  const app = await startServer(files);
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => {
      console.error('shared tab row pageerror:', error?.message || error);
    });
    const results = [];
    for (const width of widths) results.push(await measure(page, app.origin, width));
    await page.close();
    return results;
  } finally {
    await app.close();
  }
}

const oldCategoryFor = execFileSync('git', ['show', '9986132:src/vacation/intake-shared-trip.mjs'], {
  encoding: 'utf8',
});
assert.match(oldCategoryFor, /key === 'hotel' \|\| key === 'lodging' \|\| key === 'accommodation'/);
assert.doesNotMatch(oldCategoryFor, /normalizeThingType/);

const { payload: fixed, things } = fixedPayload();
const counts = apiCounts(fixed);
assert.equal(counts.hotels, 2);
assert.equal(counts.cars, 1);
assert.equal(fixed.liveTabLists.hotels.length, 2);
assert.equal(fixed.liveTabLists.cars.length, 1);
assert.match(fixed.liveTabLists.hotels.join('\n'), /Hyatt Regency Maui Resort/);
assert.match(fixed.liveTabLists.cars.join('\n'), /Sample Rental Co/);

const beforePayload = structuredClone(fixed);
beforePayload.liveTabLists = {
  ...fixed.liveTabLists,
  hotels: legacyHotelHtml(fixed, things),
};
assert.equal(beforePayload.liveTabLists.hotels.length, 1, '9986132 exact lodging label keeps only the Westin row');
assert.doesNotMatch(beforePayload.liveTabLists.hotels.join('\n'), /Hyatt/);

const [html, css, bundleAfter] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
]);
const bundleBefore = execFileSync('git', ['show', '9986132:public/assets/index-BKun7ofk.js'], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');

const mnBefore = mnFromBundle(bundleBefore);
const mnAfter = mnFromBundle(bundleAfter);
assert.equal(mnBefore('lodging'), 'lodging');
assert.equal(mnBefore('Resort'), 'resort');
assert.equal(mnBefore('Hotel'), 'hotel');
assert.equal(mnAfter('lodging'), 'hotel');
assert.equal(mnAfter('Resort'), 'hotel');
assert.equal(mnAfter('accommodation'), 'hotel');
assert.equal(mnAfter('car'), 'car');

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const beforeResults = await measureBundle(browser, { html, css, js: bundleBefore, tripPayload: beforePayload });
const afterResults = await measureBundle(browser, { html, css, js: bundleAfter, tripPayload: fixed });
await browser.close();

function rowMap(results) {
  return Object.fromEntries(results.map((entry) => [
    String(entry.width),
    Object.fromEntries(categoryTabs.map((tab) => [tab.key, entry.tabs[tab.key].count])),
  ]));
}

const beforeCounts = rowMap(beforeResults);
const afterCounts = rowMap(afterResults);
console.log(JSON.stringify({ api: counts, before: beforeCounts, after: afterCounts, beforeTexts: beforeResults, afterTexts: afterResults }, null, 2));

for (const width of widths) {
  const beforeHotels = beforeCounts[String(width)].hotels;
  assert.equal(beforeHotels, 1, `9986132 hotels DOM at ${width} must be 1 of ${counts.hotels}`);
  assert.notEqual(beforeHotels, counts.hotels);
  for (const tab of categoryTabs) {
    assert.equal(
      afterCounts[String(width)][tab.key],
      counts[tab.key],
      `${tab.label} DOM rows at ${width} must equal API places (${counts[tab.key]})`,
    );
  }
}

console.log('shared trip tab API and DOM row counts passed');
