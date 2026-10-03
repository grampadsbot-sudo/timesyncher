#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const intakeSlug = 'intake-f687d29fec02';
const outDir = process.env.TAB_ROW_SCREENSHOT_DIR || '/opt/cursor/artifacts/shared-tab-row';

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
    liveTabLists: { hotels: [], cars: [] },
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
      const share = decodeURIComponent(sharedMatch[1]);
      if (share === intakeSlug) return sendJson(res, 200, tripPayload);
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

async function captureTabRow(page, origin, width, tag) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/shared/${intakeSlug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => (document.body?.innerText || '').includes('Fixture research trip'),
    { timeout: 90000 },
  );
  await sleep(2500);
  const clip = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('[data-ts-logo-chip][data-tab-category]')];
    const buttons = chips.length
      ? chips.map((chip) => chip.closest('button')).filter(Boolean)
      : [...document.querySelectorAll('button')].filter((btn) => btn.querySelector('[data-ts-logo-chip]'));
    if (!buttons.length) return null;
    const rects = buttons.map((btn) => btn.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const pad = 8;
    return {
      x: Math.max(0, left - pad),
      y: Math.max(0, top - pad),
      width: Math.min(window.innerWidth, right - left + pad * 2),
      height: bottom - top + pad * 2,
    };
  });
  if (!clip || clip.width < 10 || clip.height < 10) {
    throw new Error(`tab row clip missing at ${width}px (${tag})`);
  }
  const file = path.join(outDir, `${tag}-w${width}.png`);
  await page.screenshot({ path: file, clip, type: 'png' });
  return file;
}

const fixture = JSON.parse(await readFile(path.join(root, 'scripts/public-research-fixture.json'), 'utf8'));
const tripPayload = sharedFromFixture(fixture);

const [html, css, bundleAfter] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
]);
const bundleBefore = execFileSync('git', ['show', '9986132:public/assets/index-BKun7ofk.js'], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');

await mkdir(outDir, { recursive: true });

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const written = [];
for (const phase of [
  { tag: 'before-9986132', js: bundleBefore },
  { tag: 'after-fix', js: bundleAfter },
]) {
  const app = await startServer({ html, css, js: phase.js, tripPayload });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/auth/app-config') || url.includes('/auth/app-config')) {
        request.abort('blockedbyclient');
        return;
      }
      if (url.startsWith(app.origin) || url.startsWith('data:') || url.startsWith('blob:')) {
        request.continue();
        return;
      }
      request.abort('blockedbyclient');
    });
    for (const width of [1280, 390]) {
      written.push(await captureTabRow(page, app.origin, width, phase.tag));
    }
    await page.close();
  } finally {
    await app.close();
  }
}

await browser.close();
await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({ files: written }, null, 2)}\n`);
console.log(JSON.stringify({ outDir, files: written }, null, 2));
