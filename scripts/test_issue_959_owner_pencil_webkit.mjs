#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharedTripHandler, { useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { createWebAccessMemoryDb } from './lib/web-access-memory-db.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ownerAccess = await import('../src/vacation/vacation-app-owner-web-access.mjs').catch(() => ({}));
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const candidate of [
    'playwright',
    path.join(root, 'node_modules/playwright'),
    path.join(os.homedir(), 'tsv-dispatch/capture/node_modules/playwright'),
  ]) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }
  throw new Error('Playwright required for issue #959 owner pencil WebKit test');
}

const shareToken = 'issue959Share0123456789abcdefABCD';
const tripId = 'cccccccc-0000-4000-8000-000000000959';
const ownerId = 'aaaaaaaa-0000-4000-8000-000000000959';
const viewerId = 'aaaaaaaa-0000-4000-8000-000000000960';
const sessions = {
  owner: { token: 'issue959-owner-session', customer_id: ownerId, email: 'owner@example.com', display_name: 'Owner' },
  viewer: { token: 'issue959-viewer-session', customer_id: viewerId, email: 'viewer@example.com', display_name: 'Viewer' },
};
const shared = JSON.stringify(finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip()));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function inside(base, rel) {
  const full = path.resolve(base, `.${rel}`);
  return full.startsWith(base + path.sep) ? full : null;
}

async function startServer() {
  const memory = createWebAccessMemoryDb({
    customers: [{ id: ownerId, email: sessions.owner.email }, { id: viewerId, email: sessions.viewer.email }],
    trips: [{ id: tripId, customer_id: ownerId, title: 'Trip', metadata: { publicSlug: shareToken } }],
  });
  useSharedTripDatabase(memory.db);
  let env = {};
  const send = (res, status, body, type, headers = {}) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
    res.end(body);
  };
  const json = (res, status, body, headers) => send(res, status, JSON.stringify(body), MIME['.json'], headers);
  const file = async (res, full) => (full && existsSync(full)
    ? send(res, 200, await readFile(full), MIME[path.extname(full)] || 'application/octet-stream')
    : json(res, 404, { error: 'not found' }));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const origin = env.TIMESYNCHER_SITE_BASE_URL;
      if (pathname.startsWith('/api/vacation-itinerary')) {
        const session = Object.values(sessions).find((row) => row.token === url.searchParams.get('session'));
        if (!session) return json(res, 404, { ok: false });
        const headers = {};
        if (typeof ownerAccess.vacationAppOwnerWebAccessCookie === 'function') {
          const cookie = await ownerAccess.vacationAppOwnerWebAccessCookie(memory.db, req, { session, tripId, env });
          if (cookie) headers['set-cookie'] = cookie;
        }
        return json(res, 200, {
          ok: true,
          session: { token: session.token, status: 'active', customerName: session.display_name, email: session.email, currentTripId: tripId, seat: null },
          eula: { accepted: true, text: 'Terms' },
          vacations: [{ id: tripId, title: 'Trip', shortName: 'Trip', destination: '', startDate: '2026-06-23', endDate: '2026-06-30', status: 'active', current: true, publicUrl: `${origin}/shared/${shareToken}/`, shareToken }],
          turns: [{ id: 'turn-welcome', speaker: 'assistant', direction: 'outbound', authorLabel: 'TimeSyncher', body: 'Welcome back.' }],
          itinerary: [],
        }, headers);
      }
      if (pathname === `/api/shared/${shareToken}` || pathname === `/api/shared/${shareToken}/`) return send(res, 200, shared, MIME['.json']);
      if (pathname === `/api/shared/${shareToken}/edit-access`) {
        const saved = process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;
        process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT = env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;
        try {
          return await sharedTripHandler(req, res);
        } finally {
          if (saved == null) delete process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT;
          else process.env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT = saved;
        }
      }
      if (pathname.startsWith('/api/') && req.method !== 'GET') return json(res, 405, { ok: false });
      if (pathname.startsWith('/api/')) return json(res, 200, { ok: true, notices: [], bindings: [], media: [] });
      if (pathname === '/vacation-app.html') return file(res, path.join(root, 'vacation-app.html'));
      if (/^\/shared\/[^/]+\/?$/.test(pathname)) return file(res, path.join(root, 'shared-app.html'));
      if (pathname.startsWith('/src/')) return file(res, inside(root, pathname));
      return file(res, inside(path.join(root, 'public'), pathname));
    } catch (error) {
      json(res, 500, { error: String(error?.message || error) });
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  env = {
    TIMESYNCHER_SITE_BASE_URL: origin,
    TIMESYNCHER_TRAVEL_BASE_URL: origin,
    TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'issue-959-webkit-salt',
    NODE_ENV: 'development',
  };
  return {
    origin,
    close: () => new Promise((resolve) => {
      useSharedTripDatabase(null);
      server.close(() => resolve());
    }),
  };
}

async function openApp(browser, devices, viewport, origin, role) {
  const context = await browser.newContext({
    userAgent: devices['iPhone 14 Pro Max'].userAgent,
    viewport,
    screen: viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(`${origin}/vacation-app.html?session=${sessions[role].token}`, { waitUntil: 'domcontentloaded' });
  const frame = await (await page.waitForSelector('.site-pane iframe', { timeout: 60000 })).contentFrame();
  await frame.waitForSelector('[data-ts-timeline-title]', { timeout: 60000 });
  return { context, page, frame };
}

async function openDetailFromItinerary(page, frame, name) {
  const target = frame.locator('[data-ts-timeline-title]', { hasText: name }).first();
  await target.scrollIntoViewIfNeeded();
  await target.tap();
  await frame.waitForSelector('[data-ts-detail-title-wrap="1"]', { timeout: 30000 });
  await frame.waitForFunction(() => !/Checking edit access/.test(document.body.textContent || ''), null, { timeout: 30000 });
  await page.waitForTimeout(300);
  return frame.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, text: (el.textContent || '').trim() } : null;
    };
    return {
      pencil: box(document.querySelector('[data-ts-detail-edit="1"]')),
      price: box(document.querySelector('[data-ts-detail-field="price"]')),
      stars: box(document.querySelector('[data-ts-detail-header-stars="1"]')),
    };
  });
}

async function listRowPrice(page, frame, tab, priceSelector) {
  await frame.tap(`[data-ts-tab="${tab}"]`);
  await page.waitForTimeout(500);
  return frame.evaluate(({ selector }) => {
    const li = document.querySelector('li[data-list-row="1"]');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, text: (el.textContent || '').trim() };
    };
    const name = li?.querySelector('[data-ts-list-row-name="1"] strong') || li?.querySelector('[data-ts-list-row-name="1"]');
    const price = selector
      ? li?.querySelector(selector)
      : [...(li?.querySelectorAll('[data-ts-list-row-name="1"] span') || [])].find((el) => el.children.length === 0 && /^\$\d/.test((el.textContent || '').trim()));
    return { name: box(name), price: box(price), desc: (li?.querySelector('[data-ts-list-desc="1"]')?.textContent || '').trim() };
  }, { selector: priceSelector });
}

const { webkit, devices } = loadPlaywright();
const server = await startServer();
const browser = await webkit.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const tag = String(viewport.width);
    const owner = await openApp(browser, devices, viewport, server.origin, 'owner');
    const ownerDetail = await openDetailFromItinerary(owner.page, owner.frame, 'Carbone');
    assert.ok(ownerDetail.pencil, `${tag}: owner signed in by session link sees the pencil ${JSON.stringify(ownerDetail)}`);
    assert.equal(ownerDetail.price?.text, 'Price: $48', `${tag}: detail price label`);
    assert.ok(ownerDetail.stars, `${tag}: detail stars visible`);
    const priceMid = (ownerDetail.price.top + ownerDetail.price.bottom) / 2;
    const starsMid = (ownerDetail.stars.top + ownerDetail.stars.bottom) / 2;
    assert.ok(Math.abs(priceMid - starsMid) <= 4, `${tag}: price shares the rating line ${JSON.stringify(ownerDetail)}`);
    assert.ok(ownerDetail.price.left >= ownerDetail.stars.right, `${tag}: price sits after the stars`);
    await owner.frame.tap('[data-ts-detail-close="1"]');
    await owner.page.waitForTimeout(300);

    const flight = await listRowPrice(owner.page, owner.frame, 'flights', '[data-ts-flight-price="1"]');
    const car = await listRowPrice(owner.page, owner.frame, 'cars', '');
    assert.ok(flight.desc, `${tag}: flight summary shown`);
    assert.doesNotMatch(flight.desc, /\b\d{1,2}:\d{2}\b/, `${tag}: flight summary repeats no clock times`);
    assert.doesNotMatch(flight.desc, /\bcovers\b/i, `${tag}: flight summary drops the covers template`);
    assert.ok(flight.price && /^\$\d/.test(flight.price.text), `${tag}: flight price shown ${JSON.stringify(flight)}`);
    assert.ok(car.price, `${tag}: car price shown ${JSON.stringify(car)}`);
    assert.ok(Math.abs(flight.price.right - car.price.right) <= 2, `${tag}: flight price right edge matches car ${JSON.stringify({ flight, car })}`);
    const flightPriceMid = (flight.price.top + flight.price.bottom) / 2;
    assert.ok(flightPriceMid >= flight.name.top - 2 && flightPriceMid <= flight.name.bottom + 2, `${tag}: flight price vertically aligned with the name ${JSON.stringify(flight)}`);
    assert.ok(flight.price.left >= flight.name.right, `${tag}: flight price right of the name ${JSON.stringify(flight)}`);
    await owner.context.close();

    const viewer = await openApp(browser, devices, viewport, server.origin, 'viewer');
    const viewerDetail = await openDetailFromItinerary(viewer.page, viewer.frame, 'Carbone');
    assert.equal(viewerDetail.pencil, null, `${tag}: viewer must not see the pencil`);
    assert.equal(viewerDetail.price?.text, 'Price: $48', `${tag}: viewer detail price label`);
    await viewer.context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('test_issue_959_owner_pencil_webkit: ok');
