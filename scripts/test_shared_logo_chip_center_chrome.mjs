import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';
import {
  assertComWithinTolerance,
  collectLogoChipElements,
  measureCenterOfMassOffset,
  screenshotChipCrop,
} from './lib/logo-chip-center-of-mass.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const bundlePath = path.join(root, 'public/assets/index-BKun7ofk.js');
const cssPath = path.join(root, 'public/assets/index-CbEHlMj6.css');
const intakeSlug = 'intake-000000000001';
const artifactRoot = process.env.LOGO_CHIP_ARTIFACT_ROOT || '/opt/cursor/artifacts/screenshots';
const phase = process.env.LOGO_CHIP_PHASE || 'after';
const maxOffset = Number(process.env.LOGO_CHIP_MAX_OFFSET || '1.5');

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

function buildPayload() {
  const shared = applyCapturedLogos(sharedTripFromIntake({
    trip: {
      id: '00000000-0000-4000-8000-000000000099',
      title: 'Logo center fixture',
      destination: 'Area alpha',
      start_date: '2026-10-01',
      end_date: '2026-10-03',
    },
    things: [
      {
        id: 'thing-hotel-brand',
        title: 'Harbor Hyatt',
        category: 'hotel',
        lat: 40.02,
        lng: -105.02,
        metadata: { customerStatedLodging: true },
        starts_at: '2026-10-01',
      },
      {
        id: 'thing-car-brand',
        title: 'Summit Car Rental',
        category: 'car',
        lat: 40.03,
        lng: -105.03,
        starts_at: '2026-10-01',
      },
      {
        id: 'thing-hotel-emoji',
        title: 'Emoji Hotel',
        category: 'hotel',
        lat: 40.04,
        lng: -105.04,
        metadata: { customerStatedLodging: true },
        starts_at: '2026-10-01',
      },
      {
        id: 'thing-car-emoji',
        title: 'Emoji Rental',
        category: 'car',
        lat: 40.05,
        lng: -105.05,
        starts_at: '2026-10-01',
      },
    ],
  }));

  for (const place of shared.places) {
    const key = `place:${place.id}`;
    const override = { ...(shared.thingOverrides[key] || {}) };
    if (/Harbor Hyatt/i.test(place.name)) {
      place.logoUrl = '/ts-thing-logos/hotel-brand.svg';
      override.logoUrl = '/ts-thing-logos/hotel-brand.svg';
      override.icon = '🏨';
    } else if (/Summit Car/i.test(place.name)) {
      place.logoUrl = '/ts-thing-logos/car-brand.svg';
      override.logoUrl = '/ts-thing-logos/car-brand.svg';
      override.icon = '🚗';
    } else if (/Emoji Hotel/i.test(place.name)) {
      place.logoUrl = '';
      override.logoUrl = '';
      override.icon = '🏨';
    } else if (/Emoji Rental/i.test(place.name)) {
      place.logoUrl = '';
      override.logoUrl = '';
      override.icon = '🚗';
    }
    shared.thingOverrides[key] = override;
  }
  return shared;
}

async function startServer({ html, js, css, payload, staticFiles }) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const { pathname } = url;
    if (pathname === '/assets/index-BKun7ofk.js') return sendText(res, 200, js, 'text/javascript; charset=utf-8');
    if (pathname === '/assets/index-CbEHlMj6.css') return sendText(res, 200, css, 'text/css; charset=utf-8');
    if (staticFiles[pathname]) return sendText(res, 200, staticFiles[pathname], staticFiles[pathname].trim().startsWith('<') ? 'image/svg+xml' : 'application/octet-stream');
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickTab(page, keyword) {
  return page.evaluate((kw) => {
    const normalize = (text) => String(text || '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const want = normalize(kw);
    for (const node of document.querySelectorAll('button,[role="tab"],a')) {
      const combined = [node.textContent, node.getAttribute('title') || '', node.getAttribute('data-tab') || ''].join(' ');
      if (normalize(combined).includes(want)) {
        node.click();
        return true;
      }
    }
    return false;
  }, keyword);
}

async function sampleSurface(page, { surface, width, place }) {
  const metrics = [];
  const chips = await collectLogoChipElements(page);
  let idx = 0;
  for (const chip of chips) {
    const offset = await measureCenterOfMassOffset(page, chip.selector);
    if (!offset) continue;
    const cropPath = path.join(
      artifactRoot,
      `logo-center-${phase}-${width}-${place || surface}-${idx}.png`,
    );
    await screenshotChipCrop(page, chip.selector, cropPath);
    metrics.push({
      surface,
      width,
      place: place || `${chip.kind}-${idx}`,
      kind: chip.kind,
      offset,
      cropPath,
    });
    idx += 1;
  }
  return metrics;
}

async function runScenario(page, origin, width) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/shared/${intakeSlug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => (document.body?.innerText || '').includes('Logo center fixture'), { timeout: 45000 });
  const all = [];

  const planTab = await page.$('button[title="Plan"],button[title*="Plan"]');
  if (planTab) await planTab.click();
  await page.waitForSelector('.leaflet-container', { timeout: 30000 }).catch((error) => {
    if (error?.name !== 'TimeoutError') throw error;
  });
  await sleep(1200);
  all.push(...await sampleSurface(page, { surface: 'plan-map', width, place: 'plan-map' }));

  const markerCount = await page.evaluate(() => document.querySelectorAll('.leaflet-marker-icon').length);
  for (let index = 0; index < markerCount; index += 1) {
    await page.evaluate((markerIndex) => {
      const marker = document.querySelectorAll('.leaflet-marker-icon')[markerIndex];
      marker?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }, index);
    await sleep(900);
    all.push(...await sampleSurface(page, {
      surface: 'detail',
      width,
      place: index === 0 ? 'hotel-detail' : 'car-detail',
    }));
    await page.keyboard.press('Escape').catch((error) => {
      if (error?.name !== 'TargetCloseError') throw error;
    });
    await sleep(400);
  }

  await clickTab(page, 'booking');
  await sleep(1200);
  all.push(...await sampleSurface(page, { surface: 'bookings', width, place: 'bookings' }));

  for (const tab of ['hotel', 'car']) {
    await clickTab(page, tab);
    await sleep(900);
    all.push(...await sampleSurface(page, { surface: 'bookings-tab', width, place: `${tab}-tab` }));
  }

  return all;
}

const [html, css, js, hotelSvg, carSvg] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(cssPath, 'utf8'),
  readFile(bundlePath, 'utf8'),
  readFile(path.join(root, 'public/ts-thing-logos/hotel-brand.svg'), 'utf8'),
  readFile(path.join(root, 'public/ts-thing-logos/car-brand.svg'), 'utf8'),
]);

const payload = buildPayload();
const staticFiles = {
  '/ts-thing-logos/hotel-brand.svg': hotelSvg,
  '/ts-thing-logos/car-brand.svg': carSvg,
  '/ts-timeline-icon-patch.js': await readFile(path.join(root, 'public/ts-timeline-icon-patch.js'), 'utf8').catch(() => ''),
};

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const app = await startServer({ html, js, css, payload, staticFiles });
const results = [];
try {
  const page = await browser.newPage();
  for (const width of [1280, 390]) {
    results.push(...await runScenario(page, app.origin, width));
  }
} finally {
  await browser.close();
  await app.close();
}

console.log(JSON.stringify({ phase, results }, null, 2));

if (phase === 'after') {
  const measured = results.filter((r) =>
    ['brand', 'tiny-logo', 'map-marker', 'emoji'].includes(r.kind));
  assert.ok(
    measured.some((r) => r.kind === 'brand' || r.kind === 'tiny-logo' || r.kind === 'map-marker'),
    'expected logo chips in fixture surfaces',
  );
  assertComWithinTolerance(measured, maxOffset);
}

console.log(`shared logo chip center ${phase} chrome tests passed`);
