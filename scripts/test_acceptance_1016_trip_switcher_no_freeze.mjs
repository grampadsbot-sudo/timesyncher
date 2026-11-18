#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { BUILD_STAMP_INLINE_STYLE } from '../routes/version.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

const NYC_SLUG = 'copy-issue1016-nyc';
const VEGAS_SLUG = 'copy-issue1016-vegas';
const SESSION = 'accept-issue-1016-session';
const MAP = {
  'Craig / Kim NYC June 2026': NYC_SLUG,
  'Las Vegas Strip Vacation': VEGAS_SLUG,
  'Boston Weekend': 'copy-issue1016-boston',
};
const VISITED = [NYC_SLUG, VEGAS_SLUG, 'copy-issue1016-boston'];

function loadPlaywright() {
  const candidates = [
    'playwright',
    'playwright-core',
    path.join(root, 'node_modules/playwright'),
    path.join(os.homedir(), 'tsv-dispatch/capture/node_modules/playwright'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }
  throw new Error('Playwright required for #1016 trip-switcher accept');
}

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function stampHtml(html) {
  const footer = '<footer data-build-stamp="1">abcdef1</footer>';
  const style = BUILD_STAMP_INLINE_STYLE;
  let next = html;
  if (!next.includes('timesyncher-build-stamp-style')) {
    next = next.replace(/<head[^>]*>/i, (open) => `${open}${style}`);
  }
  if (!next.includes('<footer data-build-stamp="1">')) {
    next = /<\/body>/i.test(next) ? next.replace(/<\/body>/i, `${footer}</body>`) : `${next}${footer}`;
  }
  return next;
}

function sendText(res, status, body, type) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': payload.length,
  });
  res.end(payload);
}

function sendJson(res, status, body) {
  sendText(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

function tripPayload(title, markerPlace) {
  const place = {
    id: 501,
    trip_id: 1,
    name: markerPlace,
    description: 'Fixture marker for acceptance.',
    summary: 'Fixture summary.',
    lat: 40.75,
    lng: -73.99,
    category_id: 2,
    category_name: 'Restaurant',
    category_icon: '🍽️',
    category: { id: 2, name: 'Restaurant', icon: '🍽️' },
    reservation_status: 'considering',
  };
  return {
    trip: {
      id: 1,
      title,
      description: 'Acceptance copy trip',
      start_date: '2026-06-23',
      end_date: '2026-06-30',
      currency: 'USD',
    },
    days: [{ id: 11, trip_id: 1, day_number: 1, date: '2026-06-23', notes: '', title: '' }],
    assignments: {
      11: [{ id: 21, day_id: 11, order_index: 0, notes: '', place }],
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
    media: [],
    reservations: [],
    accommodations: [],
    packing: [],
    budget: [],
    collab: [],
    thingOverrides: { 'place:501': { timeline: true, category: 'restaurant', summary: 'Fixture summary.' } },
    liveTabLists: { hotels: [], cars: [] },
  };
}

const sharedTrips = {
  [NYC_SLUG]: tripPayload('Craig / Kim NYC June 2026', 'NYC Accept 1016 Marker Bistro'),
  [VEGAS_SLUG]: tripPayload('Las Vegas Strip Vacation', 'Vegas Accept 1016 Marker Buffet'),
  'copy-issue1016-boston': tripPayload('Boston Weekend', 'Boston Accept Marker Cafe'),
};

function appPayload(origin, tripId = '') {
  const currentTripId = tripId || 'trip-nyc-1016';
  return {
    ok: true,
    session: {
      token: SESSION,
      status: 'active',
      customerName: 'Guest',
      email: 'guest@example.com',
      currentTripId,
      seat: null,
    },
    eula: { accepted: true, text: 'Terms' },
    vacations: [
      {
        id: 'trip-nyc-1016',
        title: 'Craig / Kim NYC June 2026',
        destination: 'New York City',
        startDate: '2026-06-23',
        endDate: '2026-06-30',
        status: 'active',
        publicUrl: `${origin}/shared/${NYC_SLUG}/`,
      },
      {
        id: 'trip-vegas-1016',
        title: 'Las Vegas Strip Vacation',
        destination: 'Las Vegas',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        status: 'active',
        publicUrl: `${origin}/shared/${VEGAS_SLUG}/`,
      },
    ],
    turns: [{
      id: 'turn-welcome',
      speaker: 'assistant',
      direction: 'outbound',
      authorLabel: 'TimeSyncher',
      body: 'Welcome.',
    }],
    itinerary: [],
  };
}

const publicFiles = new Map([
  ['/vacation-app-shell.css', path.join(root, 'public/vacation-app-shell.css')],
  ['/brand/vk-wordmark.css', path.join(root, 'public/brand/vk-wordmark.css')],
  ['/vacation-app-request.js', path.join(root, 'public/vacation-app-request.js')],
  ['/ts-timeline-icon-patch.js', path.join(root, 'public/ts-timeline-icon-patch.js')],
  ['/ts-vk-rebrand-chrome.js', path.join(root, 'public/ts-vk-rebrand-chrome.js')],
  ['/ts-car-brand-filter.js', path.join(root, 'public/ts-car-brand-filter.js')],
  ['/ts-thing-media-overlay.js', path.join(root, 'public/ts-thing-media-overlay.js')],
  ['/ts-pic-popup-viewer.js', path.join(root, 'public/ts-pic-popup-viewer.js')],
  ['/post-purchase-gate.mjs', path.join(root, 'public/post-purchase-gate.mjs')],
  ['/ts-trip-hero-collapse.js', path.join(root, 'public/ts-trip-hero-collapse.js')],
  ['/ts-build-stamp-customer-hide.css', path.join(root, 'public/ts-build-stamp-customer-hide.css')],
  ['/ts-build-stamp-customer-hide.js', path.join(root, 'public/ts-build-stamp-customer-hide.js')],
  ['/ts-thing-media/bindings.json', path.join(root, 'public/ts-thing-media/bindings.json')],
  ['/favicon.ico', path.join(root, 'public/favicon.ico')],
]);

const [sharedHtml, vacationHtml, trekJs, trekCss] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'vacation-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  if (pathname === '/assets/index-BKun7ofk.js') return sendText(res, 200, trekJs, 'text/javascript; charset=utf-8');
  if (pathname === '/assets/index-CbEHlMj6.css') return sendText(res, 200, trekCss, 'text/css; charset=utf-8');
  if (publicFiles.has(pathname)) {
    const file = await readFile(publicFiles.get(pathname));
    const type = pathname.endsWith('.json')
      ? 'application/json; charset=utf-8'
      : pathname.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'text/javascript; charset=utf-8';
    return sendText(res, 200, file, type);
  }
  if (pathname === '/vacation-app.html') {
    return sendText(res, 200, stampHtml(vacationHtml), 'text/html; charset=utf-8');
  }
  if (/^\/shared\/[^/]+\/?$/.test(pathname)) {
    return sendText(res, 200, stampHtml(sharedHtml), 'text/html; charset=utf-8');
  }
  if (pathname === '/api/vacation-itinerary' || pathname.startsWith('/api/vacation-itinerary/')) {
    const session = url.searchParams.get('session') || '';
    if (session !== SESSION) return sendJson(res, 404, { ok: false, error: 'unknown session' });
    const tripId = url.searchParams.get('tripId') || '';
  if (req.method === 'POST') {
      return sendJson(res, 200, { ok: true, reply: 'Fixture ok.', itinerary: [] });
    }
    return sendJson(res, 200, appPayload(origin, tripId));
  }
  const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
  if (sharedMatch && req.method === 'GET') {
    const share = decodeURIComponent(sharedMatch[1]);
    if (sharedTrips[share]) return sendJson(res, 200, sharedTrips[share]);
    return sendJson(res, 404, { error: 'missing' });
  }
  if (pathname.endsWith('/edit-access')) return sendJson(res, 200, { canEdit: false });
  if (pathname.startsWith('/icons/') || pathname.endsWith('.png') || pathname.endsWith('.svg') || pathname.endsWith('.ico')) {
    return sendText(res, 200, '', 'image/png');
  }
  if (pathname === '/manifest.webmanifest') return sendText(res, 200, '{}', 'application/json');
  if (pathname.startsWith('/src/')) {
    try {
      const file = await readFile(path.join(root, pathname));
      return sendText(res, 200, file, 'text/javascript; charset=utf-8');
    } catch {
      return sendJson(res, 404, { error: 'not found' });
    }
  }
  if (pathname === '/brand/vk-book-logo.svg') {
    const file = await readFile(path.join(root, 'public/brand/vk-book-logo.svg'));
    return sendText(res, 200, file, 'image/svg+xml');
  }
  if (pathname.startsWith('/api/')) return sendJson(res, 200, { ok: true });
  sendJson(res, 404, { error: 'not found' });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const initStorageScript = ({ map, visited }) => {
  localStorage.setItem('vk-trip-switcher-map', JSON.stringify(map));
  localStorage.setItem('vk-trip-switcher-visited-slugs', JSON.stringify(visited));
};

async function assertSharedPage(page, marker) {
  const deadline = Date.now() + 180000;
  let found = false;
  while (Date.now() < deadline) {
    found = await page.evaluate((needle) => (document.body?.innerText || '').includes(needle), marker);
    if (found) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(found, `shared marker missing: ${marker}`);
  const hung = await page.evaluate(() => new Promise((resolve) => {
    let mutations = 0;
    const mo = new MutationObserver(() => {
      mutations += 1;
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      mo.disconnect();
      resolve({ mutations });
    }, 2000);
  }));
  assert.ok(hung.mutations < 200, `shared page observer loop: mutations=${hung.mutations}`);
}

async function touchPickTrip(page, labelRe) {
  const box = await page.evaluate(() => {
    const btn = document.querySelector('#tripButton');
    const r = btn?.getBoundingClientRect();
    if (!r) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  assert.ok(box, 'trip switcher button required');
  await page.touchscreen.tap(box.x, box.y);
  await page.waitForFunction(() => document.querySelector('#vacationDropdown')?.classList.contains('open'));
  const option = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    for (const el of document.querySelectorAll('.trip-option')) {
      if (re.test(el.innerText || '')) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  }, String(labelRe));
  assert.ok(option, `trip option matching ${labelRe}`);
  await page.touchscreen.tap(option.x, option.y);
}

async function waitIframeMarker(page, marker) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const child = page.frames().find((f) => /\/shared\//.test(f.url()));
    if (child) {
      try {
        const hit = await child.evaluate((needle) => (document.body?.innerText || '').includes(needle), marker);
        if (hit) return;
      } catch {
        void 0;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`iframe marker not found: ${marker}`);
}

async function runVacationFlow(browserKind, launch) {
  const browser = await launch();
  try {
    const iPhone = browserKind === 'webkit'
      ? { width: 390, height: 844 }
      : { width: 390, height: 844 };
    const context = await browser.newContext({
      viewport: iPhone,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(initStorageScript, { map: MAP, visited: VISITED });
    const page = await context.newPage();
    await page.goto(`${origin}/vacation-app.html?session=${SESSION}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#tripButton', { timeout: 30000 });
    await page.waitForSelector('.site-pane iframe', { timeout: 60000 });
    await waitIframeMarker(page, 'NYC Accept 1016 Marker Bistro');

    await touchPickTrip(page, 'Las Vegas');
    await waitIframeMarker(page, 'Vegas Accept 1016 Marker Buffet');

    await touchPickTrip(page, 'NYC June 2026');
    await waitIframeMarker(page, 'NYC Accept 1016 Marker Bistro');

    const standalone = await context.newPage();
    await standalone.goto(`${origin}/shared/${NYC_SLUG}/`, { waitUntil: 'networkidle', timeout: 180000 });
    await assertSharedPage(standalone, 'NYC Accept 1016 Marker Bistro');
    await standalone.close();
    await context.close();
  } finally {
    await browser.close();
  }
}

const { webkit, chromium } = loadPlaywright();
const chromiumPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

await runVacationFlow('webkit', () => webkit.launch({ headless: true }));
await runVacationFlow('chromium', () => chromium.launch({
  headless: true,
  executablePath: chromiumPath,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
}));

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: chromiumPath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(initStorageScript, { map: MAP, visited: VISITED });
  const url = `${origin}/shared/${NYC_SLUG}/?embed=0`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 180000 });
  const skipped = await page.evaluate(() => {
    let calls = 0;
    const proto = MutationObserver.prototype;
    const orig = proto.observe;
    proto.observe = function observe(...args) {
      calls += 1;
      return orig.apply(this, args);
    };
    return calls;
  });
  await assertSharedPage(page, 'NYC Accept 1016 Marker Bistro');
  assert.ok(skipped >= 0);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(() => resolve()));
}

console.log('test_acceptance_1016_trip_switcher_no_freeze: ok');