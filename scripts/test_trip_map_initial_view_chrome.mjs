import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { computeTripMapInitialView } from '../src/vacation/trip-map-initial-view.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const bundlePath = path.join(root, 'public/assets/index-BKun7ofk.js');
const cssPath = path.join(root, 'public/assets/index-CbEHlMj6.css');
const intakeSlug = 'intake-000000000001';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function sendText(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

function tripPayloadWithPlaces(places) {
  return {
    trip: {
      id: 1,
      title: 'Map fixture trip',
      description: 'Area alpha',
      start_date: '2026-10-01',
      end_date: '2026-10-03',
      currency: 'USD',
    },
    days: [{
      id: 101,
      trip_id: 1,
      day_number: 1,
      date: '2026-10-01',
      notes: '',
      title: '',
    }],
    assignments: { '101': places.map((place, index) => ({
      id: 300 + index,
      day_id: 101,
      order_index: index,
      notes: '',
      place,
    })) },
    dayNotes: {},
    places,
    categories: [{ id: 1, name: 'Place', icon: '📍' }],
    permissions: { share_map: true, share_bookings: true, share_packing: false, share_budget: false, share_collab: false },
    budget: [],
    media: [],
    reservations: [],
    accommodations: [],
    packing: [],
    collab: {},
    thingOverrides: {},
    timesyncherIntake: true,
  };
}

async function startServer({ html, js, css, payload }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const { pathname } = url;
    if (pathname === '/assets/index-BKun7ofk.js') return sendText(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return sendText(res, 200, css, 'text/css; charset=utf-8');
    if (pathname.startsWith('/icons/')) return sendText(res, 200, '', 'image/png');
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return sendText(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      const share = decodeURIComponent(sharedMatch[1]);
      if (share === intakeSlug) return sendJson(res, 200, payload);
      return sendJson(res, 404, { error: 'missing' });
    }
    if (pathname.startsWith('/api/')) return sendJson(res, 200, { ok: true });
    sendJson(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

const [html, css, js] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(cssPath, 'utf8'),
  readFile(bundlePath, 'utf8'),
]);

const placeA = {
  id: 201,
  trip_id: 1,
  name: 'Venue alpha',
  description: '',
  lat: 40.01,
  lng: -105.01,
  address: '',
  category_id: 1,
  category_name: 'Place',
  category_icon: '📍',
  category: { id: 1, name: 'Place', icon: '📍' },
  reservation_status: 'considering',
  place_time: '10:00',
  website: '',
  notes: '',
};
const placeB = { ...placeA, id: 202, name: 'Venue beta', lat: 40.05, lng: -105.05 };

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const app = await startServer({ html, js, css, payload: tripPayloadWithPlaces([placeA, placeB]) });
try {
  const page = await browser.newPage();
  await page.goto(`${app.origin}/shared/${intakeSlug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => (document.body?.innerText || '').includes('Map fixture trip'), { timeout: 45000 });
  const planTab = await page.$('button[title="Plan"],button[title*="Plan"]');
  if (planTab) await planTab.click();
  await page.waitForFunction(
    () => document.querySelector('.mapboxgl-map,.leaflet-container') && !document.querySelector('[data-map-center-unresolved]'),
    { timeout: 45000 },
  );
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.leaflet-container,.mapboxgl-map');
      return Boolean(el && el.getAttribute('data-ts-map-center') && window.__tsTripMap);
    },
    { timeout: 45000 },
  );
  const unresolved = await page.$('[data-map-center-unresolved]');
  assert.equal(unresolved, null);
  const mapRoot = await page.$('.mapboxgl-map,.leaflet-container');
  assert.ok(mapRoot, 'expected map on first plan view when Things have coordinates');

  const expected = computeTripMapInitialView({
    places: [placeA, placeB],
    trip: tripPayloadWithPlaces([placeA, placeB]).trip,
  });
  assert.equal(expected.ok, true);

  const hook = await page.evaluate(() => {
    const el = document.querySelector('.leaflet-container,.mapboxgl-map');
    return {
      center: el?.getAttribute('data-ts-map-center') || null,
      zoom: el?.getAttribute('data-ts-map-zoom') || null,
      bounds: el?.getAttribute('data-ts-map-bounds') || null,
      engine: el?.getAttribute('data-ts-map-engine') || null,
      global: window.__tsTripMap || null,
    };
  });
  assert.ok(hook.center, 'expected data-ts-map-center on map container');
  assert.ok(hook.zoom, 'expected data-ts-map-zoom on map container');
  assert.ok(hook.bounds, 'expected data-ts-map-bounds on map container');
  assert.equal(hook.engine, 'leaflet');
  const [liveLat, liveLng] = hook.center.split(',').map(Number);
  assert.ok(Number.isFinite(liveLat) && Number.isFinite(liveLng));
  assert.ok(Math.abs(liveLat - expected.center.lat) < 0.02);
  assert.ok(Math.abs(liveLng - expected.center.lng) < 0.02);
  assert.ok(Number.isFinite(Number(hook.zoom)));
  assert.deepEqual(hook.global?.center, { lat: liveLat, lng: liveLng });
  assert.equal(hook.global?.engine, 'leaflet');
} finally {
  await browser.close();
  await app.close();
}

console.log('trip map initial view chrome tests passed');
