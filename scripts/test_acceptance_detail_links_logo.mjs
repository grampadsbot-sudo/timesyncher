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
const flights = JSON.parse(await readFile(path.join(root, 'scripts/fixtures/acceptance-994-copy-trip.json'), 'utf8'));
const flight = structuredClone(flights.places.find(row => row.id === 99630));
shared.places.push(flight);
shared.categories.push(...flights.categories.filter(cat => !shared.categories.some(row => row.id === cat.id)));
shared.thingOverrides['place:99630'] = structuredClone(flights.thingOverrides['place:99630'] || {});
const southwestUrl = 'https://www.southwest.com/air/booking/select.html?originationAirportCode=LAS&destinationAirportCode=LGA&departureDate=2026-06-23&returnDate=2026-06-30&adultPassengersCount=2';
shared.thingOverrides['place:99630'].website = southwestUrl;
shared.thingOverrides['place:99630'].url = southwestUrl;
shared.thingOverrides['place:99610'] = { ...shared.thingOverrides['place:99610'], logoUrl: '', iconUrl: '' };

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


async function openThing(frame, tab, name) {
  await frame.click('[data-ts-tab="' + tab + '"]');
  await frame.waitForFunction((wanted) => [...document.querySelectorAll('[data-ts-list-row-name="1"]')].some(el => el.textContent.includes(wanted)), { timeout: 30000 }, name);
  await frame.evaluate(wanted => [...document.querySelectorAll('[data-ts-list-row-name="1"]')].find(el => el.textContent.includes(wanted)).click(), name);
  await frame.waitForSelector('[data-ts-detail-v3]', { timeout: 30000 });
}

const bundle = await readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.ok(!bundle.includes('String(ha(Dt).logoUrl||ha(Dt).iconUrl||Dt.logoUrl||"").trim()?n.jsx'), 'logo chip is never dropped');
assert.ok(bundle.includes('children:[n.jsx("span",{"data-ts-detail-logo-chip":"1",style:{display:"inline-flex",flexShrink:0,lineHeight:0},children:n.jsx(dc,{item:Dt,size:34})}),'), 'chip always renders dc (logo, favicon, type icon fallback)');
const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    console.log('open viewport', viewport.width);
    await page.goto(server.origin + '/vacation-app.html?session=accept-session&tripId=' + encodeURIComponent(currentTripId), { waitUntil: 'networkidle0', timeout: 60000 });
    console.log('shell loaded');
    const frame = await (await page.waitForSelector('.site-pane iframe', { timeout: 60000 })).contentFrame();
    await frame.waitForSelector('[data-ts-tab="restaurants"]', { timeout: 60000 });
    console.log('frame ready');
    await openThing(frame, 'restaurants', 'Carbone');
    console.log('Carbone open');
    const missingLogo = await frame.evaluate(() => {
      const panel = document.querySelector('[data-ts-detail-overlay]');
      return {
        chips: panel.querySelectorAll('[data-ts-detail-logo-chip]').length,
        chipFilled: (() => { const c = panel.querySelector('[data-ts-detail-logo-chip]'); const r = c && c.getBoundingClientRect(); return Boolean(c && c.firstElementChild && r.width >= 30 && r.height >= 30); })(),
        name: panel.querySelector('[data-ts-detail-name]').textContent.trim(),
        edit: Boolean(panel.querySelector('[data-ts-detail-edit]')),
        close: Boolean(panel.querySelector('[data-ts-detail-close]')),
      };
    });
    assert.equal(missingLogo.name, 'Carbone');
    assert.ok(missingLogo.edit && missingLogo.close, 'existing detail controls stay present');
    assert.equal(missingLogo.chips, 1, 'logo chip never dropped');
    assert.ok(missingLogo.chipFilled, 'chip shows favicon or type icon, never empty');
    if (process.env.REVIEW_SHOTS) await page.screenshot({ path: process.env.REVIEW_SHOTS + '/detail-carbone-' + viewport.width + '.png' });
    await frame.click('[data-ts-detail-close]');
    console.log('opening flight');
    await openThing(frame, 'flights', 'Southwest LAS');
    const link = await frame.evaluate(() => {
      const a = document.querySelector('[data-ts-detail-info-box="website"]');
      const panel = document.querySelector('[data-ts-detail-overlay]');
      const r = a.getBoundingClientRect();
      return {
        href: a.href, title: a.title, text: a.textContent.trim(),
        scrollWidth: a.scrollWidth, clientWidth: a.clientWidth,
        wbr: a.querySelectorAll('wbr').length,
        wordBreak: getComputedStyle(a).wordBreak, overflowWrap: getComputedStyle(a).overflowWrap,
        fits: r.left >= 0 && r.right <= window.innerWidth,
        header: panel.querySelector('[data-ts-detail-name]').textContent.trim(),
        chips: panel.querySelectorAll('[data-ts-detail-logo-chip]').length,
      };
    });
    assert.equal(link.href, southwestUrl, 'full URL destination stays unchanged');
    {
      assert.equal(link.title, southwestUrl, 'full URL remains available on hover');
      assert.equal(link.text, 'Website: ' + southwestUrl, 'full URL stays the shown text');
      assert.ok(link.wbr > 0 && link.wordBreak === 'normal' && link.overflowWrap === 'normal', 'breaks only at URL delimiters, no mid-word breaks');
      assert.equal(link.chips, 1, 'flight keeps its logo chip');
      assert.ok(link.fits && link.scrollWidth <= link.clientWidth + 1, 'link fits at phone width');
    }
    assert.match(link.header, /Southwest LAS → LGA/);
    if (process.env.REVIEW_SHOTS) await page.screenshot({ path: process.env.REVIEW_SHOTS + '/detail-southwest-' + viewport.width + '.png' });
    console.log(JSON.stringify({ width: viewport.width, missingLogo, link }));
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log('detail URL and missing-logo copy-trip acceptance OK');
