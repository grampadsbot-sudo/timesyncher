import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { patchStyleTwoToConfigRenderer } from '../src/vacation/trek-style2-bundle.mjs';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import keepsakeStyle2Handler from '../src/vacation/keepsake-style2-handler.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const artifactDir = process.env.KEEPSAKE_ARTIFACT_DIR || '/opt/cursor/artifacts';
const bundleUrl = 'https://travel.timesyncher.com/assets/index-BKun7ofk.js';
const cssUrl = 'https://travel.timesyncher.com/assets/index-CbEHlMj6.css';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function sharedFromFixture(fixture, { mapsOff = false } = {}) {
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
  if (mapsOff) {
    thingOverrides.__keepsakePrintSettings = {
      maps: { 1: false, 2: false, 3: false },
    };
  }
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

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function invalidShared(req, res) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const href = String(url);
    if (href.includes('/api/shared/')) {
      return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return previous(url, options);
  };
  try {
    await sharedTripHandler(req, res);
  } finally {
    globalThis.fetch = previous;
  }
}

async function startServer({ html, js, css, token, mapsOffToken, trip, mapsOffTrip }) {
  const publicFiles = {
    '/ts-timeline-icon-patch.js': path.join(root, 'public/ts-timeline-icon-patch.js'),
    '/ts-car-brand-filter.js': path.join(root, 'public/ts-car-brand-filter.js'),
    '/ts-thing-media-overlay.js': path.join(root, 'public/ts-thing-media-overlay.js'),
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/assets/index-BKun7ofk.js') {
        return sendText(res, 200, js, 'text/javascript; charset=utf-8');
      }
      if (pathname === '/assets/index-CbEHlMj6.css') {
        return sendText(res, 200, css, 'text/css; charset=utf-8');
      }
      if (publicFiles[pathname]) {
        const file = await readFile(publicFiles[pathname]);
        return sendText(res, 200, file, 'text/javascript; charset=utf-8');
      }
      if (/^\/shared\/[^/]+(?:\/journey)?\/?$/.test(pathname)) {
        return sendText(res, 200, html, 'text/html; charset=utf-8');
      }
      const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
      if (sharedMatch && req.method === 'GET') {
        const share = sharedMatch[1];
        if (share === token) return sendJson(res, 200, trip);
        if (share === mapsOffToken) return sendJson(res, 200, mapsOffTrip);
        req.url = `/api/shared/${share}`;
        return invalidShared(req, res);
      }
      if (pathname.endsWith('/edit-access')) {
        return sendJson(res, 200, { canEdit: false });
      }
      const pdfMatch = pathname.match(/^\/api\/pdf\/shared\/(.+)$/);
      if (pdfMatch) {
        req.url = `/api/vacation-itinerary?keepsakePdf=1&pdfPath=${pdfMatch[1]}`;
        req.headers['x-forwarded-proto'] = 'http';
        return keepsakeStyle2Handler(req, res);
      }
      sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'server error' });
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  return { status: response.status, body };
}

async function bodyText(page) {
  return page.evaluate(() => document.body?.innerText || '');
}

async function openPrintLayout(page, url, marker) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction((needle) => {
    const text = document.body?.innerText || '';
    return document.body?.getAttribute('data-ae-print') === '1' && text.includes(needle);
  }, { timeout: 45000 }, marker);
}

const fixture = JSON.parse(await readFile(path.join(root, 'scripts/public-research-fixture.json'), 'utf8'));
const token = String(fixture.provider || '').trim();
assert.ok(token, 'existing public-research fixture needs a provider token');
const marker = String(fixture.candidates?.[0]?.title || '').trim();
assert.ok(marker, 'existing public-research fixture needs a candidate title');
const mapsOffToken = `${token}-maps-off`;
const trip = sharedFromFixture(fixture);
const mapsOffTrip = sharedFromFixture(fixture, { mapsOff: true });
assert.equal(trip.places.some((place) => place.__tsKeepsakeFill), false);

const html = await readFile(path.join(root, 'shared-app.html'), 'utf8');
const [jsSource, css] = await Promise.all([
  fetch(bundleUrl).then((response) => {
    if (!response.ok) throw new Error(`bundle ${response.status}`);
    return response.text();
  }),
  fetch(cssUrl).then((response) => {
    if (!response.ok) throw new Error(`css ${response.status}`);
    return response.text();
  }),
]);
const js = patchStyleTwoToConfigRenderer(jsSource);
assert.match(js, /\/shared\/:token\/journey/);
assert.match(js, /G==="keepsake-style-2"\?Ae\(!0\)/);
assert.equal([...js.matchAll(/\{"data-keepsake-admin-root":!0/g)].length, 1);
assert.equal(js.includes('children:"Trip View"'), false);
const gearOpensAdmin = '"aria-label":"Config Options","aria-expanded":Qe,onClick:()=>{Mt("config"),Ye(!1),Jt(!1),ht(!0),it(!0),Pt(!0)}';
const adminToggle = '{"data-keepsake-admin-root":!0,style:{position:"relative"},children:[n.jsx("button",{type:"button",onClick:()=>Pt(G=>!G)';
assert.equal(js.includes(gearOpensAdmin), true);
assert.equal(js.includes(adminToggle), true);

const app = await startServer({ html, js, css, token, mapsOffToken, trip, mapsOffTrip });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  const invalidApi = await getJson(`${app.origin}/api/shared/not-a-real-token-xyz`);
  assert.equal(invalidApi.status, 404);
  assert.equal(invalidApi.body.error, 'Invalid or expired link');
  assert.equal(invalidApi.body.places, undefined);
  assert.equal(JSON.stringify(invalidApi.body).includes(marker), false);
  assert.equal(JSON.stringify(invalidApi.body).includes('__tsKeepsakeFill'), false);

  const validApi = await getJson(`${app.origin}/api/shared/${encodeURIComponent(token)}`);
  assert.equal(validApi.status, 200);
  assert.equal(validApi.body.trip.title, 'Fixture research trip');
  assert.ok(validApi.body.places.some((place) => place.name === marker));

  const styleTwoPdf = await fetch(`${app.origin}/api/pdf/shared/${encodeURIComponent(token)}/report/keepsake-style-2.pdf`, { redirect: 'manual' });
  assert.equal(styleTwoPdf.status, 302);
  const styleTwoLocation = styleTwoPdf.headers.get('location') || '';
  const styleTwoTarget = `${app.origin}/shared/${encodeURIComponent(token)}/journey?style=2&printMode=report&pdfReport=keepsake-style-2`;
  assert.equal(styleTwoLocation, styleTwoTarget);
  assert.equal(styleTwoPdf.headers.get('x-timesyncher-style2'), 'staging-ae');

  const styleOnePdf = await fetch(`${app.origin}/api/pdf/shared/${encodeURIComponent(token)}/report/keepsake.pdf`, { redirect: 'manual' });
  assert.equal(styleOnePdf.status, 302);
  assert.equal(
    styleOnePdf.headers.get('location'),
    `${app.origin}/shared/${encodeURIComponent(token)}/journey?style=1&printMode=report&pdfReport=keepsake`,
  );

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1600 });

  await openPrintLayout(page, `${styleTwoTarget}`, marker);
  const styleTwoMaps = await page.$$eval('[data-day-map-page="1"]', (nodes) => nodes.length);
  const styleTwoCentered = await page.$$eval('[data-style2-centered-day="1"]', (nodes) => nodes.length);
  assert.ok(styleTwoCentered > 0, 'style=2 must render the centered Layout 2 days');
  assert.ok(styleTwoMaps > 0, 'style=2 with maps on must render day map pages');
  assert.equal(await page.$$eval('.daily-left', (nodes) => nodes.length), 0);

  await openPrintLayout(
    page,
    `${app.origin}/shared/${encodeURIComponent(token)}/journey?style=1&printMode=report&pdfReport=keepsake`,
    marker,
  );
  const styleOneColumns = await page.$$eval('.daily-left', (nodes) => nodes.length);
  const styleOneMaps = await page.$$eval('[data-day-map-page="1"]', (nodes) => nodes.length);
  assert.ok(styleOneColumns > 0, 'style=1 must render the left-itinerary Layout 1 columns');
  assert.ok(styleOneMaps > 0, 'style=1 with maps on must render day map pages');
  assert.equal(await page.$$eval('[data-style2-centered-day="1"]', (nodes) => nodes.length), 0);

  await openPrintLayout(
    page,
    `${styleTwoTarget}&ksMapOff=1,2,3`,
    marker,
  );
  const queryMapsOff = await page.$$eval('[data-day-map-page="1"]', (nodes) => nodes.length);
  assert.equal(queryMapsOff, 0, 'ksMapOff must hide day map pages');
  assert.ok(await page.$$eval('[data-style2-centered-day="1"]', (nodes) => nodes.length) > 0);

  await openPrintLayout(
    page,
    `${app.origin}/shared/${encodeURIComponent(mapsOffToken)}/journey?style=1&printMode=report&pdfReport=keepsake`,
    marker,
  );
  const storedMapsOff = await page.$$eval('[data-day-map-page="1"]', (nodes) => nodes.length);
  assert.equal(storedMapsOff, 0, '__keepsakePrintSettings.maps off must hide day map pages');
  assert.ok(await page.$$eval('.daily-left', (nodes) => nodes.length) > 0);

  const invalidPage = await browser.newPage();
  await invalidPage.goto(`${app.origin}/shared/not-a-real-token-xyz/journey?style=2&printMode=report&pdfReport=keepsake-style-2`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await invalidPage.waitForFunction(() => /expired|invalid/i.test(document.body?.innerText || ''), { timeout: 45000 });
  const invalidText = await bodyText(invalidPage);
  assert.match(invalidText, /expired|invalid/i);
  assert.equal(invalidText.includes(marker), false);
  assert.equal(await invalidPage.$('[data-ae-print="1"]'), null);
  await invalidPage.close();

  const front = await browser.newPage();
  await front.setViewport({ width: 1280, height: 900 });
  await front.goto(`${app.origin}/shared/${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await front.waitForSelector('[aria-label="PDFs"]', { timeout: 45000 });
  await front.waitForFunction(() => (document.body?.innerText || '').includes('Fixture research trip'), { timeout: 45000 });
  await front.click('[aria-label="PDFs"]');
  await front.waitForFunction(() => /Keepsakes/.test(document.body?.innerText || ''), { timeout: 10000 });
  const openedKeepsakes = await front.evaluate(() => {
    const keepsakes = [...document.querySelectorAll('[data-keepsake-menu-root] button')].find((node) => /Keepsakes/i.test(node.innerText || ''));
    if (!keepsakes) return 'missing-keepsakes';
    keepsakes.click();
    return 'ok';
  });
  assert.equal(openedKeepsakes, 'ok');
  await front.waitForFunction(() => /Style one/.test(document.body?.innerText || ''), { timeout: 10000 });
  const openedAdmin = await front.evaluate(() => {
    const admin = [...document.querySelectorAll('[data-keepsake-admin-root] button')].find((node) => /Admin/i.test(node.innerText || ''));
    if (!admin) return 'missing-admin';
    admin.click();
    return 'ok';
  });
  assert.equal(openedAdmin, 'ok');
  await front.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /initial summary page/i.test(text)
      && /daily maps/i.test(text)
      && /day 1 map/i.test(text)
      && /style one/i.test(text)
      && /style two/i.test(text)
      && /timesyncher vacation logo/i.test(text);
  }, { timeout: 10000 });
  const adminFromMenu = await front.$eval('[data-keepsake-admin-root]', (node) => (node.innerText || '').replace(/\s+/g, ' ').trim());
  assert.equal(await front.$$eval('[data-keepsake-admin-root]', (nodes) => nodes.length), 1);
  const gearLabels = await front.$$eval('button', (nodes) => nodes.map((node) => node.getAttribute('aria-label')).filter(Boolean));
  assert.ok(gearLabels.includes('PDFs'), 'front page Print/PDF control is present');
  assert.ok(gearLabels.includes('Config Options'), 'front page gear is present');

  await mkdir(artifactDir, { recursive: true });
  await front.screenshot({ path: path.join(artifactDir, 'keepsake-config-admin.png') });
  await front.evaluate(() => {
    document.documentElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await front.waitForFunction(() => !document.querySelector('[data-keepsake-admin-root]'), { timeout: 10000 });
  await front.click('[aria-label="Config Options"]');
  await front.waitForFunction(() => {
    const root = document.querySelector('[data-keepsake-admin-root]');
    const text = root?.innerText || '';
    return /initial summary page/i.test(text) && /daily maps/i.test(text) && /day 1 map/i.test(text);
  }, { timeout: 10000 });
  const adminFromGear = await front.$eval('[data-keepsake-admin-root]', (node) => (node.innerText || '').replace(/\s+/g, ' ').trim());
  assert.equal(await front.$$eval('[data-keepsake-admin-root]', (nodes) => nodes.length), 1);
  assert.equal(adminFromGear, adminFromMenu);
  assert.equal(/trip view/i.test(adminFromGear), false);
  await front.screenshot({ path: path.join(artifactDir, 'keepsake-gear-admin.png') });
  await front.close();
  await openPrintLayout(
    page,
    `${app.origin}/shared/${encodeURIComponent(token)}/journey?style=1&printMode=report&pdfReport=keepsake`,
    marker,
  );
  await page.screenshot({ path: path.join(artifactDir, 'keepsake-layout-1.png'), fullPage: true });
  await openPrintLayout(page, styleTwoTarget, marker);
  await page.screenshot({ path: path.join(artifactDir, 'keepsake-layout-2.png'), fullPage: true });

  console.log('keepsake layout route tests passed');
  console.log(`artifacts ${artifactDir}/keepsake-layout-1.png`);
  console.log(`artifacts ${artifactDir}/keepsake-layout-2.png`);
  console.log(`artifacts ${artifactDir}/keepsake-config-admin.png`);
  console.log(`artifacts ${artifactDir}/keepsake-gear-admin.png`);
} finally {
  await browser.close();
  await app.close();
}
