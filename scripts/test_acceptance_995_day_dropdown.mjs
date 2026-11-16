#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/acceptance-995-copy-trip.json'), 'utf8'));
const shareToken = fixture.shareToken;
const currentTripId = fixture.currentTripId;
const ownerId = 'acceptance-owner-995';
const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

const puppeteer = loadPuppeteer();
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 430, height: 932 }];

const shared = structuredClone(fixture.shared);
const ownerRows = fixture.ownerTrips;

const carboneKey = 'place:99610';
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
      title: 'Acceptance 995 Copy Trip',
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
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const entry = `${server.origin}/vacation-app.html?session=accept-session&tripId=${encodeURIComponent(currentTripId)}`;
  await page.goto(entry, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#splitter', { timeout: 60000 });
  const frame = await (await page.waitForSelector('.site-pane iframe', { timeout: 60000 })).contentFrame();
  assert.ok(frame, 'iframe required');
  await frame.waitForSelector('[data-ts-tab="restaurants"]', { timeout: 60000 });
  await frame.click('[data-ts-tab="restaurants"]');
  await frame.waitForFunction(
    () => [...document.querySelectorAll('[data-ts-list-row-name="1"]')].some((el) => /Carbone/.test(el.textContent || '')),
    { timeout: 60000 },
  );
  await frame.evaluate(() => {
    [...document.querySelectorAll('[data-ts-list-row-name="1"]')].find((el) => /Carbone/.test(el.textContent || '')).click();
  });
  await frame.waitForSelector('[data-ts-detail-v3]', { timeout: 30000 });
  await frame.waitForSelector('[data-ts-detail-edit="1"]', { timeout: 30000 });
  let editing = false;
  const isEditing = () => frame.evaluate(() => Boolean(document.querySelector('[data-ts-detail-mode="edit"]')));
  for (let attempt = 0; attempt < 4 && !editing; attempt += 1) {
    if (await isEditing()) {
      editing = true;
      break;
    }
    await frame.click('[data-ts-detail-edit="1"]');
    editing = await frame
      .waitForSelector('[data-ts-detail-mode="edit"]', { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!editing) {
    const state = await frame.evaluate(() => ({
      edit: document.querySelector('[data-ts-detail-edit="1"]')?.outerHTML?.slice(0, 300) || null,
      mode: document.querySelector('[data-ts-detail-mode]')?.getAttribute('data-ts-detail-mode') || null,
    }));
    assert.fail(`${viewport.width}: edit mode did not open ${JSON.stringify(state)}`);
  }
  const daySelect = '[data-ts-detail-v3] select[data-ts-detail-visit-day-select="1"]';
  const selectState = () => frame.evaluate(() => {
    const detail = document.querySelector('[data-ts-detail-v3]');
    const sel = detail?.querySelector('select[data-ts-detail-visit-day-select="1"]') || null;
    return {
      mode: detail?.getAttribute('data-ts-detail-mode') || null,
      visits: detail?.querySelectorAll('[data-ts-detail-visit]').length || 0,
      dayButtons: detail?.querySelectorAll('button[aria-label^="Day "]').length || 0,
      hasSelect: Boolean(sel),
      selected: sel?.options?.[sel.selectedIndex]?.textContent?.trim() || '',
    };
  }).catch((error) => ({ error: String(error?.message || error) }));
  async function openEdit() {
    await frame.evaluate(() => {
      const button = document.querySelector('[data-ts-detail-edit="1"]');
      if (button) button.click();
    });
    await frame.waitForSelector('[data-ts-detail-mode="edit"]', { timeout: 10000 });
  }
  async function chooseVisitDay(dayId) {
    let last = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!(await isEditing())) {
        await openEdit();
      }
      const handle = await frame.waitForSelector(daySelect, { timeout: 8000 }).catch(() => null);
      if (!handle) {
        last = await selectState();
        await frame.evaluate(() => {
          document.querySelector('[data-ts-detail-close="1"]')?.click();
        }).catch(() => {});
        await frame.waitForSelector('[data-ts-detail-v3]', { hidden: true, timeout: 5000 }).catch(() => {});
        await frame.evaluate(() => {
          [...document.querySelectorAll('[data-ts-list-row-name="1"]')].find((el) => /Carbone/.test(el.textContent || ''))?.click();
        });
        await frame.waitForSelector('[data-ts-detail-edit="1"]', { timeout: 15000 });
        await openEdit();
        continue;
      }
      try {
        await handle.select(String(dayId));
      } catch (error) {
        last = { selectError: String(error?.message || error), ...(await selectState()) };
        continue;
      }
      const shown = await frame.evaluate(() => {
        const sel = document.querySelector('[data-ts-detail-v3] select[data-ts-detail-visit-day-select="1"]');
        if (!sel) return '';
        return sel.options[sel.selectedIndex]?.textContent?.trim() || '';
      });
      if (shown) return shown;
      last = await selectState();
    }
    assert.fail(`${viewport.width}: day select missing after choosing ${dayId} ${JSON.stringify(last)}`);
  }
  await chooseVisitDay(day1.id);
  let metrics = await measureDaySelects(frame);
  assert.equal(metrics.overflow.length, 0, `${viewport.width}: horizontal overflow ${JSON.stringify(metrics.overflow)}`);
  assert.ok(metrics.selects.length >= 1, `${viewport.width}: visit day select required`);
  for (const row of metrics.selects) {
    assert.ok(row.fits, `${viewport.width}: clipped ${row.label} selected=${row.selectedText} sw=${row.scrollWidth} cw=${row.clientWidth}`);
    assert.ok(row.height >= 44, `${viewport.width}: touch height ${row.label} h=${row.height}`);
    assert.match(row.selectedText || '', /^Day 1\b/, `${viewport.width}: Day 1 label`);
  }
  if (process.env.REVIEW_SHOTS) {
    await page.screenshot({ path: `${process.env.REVIEW_SHOTS}/995-${viewport.width}-day1.png` });
  }
  await chooseVisitDay(day10.id);
  metrics = await measureDaySelects(frame);
  if (process.env.REVIEW_SHOTS) {
    await page.screenshot({ path: `${process.env.REVIEW_SHOTS}/995-${viewport.width}-day10.png` });
  }
  const daySel = metrics.selects.find((row) => row.label === 'Visit 1 Day');
  assert.ok(daySel?.fits, `${viewport.width}: Day 10+ clip sw=${daySel?.scrollWidth} cw=${daySel?.clientWidth}`);
  assert.match(daySel?.selectedText || '', /^Day 10\b/, `${viewport.width}: Day 10 label`);
  assert.equal(metrics.overflow.length, 0, `${viewport.width}: overflow after Day 10`);
  console.log(`acceptance 995 @${viewport.width}: ${JSON.stringify(daySel)}`);
  await context.close();
}

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  for (const viewport of VIEWPORTS) {
    await exerciseViewport(browser, server, viewport);
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('acceptance 995 day dropdown OK');
