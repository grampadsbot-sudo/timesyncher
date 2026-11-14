#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const snapshot = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
let shared = structuredClone(snapshot);
let savedFields = null;
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
      if (pathname === `/api/shared/${shareToken}` || pathname === `/api/shared/${shareToken}/`) return json(res, 200, shared);
      if (pathname === `/api/shared/${shareToken}/thing-fields` && req.method === 'PUT') {
        let body = '';
        for await (const chunk of req) body += chunk;
        savedFields = JSON.parse(body).fields;
        shared.thingOverrides = structuredClone(savedFields);
        return json(res, 200, { ok: true });
      }
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
      : li?.querySelector('[data-ts-list-price="1"]')
        || [...(li?.querySelectorAll('[data-ts-list-row-name="1"] span') || [])].find((el) => el.children.length === 0 && /^\$\d/.test((el.textContent || '').trim()));
    return { name: box(name), price: box(price), desc: (li?.querySelector('[data-ts-list-desc="1"]')?.textContent || '').trim() };
  }, { selector: priceSelector });
}

function resetDetail(sparse = false, noTimeline = false) {
  shared = structuredClone(snapshot);
  savedFields = null;
  const place = shared.places.find(row => row.name === 'Carbone');
  const key = `place:${place.id}`;
  const prior = shared.thingOverrides[key];
  const day = shared.days[1];
  shared.thingOverrides[key] = sparse ? { category: prior.category, price: prior.price, logoUrl: prior.logoUrl, timeline: false, dayIds: [], missingFields: ['story', 'happyHourDetails', 'hours', 'reviews', 'summary', 'description'] } : {
    ...prior, story: snapshot.thingOverrides[key].summary, includeInTripRecap: true, nextTime: false,
    timeline: !noTimeline, dayIds: [day.id], perDaySchedule: { [day.id]: { visits: [
      { startTime: '18:30:00', duration: '90', status: 'reservation' },
      { startTime: '19:00:00', duration: '60', status: 'booked' },
    ] } },
  };
  return { key, place };
}

async function checkDetailGeometry(frame) {
  return frame.evaluate(() => {
    const body = document.querySelector('[data-ts-detail-v3]');
    const rect = body.getBoundingClientRect();
    const overflow = [...body.querySelectorAll('input,textarea,select,[data-ts-detail-visit]')].filter(el => {
      const box = el.getBoundingClientRect();
      return box.left < rect.left - 1 || box.right > rect.right + 1 || (el.matches('[data-ts-detail-visit]') && el.scrollWidth > el.clientWidth + 1);
    }).map(el => el.getAttribute('aria-label') || el.textContent);
    const sections = [...body.querySelectorAll('h3')].map(el => el.textContent.toUpperCase());
    const gold = [...document.querySelectorAll('[data-ts-detail-header-stars] .ts-star-full path,[data-ts-review-stars] .ts-star-full path')].every(el => getComputedStyle(el).fill === 'rgb(245, 158, 11)');
    const visits = [...body.querySelectorAll('[data-ts-detail-visit]')].map(el => ({ text: el.textContent, nowrap: getComputedStyle(el).whiteSpace === 'nowrap', fits: el.scrollWidth <= el.clientWidth + 1 }));
    return { overflow, sections, gold, visits };
  });
}

async function openDetailFromList(frame, tab = 'restaurants', name = 'Carbone') {
  await frame.tap(`[data-ts-tab="${tab}"]`);
  await frame.locator('[data-ts-list-row-name="1"]', { hasText: name }).first().tap();
  await frame.waitForSelector('[data-ts-detail-v3]', { state: 'attached' });
}

async function captureDetail(context, origin, width, state) {
  if (!process.env.CAPTURE_DIR) return;
  await mkdir(process.env.CAPTURE_DIR, { recursive: true });
  const page = await context.newPage();
  await page.goto(`${origin}/shared/${shareToken}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-ts-tab="restaurants"]');
  await openDetailFromList(page);
  if (state.startsWith('edit-')) await page.tap('[data-ts-detail-edit="1"]');
  const height = await page.locator('[data-ts-detail-v3]').evaluate(el => Math.ceil(el.parentElement.getBoundingClientRect().height) + 32);
  await page.setViewportSize({ width, height: Math.max(height, 844) });
  await page.waitForTimeout(100);
  if (state.startsWith('edit-') && await page.locator('[data-ts-detail-edit="1"]').isVisible()) await page.tap('[data-ts-detail-edit="1"]');
  assert.equal(await page.locator('[data-ts-detail-v3]').getAttribute('data-ts-detail-mode'), state.startsWith('edit-') ? 'edit' : 'view');
  assert.ok(await page.locator('[data-ts-detail-v3]').evaluate(el => el.parentElement.getBoundingClientRect().bottom <= window.innerHeight));
  await page.screenshot({ path: path.join(process.env.CAPTURE_DIR, `${state}-${width}.png`) });
  await page.close();
}

async function waitForSaved(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate(savedFields) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(predicate(savedFields), 'field update reached the memory server');
}

async function checkV3(browser, devices, viewport, server) {
  const { key } = resetDetail();
  const owner = await openApp(browser, devices, viewport, server.origin, 'owner');
  await openDetailFromList(owner.frame);
  const frame = owner.frame;
  const body = frame.locator('[data-ts-detail-v3]');
  const view = await checkDetailGeometry(frame);
  assert.deepEqual(view.sections.slice(0, 4), ['TIMELINE', 'STORY', 'SUMMARY', 'REVIEWS']);
  assert.deepEqual(view.overflow, []);
  assert.ok(view.gold);
  assert.equal(view.visits.length, 2);
  assert.ok(view.visits.every(row => row.nowrap && row.fits));
  assert.match(view.visits[0].text, /^Day 2 · Start: 6:30 PM · 90 min · Status: Reservation$/);
  assert.match(view.visits[1].text, /7:00 PM · 60 min · Status: Booked$/);
  assert.equal(await body.locator('[data-ts-detail-flag="includeInTripRecap"] input:checked').count(), 1);
  assert.equal(await body.locator('[data-ts-detail-flag="nextTime"]').count(), 0);
  assert.equal(await body.locator('[data-ts-detail-reviews] input,[data-ts-detail-reviews] textarea').count(), 0);
  assert.doesNotMatch(await body.locator('[data-ts-detail-reviews]').innerText(), /^(?:Google|Yelp|via)\s|out of 5|\d\.\d/m);
  await captureDetail(owner.context, server.origin, viewport.width, 'view-populated');
  await frame.tap('[data-ts-detail-edit="1"]');
  await captureDetail(owner.context, server.origin, viewport.width, 'edit-populated');
  assert.equal(await frame.locator('[data-ts-detail-save="1"]').innerText(), '✓');
  assert.equal(await body.getByLabel('Happy Hour', { exact: true }).count(), 1);
  assert.equal(await body.locator('[data-ts-detail-reviews] input,[data-ts-detail-reviews] textarea').count(), 0);
  assert.equal(await body.locator('select[aria-label$=" Status"]').count(), 2);
  await body.getByLabel('Include this story in the final keepsake', { exact: true }).uncheck();
  await body.getByLabel('Add to Next Time list', { exact: true }).check();
  await body.getByLabel('Happy Hour', { exact: true }).fill('Saved happy hour note');
  await body.getByLabel('Visit 2 Status').selectOption('confirmed');
  await body.getByRole('button', { name: '+ Add visit', exact: true }).tap();
  await body.getByLabel('Visit 3 Start').fill('20:15:00');
  await body.getByLabel('Visit 3 Duration').fill('30');
  await body.getByLabel('Visit 3 Day').selectOption(String(shared.days[3].id));
  const edit = await checkDetailGeometry(frame);
  assert.deepEqual(edit.overflow, []);
  await frame.tap('[data-ts-detail-save="1"]');
  await waitForSaved(fields => fields?.[key]?.nextTime === true && fields[key].perDaySchedule?.[String(shared.days[3].id)]?.visits?.length === 1);
  assert.equal(savedFields[key].includeInTripRecap, false);
  assert.equal(savedFields[key].nextTime, true);
  assert.equal(savedFields[key].perDaySchedule[String(shared.days[1].id)].visits[1].status, 'confirmed');
  assert.equal(await body.locator('[data-ts-detail-visit]').count(), 3);
  assert.match(await body.locator('[data-ts-detail-field="happyHourDetails"]').first().innerText(), /Saved happy hour note/);
  await owner.page.reload({ waitUntil: 'domcontentloaded' });
  const reloadedFrame = await (await owner.page.waitForSelector('.site-pane iframe')).contentFrame();
  await reloadedFrame.waitForSelector('[data-ts-timeline-title]');
  await openDetailFromList(reloadedFrame);
  assert.equal(await reloadedFrame.locator('[data-ts-detail-visit]').count(), 3);
  assert.equal(await reloadedFrame.locator('[data-ts-detail-flag="nextTime"] input:checked').count(), 1);
  await reloadedFrame.tap('[data-ts-detail-edit="1"]');
  for (const index of [3, 2, 1]) await reloadedFrame.getByLabel(`Remove visit ${index}`, { exact: true }).tap();
  await reloadedFrame.tap('[data-ts-detail-save="1"]');
  assert.equal(await reloadedFrame.locator('[data-ts-detail-timeline]').count(), 0);
  await waitForSaved(fields => fields?.[key]?.timeline === false && fields[key].dayIds.length === 0);
  console.log(`issue969 ${viewport.width}: visits and independent flags persisted`);
  await reloadedFrame.tap('[data-ts-detail-close="1"]');
  const mediaPlace = shared.places.find(row => row.id === 604);
  await openDetailFromList(reloadedFrame, 'events', mediaPlace.name);
  assert.ok(await reloadedFrame.locator('[data-ts-detail-photos] video').count());
  assert.ok(await reloadedFrame.locator('[data-ts-detail-photos] img').count());
  await owner.context.close();

  resetDetail(false, true);
  const unscheduled = await openApp(browser, devices, viewport, server.origin, 'owner');
  await openDetailFromList(unscheduled.frame);
  assert.equal(await unscheduled.frame.locator('[data-ts-detail-timeline]').count(), 0);
  assert.equal(await unscheduled.frame.locator('[data-ts-detail-v3] h3').first().innerText(), 'STORY');
  await captureDetail(unscheduled.context, server.origin, viewport.width, 'view-no-timeline');
  await unscheduled.context.close();

  resetDetail(true);
  const sparse = await openApp(browser, devices, viewport, server.origin, 'owner');
  await openDetailFromList(sparse.frame);
  assert.ok(await sparse.frame.locator('[data-ts-detail-name="1"]').isVisible());
  const sparseBody = sparse.frame.locator('[data-ts-detail-v3]');
  for (const field of ['story', 'happyHourDetails', 'hours']) assert.equal(await sparseBody.locator(`[data-ts-detail-field="${field}"]`).count(), 0);
  await captureDetail(sparse.context, server.origin, viewport.width, 'view-sparse');
  await sparse.frame.tap('[data-ts-detail-edit="1"]');
  await captureDetail(sparse.context, server.origin, viewport.width, 'edit-sparse');
  for (const field of ['Story', 'Happy Hour', 'Hours', 'Summary', 'Details', 'Phone', 'Website', 'Area', 'Latitude', 'Longitude']) assert.equal(await sparseBody.getByLabel(field, { exact: true }).count(), 1);
  const content = snapshot.thingOverrides[key];
  await sparseBody.getByLabel('Story', { exact: true }).fill(content.summary);
  await sparseBody.getByLabel('Happy Hour', { exact: true }).fill('Saved happy hour note');
  await sparseBody.getByLabel('Hours', { exact: true }).fill('Saved opening hours note');
  await sparse.frame.tap('[data-ts-detail-save="1"]');
  for (const field of ['story', 'happyHourDetails', 'hours']) assert.equal(await sparseBody.locator(`[data-ts-detail-field="${field}"]`).count(), 1);
  await sparse.frame.tap('[data-ts-detail-edit="1"]');
  for (const field of ['Story', 'Happy Hour', 'Hours']) await sparseBody.getByLabel(field, { exact: true }).fill('');
  await sparse.frame.tap('[data-ts-detail-save="1"]');
  for (const field of ['story', 'happyHourDetails', 'hours']) assert.equal(await sparseBody.locator(`[data-ts-detail-field="${field}"]`).count(), 0);
  await waitForSaved(fields => fields?.[key]?.story === '' && fields[key].happyHourDetails === '');
  assert.equal(savedFields[key].story, '');
  assert.equal(savedFields[key].happyHourDetails, '');
  const sparseGeometry = await checkDetailGeometry(sparse.frame);
  assert.deepEqual(sparseGeometry.overflow, []);
  await sparse.context.close();
  console.log(`issue969 ${viewport.width}: sparse fill and clear verified`);
  return { width: viewport.width, view, edit, sparse: { fillClear: true, geometry: sparseGeometry }, persisted: true, independentFlags: true, noTimelineHidden: true };
}

const { webkit, devices } = loadPlaywright();
const server = await startServer();
const browser = await webkit.launch({ headless: true });
const acceptance = [];
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
    acceptance.push(await checkV3(browser, devices, viewport, server));
    shared = structuredClone(snapshot);
  }
} finally {
  await browser.close();
  await server.close();
}

if (process.env.ACCEPTANCE_DIR) {
  await mkdir(process.env.ACCEPTANCE_DIR, { recursive: true });
  await writeFile(path.join(process.env.ACCEPTANCE_DIR, '969.json'), JSON.stringify({ issue: 969, accept: 'success', engine: 'iPhone WebKit touch', source: 'local snapshot copy, memory server only', checks: acceptance }, null, 2));
}

console.log('test_issue_959_owner_pencil_webkit: ok');
