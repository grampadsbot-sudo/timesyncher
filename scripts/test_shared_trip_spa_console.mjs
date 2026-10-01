import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const bundlePath = new URL('../public/assets/index-BKun7ofk.js', import.meta.url);
const cssPath = new URL('../public/assets/index-CbEHlMj6.css', import.meta.url);
const intakeSlug = 'intake-f687d29fec02';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function sharedFromFixture(fixture) {
  const candidates = Array.isArray(fixture.candidates) ? fixture.candidates : [];
  const categories = {
    hotel: { id: 1, name: 'Hotel', icon: '🏨' },
    restaurant: { id: 2, name: 'Restaurant', icon: '🍽️' },
    store: { id: 11, name: 'Store', icon: '🛍️' },
    activity: { id: 3, name: 'Attraction', icon: '🏛️' },
    transport: { id: 5, name: 'Transport', icon: '🚌' },
  };
  const overrideCategory = {
    hotel: 'hotel',
    restaurant: 'restaurant',
    store: 'store',
    activity: 'other',
    transport: 'flight',
  };
  const days = [1, 2, 3].map((day) => ({
    id: 100 + day,
    trip_id: 1,
    day_number: day,
    date: `2026-10-0${day}`,
    notes: '',
    title: '',
  }));
  const places = [];
  const assignments = Object.fromEntries(days.map((day) => [String(day.id), []]));
  const thingOverrides = {};
  candidates.forEach((candidate, index) => {
    const kind = categories[candidate.category] || categories.activity;
    const id = 200 + index;
    const day = days[index % days.length];
    const place = {
      id,
      trip_id: 1,
      name: candidate.title,
      description: candidate.summary || '',
      lat: null,
      lng: null,
      address: '',
      category_id: kind.id,
      category_name: kind.name,
      category_icon: kind.icon,
      category: { id: kind.id, name: kind.name, icon: kind.icon },
      reservation_status: 'considering',
      place_time: '10:00',
      website: candidate.website || '',
      notes: '',
    };
    places.push(place);
    assignments[String(day.id)].push({
      id: 300 + index,
      day_id: day.id,
      order_index: assignments[String(day.id)].length,
      notes: '',
      place,
    });
    thingOverrides[`place:${id}`] = {
      timeline: true,
      category: overrideCategory[candidate.category] || 'other',
      summary: candidate.summary || '',
    };
  });
  return {
    trip: {
      id: 1,
      title: 'Fixture research trip',
      description: 'TimeSyncher Vacation',
      start_date: '2026-10-01',
      end_date: '2026-10-03',
      currency: 'USD',
    },
    days,
    assignments,
    dayNotes: {},
    places,
    categories: Object.values(categories),
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
    thingOverrides,
  };
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
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
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
      const type = pathname.endsWith('.json') ? 'application/json; charset=utf-8' : pathname.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/javascript; charset=utf-8';
      return sendText(res, 200, file, type);
    }
    if (pathname === '/manifest.webmanifest') {
      return sendText(res, 200, JSON.stringify({ name: 'TimeSyncher Vacation', start_url: '/' }), 'application/manifest+json');
    }
    if (pathname.startsWith('/icons/')) return sendText(res, 200, '', 'image/png');
    if (pathname.endsWith('/edit-access')) return sendJson(res, 200, { canEdit: false });
    if (pathname.startsWith('/src/')) {
      const filePath = path.join(root, pathname);
      try {
        const file = await readFile(filePath);
        return sendText(res, 200, file, 'text/javascript; charset=utf-8');
      } catch {
        return sendJson(res, 404, { error: 'not found' });
      }
    }
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/shared/')) {
      return sendJson(res, 200, { ok: true, notices: [], bindings: [], media: [] });
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return sendText(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      const share = decodeURIComponent(sharedMatch[1]);
      if (share === intakeSlug) return sendJson(res, 200, tripPayload);
      return sendJson(res, 404, { error: 'missing', code: 'shared_trip_slug_not_found' });
    }
    if (pathname.endsWith('/edit-access')) return sendJson(res, 200, { canEdit: false });
    sendJson(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

const fixture = JSON.parse(await readFile(path.join(root, 'scripts/public-research-fixture.json'), 'utf8'));
const marker = String(fixture.candidates?.[0]?.title || '').trim();
assert.ok(marker, 'fixture needs a candidate title');

const committed = await readFile(bundlePath, 'utf8');
assert.equal(committed.includes('Cr.getAppConfig'), false);

const [html, css] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(cssPath, 'utf8'),
]);
const js = committed;

const tripPayload = sharedFromFixture(fixture);
const app = await startServer({ html, js, css, tripPayload });

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

function allowConsoleError(text) {
  if (/ERR_BLOCKED_BY_CLIENT/i.test(text)) return true;
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|leaflet/i.test(text)) return true;
  if (/Failed to load resource.*favicon/i.test(text)) return true;
  return false;
}

const consoleErrors = [];
const pageErrors = [];
const notFoundUrls = [];

try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(app.origin) || url.startsWith('data:') || url.startsWith('blob:')) {
      request.continue();
      return;
    }
    request.abort('blockedbyclient');
  });
  page.on('response', (response) => {
    if (response.status() === 404 && response.url().startsWith(app.origin)) {
      notFoundUrls.push(response.url());
    }
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (allowConsoleError(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    const text = String(error?.message || error);
    if (/Minified React error #299/.test(text)) return;
    pageErrors.push(text);
  });

  await page.goto(`${app.origin}/shared/${intakeSlug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => (document.body?.innerText || '').includes('Fixture research trip'), { timeout: 45000 });

  const blankRoot = await page.evaluate(() => {
    const root = document.getElementById('root') || document.getElementById('app');
    if (!root) return true;
    const text = (root.innerText || '').replace(/\s+/g, '').trim();
    const visible = root.querySelector('canvas,svg,img,iframe,[data-trip-view-root],[data-keepsake-admin-root],button,h1,h2');
    return !text && !visible;
  });
  assert.equal(blankRoot, false, 'shared trip SPA root must render content');
  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')} (404 urls: ${notFoundUrls.join(', ')})`);
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
} finally {
  await browser.close();
  await app.close();
}

console.log('shared trip spa console passed');
