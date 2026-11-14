import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import {
  servedSharedTripUncompressedBytes,
  stripFillInternalsFromServedSharedTrip,
} from '../src/vacation/shared-trip-fill-internal-strip.mjs';
import {
  GET_SHARED_TRIP_NEEDLE,
  GET_SHARED_TRIP_PATCH,
} from '../src/vacation/trek-shared-trip-boot-fetch-patch.mjs';
import { GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const intakeSlug = 'intake-issue989load';
const fatBody = 'x'.repeat(120_000);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function buildFatTripPayload() {
  const place = {
    id: 901,
    trip_id: 1,
    name: 'Fixture Bistro',
    description: 'Day one tasting menu.',
    summary: 'Known for pastries.',
    lat: 40.758,
    lng: -73.9855,
    category_id: 2,
    category_name: 'Restaurant',
    category_icon: '🍽️',
    category: { id: 2, name: 'Restaurant', icon: '🍽️' },
    reservation_status: 'considering',
    sourceRecord: { summary: 'Known for pastries.', evidenceDossier: { pages: [{ text: fatBody }] } },
  };
  return {
    trip: {
      id: 1,
      title: 'Issue 989 load trip',
      description: 'TimeSyncher Vacation',
      start_date: '2026-10-01',
      end_date: '2026-10-03',
      currency: 'USD',
    },
    days: [{ id: 11, trip_id: 1, day_number: 1, date: '2026-10-01', notes: '', title: '' }],
    assignments: {
      11: [{
        id: 21,
        day_id: 11,
        order_index: 0,
        notes: '',
        place,
      }],
    },
    dayNotes: {},
    places: [place],
    categories: [{ id: 2, name: 'Restaurant', icon: '🍽️' }],
    permissions: {
      share_map: true,
      share_bookings: true,
      share_packing: false,
      share_budget: false,
      share_collab: false,
    },
    thingOverrides: {
      'place:901': {
        timeline: true,
        category: 'restaurant',
        summary: 'Known for pastries.',
        itineraryNote: 'Try the croissant.',
        evidenceDossier: {
          pages: [{ text: fatBody }],
          braveResults: [{ text: fatBody }],
          attempts: [{ step: 'gather', status: 'ok' }],
          reviewExcerpts: [{ text: fatBody }],
          reviewSet: [{ text: fatBody }],
        },
      },
    },
    budget: [],
    media: [],
    reservations: [],
    accommodations: [],
    packing: [],
    collab: [],
  };
}

const slice = String(process.env.ISSUE_989_SLICE || 'all').toLowerCase();
const runDossier = slice === 'all' || slice === 'dossier';
const runFetch = slice === 'all' || slice === 'fetch';
const runLatency = slice === 'all' || slice === 'latency';

const fatTrip = runDossier || runLatency ? buildFatTripPayload() : null;
const fatBytes = fatTrip ? servedSharedTripUncompressedBytes(fatTrip) : 0;
if (runDossier || runLatency) assert.ok(fatBytes > 500_000, `fixture dossier must be fat (${fatBytes})`);

const slimTrip = fatTrip ? finalizeServedSharedTripPayload(fatTrip) : null;
if (runDossier) {
  assert.equal(slimTrip.thingOverrides['place:901'].summary, 'Known for pastries.');
  assert.equal(slimTrip.thingOverrides['place:901'].itineraryNote, 'Try the croissant.');
  assert.equal(slimTrip.thingOverrides['place:901'].evidenceDossier, undefined);
  assert.equal(slimTrip.places[0].sourceRecord?.evidenceDossier, undefined);
  const slimBytes = servedSharedTripUncompressedBytes(slimTrip);
  assert.ok(slimBytes < fatBytes / 5, `served body must slim (${slimBytes} vs ${fatBytes})`);
  assert.ok(slimBytes < 250_000, `served body must stay under 250KB (${slimBytes})`);

  const strippedOnly = stripFillInternalsFromServedSharedTrip(fatTrip);
  assert.equal(strippedOnly.thingOverrides['place:901'].evidenceDossier, undefined);
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    end(payload) {
      this.body = String(payload || '');
    },
  };
}

if (runDossier) {
  const oldUpstream = process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
  delete process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
  try {
    const res = mockRes();
    await sharedTripHandler(
      { method: 'GET', url: `/api/shared/${GATE_B_APPROVED_SHARED_SLUG}/`, headers: {} },
      res,
    );
    assert.equal(res.statusCode, 200);
    const served = JSON.parse(res.body);
    const keys = Object.keys(served.thingOverrides || {});
    for (const key of keys) {
      assert.equal(served.thingOverrides[key]?.evidenceDossier, undefined, key);
    }
  } finally {
    if (oldUpstream) process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL = oldUpstream;
    else delete process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL;
  }
}

let committedBundle = '';
if (runFetch || runLatency) {
  if (slice === 'fetch') await import('./test_shared_trip_boot_fetch.mjs');
  committedBundle = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
  assert.doesNotMatch(committedBundle, new RegExp(GET_SHARED_TRIP_NEEDLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(committedBundle, /getSharedTrip:e=>\{const tok=String\(e\|\|""\)\.trim\(\)/);
  assert.match(committedBundle, /window\.__TS_SHARED_BOOT_TRIP__/);
  assert.ok(committedBundle.includes('`/shared/${e}/`'), 'getSharedTrip must use trailing-slash API path');

  const sharedApp = await readFile(path.join(root, 'shared-app.html'), 'utf8');
  assert.match(sharedApp, /appendSharedTrekBundle\(\);\s*const response = await fetch/);
}

function sendText(res, status, body, type, cacheControl = 'no-store') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': cacheControl,
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJson(res, status, body, cacheControl = 'public, max-age=60') {
  const payload = JSON.stringify(body);
  sendText(res, status, payload, 'application/json; charset=utf-8', cacheControl);
}

async function startServer({ html, js, css, tripPayload }) {
  let sharedGets = 0;
  const publicFiles = {
    '/ts-timeline-icon-patch.js': path.join(root, 'public/ts-timeline-icon-patch.js'),
    '/ts-vk-rebrand-chrome.js': path.join(root, 'public/ts-vk-rebrand-chrome.js'),
    '/ts-car-brand-filter.js': path.join(root, 'public/ts-car-brand-filter.js'),
    '/ts-thing-media-overlay.js': path.join(root, 'public/ts-thing-media-overlay.js'),
    '/ts-shared-audio-recorder.js': path.join(root, 'public/ts-shared-audio-recorder.js'),
    '/ts-shared-audio-recorder.css': path.join(root, 'public/ts-shared-audio-recorder.css'),
    '/ts-pic-popup-viewer.js': path.join(root, 'public/ts-pic-popup-viewer.js'),
    '/ts-trip-hero-collapse.js': path.join(root, 'public/ts-trip-hero-collapse.js'),
    '/post-purchase-gate.mjs': path.join(root, 'public/post-purchase-gate.mjs'),
    '/ts-thing-media/bindings.json': path.join(root, 'public/ts-thing-media/bindings.json'),
    '/brand/vk-wordmark.css': path.join(root, 'public/brand/vk-wordmark.css'),
    '/brand/vk-book-logo.svg': path.join(root, 'public/brand/vk-book-logo.svg'),
    '/favicon.ico': path.join(root, 'public/favicon.ico'),
    '/ts-build-stamp-customer-hide.css': path.join(root, 'public/ts-build-stamp-customer-hide.css'),
    '/ts-build-stamp-customer-hide.js': path.join(root, 'public/ts-build-stamp-customer-hide.js'),
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/assets/index-BKun7ofk.js') return sendText(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return sendText(res, 200, css, 'text/css; charset=utf-8');
    if (publicFiles[pathname]) {
      const file = await readFile(publicFiles[pathname]);
      const type = pathname.endsWith('.json')
        ? 'application/json; charset=utf-8'
        : pathname.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : pathname.endsWith('.svg')
            ? 'image/svg+xml'
            : pathname.endsWith('.ico')
              ? 'image/x-icon'
              : pathname.endsWith('.mjs')
                ? 'text/javascript; charset=utf-8'
                : 'text/javascript; charset=utf-8';
      return sendText(res, 200, file, type);
    }
    if (pathname === '/manifest.webmanifest') {
      return sendText(res, 200, JSON.stringify({ name: 'Vacay Keepsake', start_url: '/' }), 'application/manifest+json');
    }
    if (pathname.startsWith('/icons/')) return sendText(res, 200, '', 'image/png');
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/shared/')) {
      return sendJson(res, 200, { ok: true, notices: [], bindings: [], media: [] });
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return sendText(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      const share = decodeURIComponent(sharedMatch[1]);
      if (share === intakeSlug) {
        sharedGets += 1;
        return sendJson(res, 200, tripPayload);
      }
      return sendJson(res, 404, { code: 'shared_trip_slug_not_found' });
    }
    if (pathname.endsWith('/edit-access')) return sendJson(res, 200, { canEdit: false });
    sendJson(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    sharedGets: () => sharedGets,
    resetSharedGets: () => { sharedGets = 0; },
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

if (!runLatency) {
  if (slice === 'dossier') console.log('acceptance 989 shared payload omits dossier passed');
  if (slice === 'fetch') console.log('acceptance 989 payload fetch once passed');
  if (slice === 'all') console.log('issue 989 shared trip load tests passed');
} else {
const [html, css] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(new URL('../public/assets/index-CbEHlMj6.css', import.meta.url), 'utf8'),
]);

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function itineraryVisibleMs(page, origin) {
  const started = Date.now();
  await page.goto(`${origin}/shared/${intakeSlug}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(
    () => {
      const header = document.querySelector('[data-shared-trip-header],[data-ts-shared-header]');
      const dayBtn = [...document.querySelectorAll('button')].find((b) => /\bDay 1\b/i.test(String(b.textContent || '').replace(/\s+/g, ' ').trim()));
      return Boolean(header && dayBtn);
    },
    { timeout: 120000 },
  );
  return Date.now() - started;
}

try {
  const app = await startServer({
    html,
    js: committedBundle,
    css,
    tripPayload: slimTrip,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

  const coldSamples = [];
  for (let run = 0; run < 3; run += 1) {
    app.resetSharedGets();
    const client = await page.createCDPSession();
    await client.send('Network.clearBrowserCache');
    await client.send('Network.clearBrowserCookies');
    const ms = await itineraryVisibleMs(page, app.origin);
    coldSamples.push(ms);
    const sharedGets = app.sharedGets();
    assert.ok(
      sharedGets >= 1 && sharedGets <= 2,
      `cold run ${run + 1} shared GET count ${sharedGets} (boot cache:no-store may race bundle getSharedTrip)`,
    );
  }
  coldSamples.sort((a, b) => a - b);
  const coldMedian = coldSamples[1];
  assert.ok(coldMedian <= 3000, `cold median itinerary visible ${coldMedian}ms > 3000ms`);

  const warmSamples = [];
  for (let run = 0; run < 2; run += 1) {
    app.resetSharedGets();
    const ms = await itineraryVisibleMs(page, app.origin);
    warmSamples.push(ms);
    const warmGets = app.sharedGets();
    assert.ok(
      warmGets <= 1,
      `warm run ${run + 1} shared GET count ${warmGets} (boot cache:no-store refetch is allowed)`,
    );
  }
  warmSamples.sort((a, b) => a - b);
  const warmMedian = warmSamples[Math.floor(warmSamples.length / 2)];
  assert.ok(warmMedian <= 1500, `warm median itinerary visible ${warmMedian}ms > 1500ms`);

  console.log(JSON.stringify({
    issue: 989,
    coldMs: coldSamples,
    coldMedian,
    warmMs: warmSamples,
    warmMedian,
    tBeforeColdMedianMs: 8650,
    tBeforeWarmMedianMs: 5300,
  }));

  await app.close();
} finally {
  await browser.close();
}

console.log(slice === 'latency' ? 'acceptance 989 itinerary load latency passed' : 'issue 989 shared trip load tests passed');
}
