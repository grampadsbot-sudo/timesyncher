#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureDir = path.join(os.homedir(), 'tsv-dispatch/acceptance/fixtures/demo-nyc-99-snapshot-20261110');
if (process.env.CI && !existsSync(path.join(fixtureDir, 'SOURCE.json'))) {
  console.log('test_acceptance_995_day_dropdown: SKIP in CI (host-only fixture demo-nyc-99-snapshot-20261110 absent; host accept runs it)');
  process.exit(0);
}
const source = JSON.parse(await readFile(path.join(fixtureDir, 'SOURCE.json'), 'utf8'));
const shareToken = source.shared_token;
const currentTripId = source.current_trip_id;
const ownerId = 'acceptance-owner-995';
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
  throw new Error('playwright required for acceptance 995');
}

const { webkit, devices } = loadPlaywright();
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 430, height: 932 }];

let shared = structuredClone(JSON.parse(await readFile(path.join(fixtureDir, 'shared-trip.json'), 'utf8')));
const ownerRows = JSON.parse(await readFile(path.join(fixtureDir, 'owner-trips-live.json'), 'utf8'));

const maxDay = Math.max(...shared.days.map((d) => Number(d.day_number) || 0));
for (let n = maxDay + 1; n <= 12; n += 1) {
  shared.days.push({
    id: 9_900_000 + n,
    trip_id: shared.trip?.id ?? 99,
    day_number: n,
    date: `2026-07-${String(n).padStart(2, '0')}`,
    notes: '',
    title: '',
  });
}
const carboneKey = 'place:610';
const day1 = shared.days.find((d) => d.day_number === 1) || shared.days[0];
const day10 = shared.days.find((d) => d.day_number === 10);
assert.ok(day1 && day10, 'fixture needs Day 1 and Day 10');
shared.thingOverrides[carboneKey] = {
  ...(shared.thingOverrides[carboneKey] || {}),
  timeline: true,
  dayIds: [day1.id],
  perDaySchedule: {
    [String(day1.id)]: {
      visits: [{ startTime: '18:30:00', duration: '90', status: 'reservation' }],
    },
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function inside(base, rel) {
  const full = path.resolve(base, `.${rel}`);
  return full.startsWith(base + path.sep) ? full : null;
}

function tripSummary(row, origin) {
  const m = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const slug = m.sharedToken || m.shareToken || m.publicSlug || m.source_token || m.slug || shareToken;
  return {
    id: row.id,
    title: row.title || '',
    shortName: String(m.shortName ?? m.short_name ?? '').trim().slice(0, 120),
    destination: row.destination || '',
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    status: row.status || 'planning',
    current: Boolean(row.current),
    publicUrl: `${origin}/shared/${slug}/`,
    shareToken: slug,
  };
}

async function startServer() {
  const ownerAccess = await import('../src/vacation/vacation-app-owner-web-access.mjs').catch(() => ({}));
  const { createWebAccessMemoryDb } = await import('./lib/web-access-memory-db.mjs');
  const memory = createWebAccessMemoryDb({
    customers: [{ id: ownerId, email: 'owner@acceptance.invalid' }],
    trips: [{
      id: currentTripId,
      customer_id: ownerId,
      title: 'Craig / Kim NYC June 2026',
      metadata: { publicSlug: shareToken, sharedToken: shareToken },
    }],
  });
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
        const headers = {};
        if (typeof ownerAccess.vacationAppOwnerWebAccessCookie === 'function') {
          const session = { token: 'accept-session', customer_id: ownerId, email: 'owner@acceptance.invalid', display_name: 'Owner' };
          const cookie = await ownerAccess.vacationAppOwnerWebAccessCookie(memory.db, req, { session, tripId: currentTripId, env });
          if (cookie) headers['set-cookie'] = cookie;
        }
        return json(res, 200, {
          ok: true,
          session: { token: 'accept-session', status: 'active', customerName: 'Owner', email: 'owner@acceptance.invalid', currentTripId, seat: null },
          eula: { accepted: true, text: 'Terms' },
          vacations: ownerRows.map((row) => tripSummary(row, origin)),
          turns: [{ id: 'turn-welcome', speaker: 'assistant', direction: 'outbound', authorLabel: 'TimeSyncher', body: 'Welcome back.' }],
          itinerary: [],
        }, headers);
      }
      if (pathname === `/api/shared/${shareToken}` || pathname === `/api/shared/${shareToken}/`) return json(res, 200, shared);
      if (pathname === `/api/shared/${shareToken}/edit-access`) return json(res, 200, { canEdit: true });
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
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: origin,
    TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'acceptance-995-salt',
    NODE_ENV: 'development',
  };
  return {
    origin,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function measureDaySelects(frame) {
  return frame.evaluate(() => {
    const detail = document.querySelector('[data-ts-detail-v3]');
    if (!detail) return { error: 'detail missing' };
    const rect = detail.getBoundingClientRect();
    const selects = [...detail.querySelectorAll('select[aria-label*=" Day"]')];
    const overflow = [...detail.querySelectorAll('input,textarea,select')].filter((el) => {
      const box = el.getBoundingClientRect();
      return box.left < rect.left - 1 || box.right > rect.right + 1;
    }).map((el) => el.getAttribute('aria-label') || el.tagName);
    return {
      selects: selects.map((sel) => ({
        label: sel.getAttribute('aria-label'),
        selectedText: sel.options[sel.selectedIndex]?.textContent?.trim(),
        scrollWidth: sel.scrollWidth,
        clientWidth: sel.clientWidth,
        height: sel.getBoundingClientRect().height,
        fits: sel.scrollWidth <= sel.clientWidth + 1,
      })),
      overflow,
    };
  });
}

async function exerciseViewport(browser, server, viewport) {
  const context = await browser.newContext({
    ...devices['iPhone 14 Pro Max'],
    viewport,
    screen: viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const entry = `${server.origin}/vacation-app.html?session=accept-session&tripId=${encodeURIComponent(currentTripId)}`;
  await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#splitter', { timeout: 60000 });
  const frame = await (await page.waitForSelector('.site-pane iframe', { timeout: 60000 })).contentFrame();
  assert.ok(frame, 'iframe required');
  await frame.waitForSelector('[data-ts-tab="restaurants"]', { timeout: 60000 });
  await frame.tap('[data-ts-tab="restaurants"]');
  await frame.locator('[data-ts-list-row-name="1"]', { hasText: 'Carbone' }).first().tap();
  await frame.waitForSelector('[data-ts-detail-v3]', { timeout: 30000 });
  await frame.tap('[data-ts-detail-edit="1"]');
  await frame.waitForSelector('[data-ts-detail-mode="edit"]', { timeout: 30000 });
  const body = frame.locator('[data-ts-detail-v3]');
  await body.getByLabel('Visit 1 Day').selectOption(String(day1.id));
  let metrics = await measureDaySelects(frame);
  assert.equal(metrics.overflow.length, 0, `${viewport.width}: horizontal overflow ${JSON.stringify(metrics.overflow)}`);
  assert.ok(metrics.selects.length >= 1, `${viewport.width}: visit day select required`);
  for (const row of metrics.selects) {
    assert.ok(row.fits, `${viewport.width}: clipped ${row.label} selected=${row.selectedText} sw=${row.scrollWidth} cw=${row.clientWidth}`);
    assert.ok(row.height >= 44, `${viewport.width}: touch height ${row.label} h=${row.height}`);
    assert.match(row.selectedText || '', /^Day 1\b/, `${viewport.width}: Day 1 label`);
  }
  await body.getByLabel('Visit 1 Day').selectOption(String(day10.id));
  metrics = await measureDaySelects(frame);
  const daySel = metrics.selects.find((row) => row.label === 'Visit 1 Day');
  assert.ok(daySel?.fits, `${viewport.width}: Day 10+ clip sw=${daySel?.scrollWidth} cw=${daySel?.clientWidth}`);
  assert.match(daySel?.selectedText || '', /^Day 10\b/, `${viewport.width}: Day 10 label`);
  assert.equal(metrics.overflow.length, 0, `${viewport.width}: overflow after Day 10`);
  await context.close();
}

const server = await startServer();
const browser = await webkit.launch({ headless: true });
try {
  for (const viewport of VIEWPORTS) {
    await exerciseViewport(browser, server, viewport);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('acceptance 995 day dropdown OK');