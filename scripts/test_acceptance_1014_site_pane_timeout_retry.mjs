#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const RETRY_LABEL = 'Still loading\u2026 Tap to retry';
const RTT_MS = 800;
const THROUGHPUT_BPS = (400 * 1000) / 8;
const slug = `accept1014-${Date.now().toString(36)}`;
const session = 'accept1014-session';
const PW_PREFIX = '/tmp/pw';
const PW_BROWSERS_PATH = '/tmp/pw-browsers';

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function tryRequirePlaywright(candidate) {
  try {
    return require(candidate);
  } catch {
    return null;
  }
}

function bootstrapPlaywrightForCi() {
  const bundled = path.join(PW_PREFIX, 'node_modules/playwright');
  if (!existsSync(bundled)) {
    const pkgInstall = spawnSync('npm', ['install', '--prefix', PW_PREFIX, 'playwright@1.52.0'], {
      stdio: 'inherit',
    });
    if (pkgInstall.status !== 0) {
      throw new Error(`playwright npm install failed (status ${pkgInstall.status ?? 'null'})`);
    }
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = PW_BROWSERS_PATH;
  const browserInstall = spawnSync(
    'npx',
    ['--prefix', PW_PREFIX, 'playwright', 'install', 'webkit'],
    {
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: PW_BROWSERS_PATH },
    },
  );
  if (browserInstall.status !== 0) {
    throw new Error(`playwright webkit install failed (status ${browserInstall.status ?? 'null'})`);
  }
  return require(bundled);
}

function loadPlaywright() {
  const candidates = [
    'playwright',
    'playwright-core',
    path.join(root, 'node_modules/playwright'),
    path.join(PW_PREFIX, 'node_modules/playwright'),
    path.join(os.homedir(), 'tsv-dispatch/capture/node_modules/playwright'),
    path.join(os.homedir(), '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'),
  ];
  for (const candidate of candidates) {
    const mod = tryRequirePlaywright(candidate);
    if (mod) return mod;
  }
  return bootstrapPlaywrightForCi();
}

async function pacePlaywrightRoute(route, slowEmbedHolds, slug) {
  const url = route.request().url();
  await new Promise((resolve) => setTimeout(resolve, RTT_MS));
  const blocked = slowEmbedHolds > 0
    && url.includes(`/shared/${slug}/`)
    && !url.includes('tsSiteRetry=');
  if (blocked) {
    await route.abort();
    return;
  }
  try {
    const response = await route.fetch();
    const body = await response.body();
    const transferMs = Math.ceil((body.length / THROUGHPUT_BPS) * 1000);
    if (transferMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, transferMs));
    }
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body,
    });
  } catch {
    await route.continue();
  }
}

function send(res, status, body, type, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': buf.length,
    ...headers,
  });
  res.end(buf);
}

const [vacationHtml, js, css] = await Promise.all([
  readFile(path.join(root, 'vacation-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
]);
const embedHtml = '<!doctype html><html><head><title>accept1014 embed</title></head><body>accept1014-embed-ready</body></html>';

const publicJs = [
  '/vacation-app-request.js',
  '/vacation-app-shell.css',
  '/brand/vk-book-logo.svg',
  '/ts-timeline-icon-patch.js',
  '/ts-car-brand-filter.js',
  '/ts-thing-media-overlay.js',
  '/post-purchase-gate.mjs',
  '/ts-vk-rebrand-chrome.js',
  '/ts-pic-popup-viewer.js',
  '/ts-trip-hero-collapse.js',
];

const sharedPayload = {
  trip: {
    id: 1014,
    title: 'Acceptance copy trip',
    description: 'TimeSyncher Vacation',
    start_date: '2027-04-01',
    end_date: '2027-04-05',
    currency: 'USD',
  },
  days: [{ id: 1, trip_id: 1014, day_number: 1, date: '2027-04-01', notes: '', title: '' }],
  assignments: { 1: [] },
  dayNotes: {},
  places: [],
  categories: [],
  permissions: {
    share_map: true,
    share_bookings: false,
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
  thingOverrides: {},
  liveTabLists: { hotels: [], cars: [] },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/assets/index-BKun7ofk.js') {
    return send(res, 200, js, 'text/javascript; charset=utf-8', {
      'cache-control': 'public, max-age=31536000, immutable',
    });
  }
  if (pathname === '/assets/index-CbEHlMj6.css') {
    return send(res, 200, css, 'text/css; charset=utf-8', {
      'cache-control': 'public, max-age=31536000, immutable',
    });
  }
  if (publicJs.includes(pathname)) {
    const filePath = path.join(root, 'public', pathname.slice(1));
    const type = pathname.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : pathname.endsWith('.svg')
        ? 'image/svg+xml'
        : 'text/javascript; charset=utf-8';
    return send(res, 200, await readFile(filePath), type);
  }
  if (pathname.startsWith('/src/')) {
    try {
      return send(res, 200, await readFile(path.join(root, pathname)), 'text/javascript; charset=utf-8');
    } catch {
      return send(res, 404, '{"error":"missing"}', 'application/json; charset=utf-8');
    }
  }
  if (pathname === '/vacation-app.html') {
    return send(res, 200, vacationHtml, 'text/html; charset=utf-8');
  }
  if (pathname === '/manifest.webmanifest') return send(res, 200, '{}', 'application/manifest+json');
  const embedMatch = pathname.match(/^\/shared\/([^/]+)\/?$/);
  if (embedMatch) {
    return send(res, 200, embedHtml, 'text/html; charset=utf-8');
  }
  if (pathname.startsWith('/api/vacation-itinerary')) {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const site = `${origin}/shared/${slug}/?embed=1`;
    const payload = {
      ok: true,
      session: {
        token: session,
        status: 'active',
        customerName: 'Guest',
        email: 'guest@example.com',
        currentTripId: 'trip-1014',
        seat: null,
      },
      eula: { accepted: true, text: 'Terms' },
      vacations: [{
        id: 'trip-1014',
        title: 'Acceptance copy trip',
        destination: 'Fixture coast',
        startDate: '2027-04-01',
        endDate: '2027-04-05',
        status: 'planning',
        publicUrl: site.replace('?embed=1', '/'),
      }],
      turns: [{
        id: 'turn-welcome',
        speaker: 'assistant',
        direction: 'outbound',
        authorLabel: 'TimeSyncher',
        body: 'Welcome.',
      }],
      itinerary: [],
    };
    payload.vacations[0].publicUrl = `${origin}/shared/${slug}/`;
    return send(res, 200, JSON.stringify(payload), 'application/json; charset=utf-8');
  }
  if (pathname === `/api/shared/${slug}/` || pathname === `/api/shared/${slug}`) {
    return send(res, 200, JSON.stringify(sharedPayload), 'application/json; charset=utf-8');
  }
  if (pathname.endsWith('/edit-access')) return send(res, 200, '{"canEdit":false}', 'application/json; charset=utf-8');
  if (pathname.startsWith('/api/')) return send(res, 200, '{"ok":true}', 'application/json; charset=utf-8');
  return send(res, 404, 'missing', 'text/plain; charset=utf-8');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function applyIphoneThrottle(page) {
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  );
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: RTT_MS,
    downloadThroughput: THROUGHPUT_BPS,
    uploadThroughput: THROUGHPUT_BPS,
  });
}

let slowEmbedHolds = 0;
const releaseSlowEmbed = () => {
  slowEmbedHolds = 0;
};

try {
  const slowPage = await browser.newPage();
  await applyIphoneThrottle(slowPage);
  await slowPage.setRequestInterception(true);
  slowPage.on('request', (request) => {
    const reqUrl = request.url();
    const blocked = slowEmbedHolds > 0
      && reqUrl.includes(`/shared/${slug}/`)
      && !reqUrl.includes('tsSiteRetry=');
    if (blocked) return;
    request.continue().catch((error) => {
      void error;
    });
  });
  slowEmbedHolds = 1;
  const started = Date.now();
  await slowPage.goto(`${origin}/vacation-app.html?session=${session}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await slowPage.waitForSelector('.site-pane iframe', { timeout: 30000 });
  await slowPage.waitForSelector('[data-site-pane-retry="1"]', { timeout: 35000 });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 14000, `retry should appear after ~15s, elapsed=${elapsed}`);
  const retryText = await slowPage.$eval('[data-site-pane-retry="1"]', (node) => node.textContent || '');
  assert.equal(retryText, RETRY_LABEL);

  const retryBox = await slowPage.$eval('[data-site-pane-retry="1"]', (node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  releaseSlowEmbed();
  await slowPage.touchscreen.tap(retryBox.x, retryBox.y);
  await slowPage.waitForFunction(
    () => {
      const frame = document.querySelector('.site-pane iframe');
      return Boolean(frame?.contentDocument?.body);
    },
    { timeout: 60000 },
  );
  const recovered = await slowPage.evaluate(() => {
    const retry = document.querySelector('[data-site-pane-retry="1"]');
    const frame = document.querySelector('.site-pane iframe');
    return { retryHidden: !retry, hasFrameBody: Boolean(frame?.contentDocument?.body) };
  });
  assert.ok(recovered.retryHidden, 'retry control should hide after a successful reload');
  assert.ok(recovered.hasFrameBody, 'iframe should recover after tap-to-retry');

  const fastPage = await browser.newPage();
  await fastPage.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  );
  await fastPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await fastPage.goto(`${origin}/vacation-app.html?session=${session}`, { waitUntil: 'networkidle2', timeout: 120000 });
  await fastPage.waitForSelector('.site-pane iframe', { timeout: 30000 });
  await fastPage.waitForFunction(
    () => (document.querySelector('.site-pane iframe')?.contentDocument?.body?.innerText || '').includes('accept1014-embed-ready'),
    { timeout: 60000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 16000));
  const fastState = await fastPage.evaluate(() => ({
    retry: Boolean(document.querySelector('[data-site-pane-retry="1"]')),
    iframe: Boolean(document.querySelector('.site-pane iframe')),
  }));
  assert.equal(fastState.retry, false, 'unthrottled load must not show retry state');
  assert.equal(fastState.iframe, true, 'site pane iframe must remain on normal load');
} finally {
  releaseSlowEmbed();
  await browser.close();
}

const { webkit, devices } = loadPlaywright();
const iPhone = devices['iPhone 13'] || devices['iPhone 12'];
const webkitBrowser = await webkit.launch({ headless: true });
let webkitSlowHolds = 0;
try {
  const slowContext = await webkitBrowser.newContext({
    ...iPhone,
    locale: 'en-US',
  });
  await slowContext.route('**/*', (route) => pacePlaywrightRoute(route, webkitSlowHolds, slug));
  const slowPage = await slowContext.newPage();
  webkitSlowHolds = 1;
  const webkitSlowStart = Date.now();
  await slowPage.goto(`${origin}/vacation-app.html?session=${session}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await slowPage.waitForSelector('.site-pane iframe', { timeout: 30000 });
  await slowPage.waitForSelector('[data-site-pane-retry="1"]', { timeout: 35000 });
  const webkitElapsed = Date.now() - webkitSlowStart;
  assert.ok(webkitElapsed >= 14000, `webkit retry should appear after ~15s, elapsed=${webkitElapsed}`);
  const webkitRetryText = await slowPage.locator('[data-site-pane-retry="1"]').innerText();
  assert.equal(webkitRetryText.trim(), RETRY_LABEL);
  webkitSlowHolds = 0;
  await slowPage.locator('[data-site-pane-retry="1"]').tap();
  await slowPage.waitForFunction(
    () => {
      const frame = document.querySelector('.site-pane iframe');
      return Boolean(frame?.contentDocument?.body);
    },
    undefined,
    { timeout: 60000 },
  );
  const webkitRecovered = await slowPage.evaluate(() => {
    const retry = document.querySelector('[data-site-pane-retry="1"]');
    const frame = document.querySelector('.site-pane iframe');
    return { retryHidden: !retry, hasFrameBody: Boolean(frame?.contentDocument?.body) };
  });
  assert.ok(webkitRecovered.retryHidden, 'webkit: retry control should hide after a successful reload');
  assert.ok(webkitRecovered.hasFrameBody, 'webkit: iframe should recover after tap-to-retry');
  await slowContext.close();

  const fastContext = await webkitBrowser.newContext({
    ...iPhone,
    locale: 'en-US',
  });
  const fastPage = await fastContext.newPage();
  await fastPage.goto(`${origin}/vacation-app.html?session=${session}`, { waitUntil: 'networkidle', timeout: 120000 });
  await fastPage.waitForSelector('.site-pane iframe', { timeout: 30000 });
  await fastPage.waitForFunction(
    () => (document.querySelector('.site-pane iframe')?.contentDocument?.body?.innerText || '').includes('accept1014-embed-ready'),
    undefined,
    { timeout: 60000 },
  );
  await fastPage.waitForTimeout(16000);
  const webkitFastState = await fastPage.evaluate(() => ({
    retry: Boolean(document.querySelector('[data-site-pane-retry="1"]')),
    iframe: Boolean(document.querySelector('.site-pane iframe')),
  }));
  assert.equal(webkitFastState.retry, false, 'webkit unthrottled load must not show retry state');
  assert.equal(webkitFastState.iframe, true, 'webkit site pane iframe must remain on normal load');
  await fastContext.close();
} finally {
  webkitSlowHolds = 0;
  await webkitBrowser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log('test_acceptance_1014_site_pane_timeout_retry: ok (chromium + webkit)');