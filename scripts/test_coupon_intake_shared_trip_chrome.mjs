import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { buildOnboardingFromCoupon } from '../src/vacation/onboarding.mjs';
import { createVacationFromChatMessage } from '../src/vacation/vacation-from-chat-intake.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { intakeSharedResponse, useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import {
  attachIntakeItineraryFromReply,
  publishTripIntakeShare,
  writeIntakeItineraryFromChat,
} from '../routes/vacation-itinerary.mjs';
import { testPlanEnv } from './fixtures/reply-plan-test-fixtures.mjs';
import { thingsFromIntake } from '../src/vacation/trip-intake-classify.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const bundlePath = path.join(root, 'public/assets/index-BKun7ofk.js');
const cssPath = path.join(root, 'public/assets/index-CbEHlMj6.css');

const TRIP_TITLE = 'Harbor Ridge Week';
const PLACE_NAME = 'Aurora Tea House';
const DESTINATION = 'Neutral Bay';
const CUSTOMER_MESSAGE = `We are planning ${TRIP_TITLE} in ${DESTINATION} from October 7 to October 9, 2026. Ada wants dinner at ${PLACE_NAME} on October 7.`;
const TRIP_ID = '01234567-89ab-4cde-8f01-23456789abcd';
const CUSTOMER_ID = '11111111-2222-4333-8444-555555555555';

const storeDir = await mkdtemp(path.join(tmpdir(), 'coupon-intake-chrome-'));
const savedEnv = {};
const fixtureEnv = {
  ...testPlanEnv,
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
  TIMESYNCHER_ONBOARDING_STORE: storeDir,
  TIMESYNCHER_EULA_VERSION: 'test-eula',
  OPENROUTER_API_KEY: 'test-key',
  TIMESYNCHER_CHECKOUT_CURRENCY: 'usd',
  TIMESYNCHER_BASE_PRICE_CENTS: '3700',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
  TIMESYNCHER_SINGLE_NAME: 'Single vacation',
  TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
  TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
};
for (const key of Object.keys(fixtureEnv).concat(['BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_STORE_ID', 'TIMESYNCHER_EULA_STORE'])) {
  savedEnv[key] = process.env[key];
}
Object.assign(process.env, fixtureEnv);
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;
delete process.env.TIMESYNCHER_EULA_STORE;

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

const state = {
  tripCount: 0,
  trips: [],
  tripThings: [],
  session: null,
  customerId: CUSTOMER_ID,
};

function db(strings, ...values) {
  const text = sqlText(strings);
  if (/insert into customers/i.test(text)) return [{ id: state.customerId }];
  if (/insert into trips/i.test(text)) {
    state.tripCount += 1;
    const row = {
      id: TRIP_ID,
      title: TRIP_TITLE,
      destination: DESTINATION,
      start_date: '2026-10-07',
      end_date: '2026-10-09',
      metadata: {},
    };
    state.trips.push(row);
    return [{ id: TRIP_ID }];
  }
  if (/update trips/i.test(text)) {
    const trip = state.trips.find((t) => t.id === TRIP_ID) || state.trips[0];
    if (!trip) return [];
    trip.metadata = trip.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
    for (const v of values) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        trip.metadata = { ...trip.metadata, ...v };
      }
    }
    if (values.includes(TRIP_TITLE)) trip.title = TRIP_TITLE;
    if (values.includes(DESTINATION)) trip.destination = DESTINATION;
    if (values.includes('2026-10-07')) trip.start_date = '2026-10-07';
    if (values.includes('2026-10-09')) trip.end_date = '2026-10-09';
    if (/returning metadata/i.test(text)) {
      if (!trip.metadata.publicSlug) trip.metadata.publicSlug = intakeShareSlug(TRIP_ID);
      if (!trip.metadata.intakeShare) trip.metadata.intakeShare = true;
      return [{ public_slug: trip.metadata.publicSlug }];
    }
    return [];
  }
  if (/insert into entitlements/i.test(text)) return [{ id: 'ent-1' }];
  if (/insert into paid_orders/i.test(text)) return [{ id: 'order-1' }];
  if (/from onboarding_sessions/i.test(text) && /where order_id/i.test(text)) return [];
  if (/insert into onboarding_sessions/i.test(text)) {
    state.session = {
      id: 'session-1',
      token: 'coupon-intake-token',
      customer_id: state.customerId,
      trip_id: null,
      order_id: 'order-1',
      first_name: 'Buyer',
      last_name: 'Example',
      display_name: 'Buyer Example',
    };
    return [{ ...state.session }];
  }
  if (/update onboarding_sessions/i.test(text) && /trip_id/i.test(text)) {
    if (state.session) state.session.trip_id = TRIP_ID;
    return [];
  }
  if (/from trips/i.test(text) && /publicSlug/i.test(text)) {
    const slug = values.find((v) => typeof v === 'string' && v.startsWith('intake-'));
    const trip = state.trips.find((t) => {
      if (t.metadata?.intakeShare !== true) return false;
      const stored = String(t.metadata?.publicSlug || intakeShareSlug(t.id));
      return stored === slug;
    });
    return trip ? [trip] : [];
  }
  if (/from trips/i.test(text) && /where id/i.test(text)) {
    const id = values.find((v) => v === TRIP_ID);
    const trip = state.trips.find((t) => t.id === id);
    return trip ? [trip] : [];
  }
  if (/insert into trip_things/i.test(text)) {
    state.tripThings.push({
      id: `thing-${state.tripThings.length + 1}`,
      trip_id: TRIP_ID,
      category: 'restaurant',
      title: PLACE_NAME,
      description: '',
      metadata: {
        who: 'Ada',
        whenLabel: 'October 7',
        customerWhen: 'October 7',
        source: 'chat_extraction',
      },
      ratings: {},
      location: {},
      source: 'customer',
    });
    return [];
  }
  if (/from trip_things/i.test(text)) {
    if (/count\(\*\)/i.test(text)) return [{ n: state.tripThings.length }];
    return state.tripThings.map((row) => ({ ...row }));
  }
  if (/preCollaboratorSnapshot/i.test(text)) return [];
  if (/insert into outbound_emails/i.test(text)) return [{ id: 'email-1' }];
  if (/^\s*select\b/i.test(text)) return [];
  throw new Error(`unexpected sql: ${text.slice(0, 240)}`);
}

function loadVacationAppTrips() {
  return state.trips.map((trip) => ({
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    startDate: trip.start_date,
    endDate: trip.end_date,
    status: 'planning',
    current: true,
    publicUrl: trip.metadata?.publicSlug ? `https://example/shared/${trip.metadata.publicSlug}/` : '',
    shareToken: trip.metadata?.shareToken || '',
    intakeShare: trip.metadata?.intakeShare === true,
  }));
}

function intakeFetchMock({ title, things, destination, hasDates, intake = true }) {
  return async (url, init) => {
    const href = String(url);
    if (href.includes('app-config') || href.includes('/auth/app-config')) {
      throw new Error(`unexpected app-config: ${href}`);
    }
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (href.includes('/decisions')) {
      const questions = body?.questions || body?.input?.questions || {};
      if (questions.trip_intake) {
        return {
          ok: true,
          json: async () => ({
            answers: { trip_intake: { noul: intake === false ? 0.1 : 0.92 } },
          }),
        };
      }
      return { ok: true, json: async () => ({ ok: true, answers: {} }) };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ things, roster: [], destination, hasDates, title }),
          },
        }],
      }),
    };
  };
}

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
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

async function startServer({ html, js, css, slug, tripPayload }) {
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
    if (pathname.startsWith('/src/')) {
      try {
        const file = await readFile(path.join(root, pathname));
        return sendText(res, 200, file, 'text/javascript; charset=utf-8');
      } catch {
        return sendJson(res, 404, { error: 'not found' });
      }
    }
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/shared/')) {
      if (pathname.includes('app-config')) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, { ok: true, notices: [], bindings: [], media: [] });
    }
    if (/^\/shared\/[^/]+\/?$/.test(pathname)) return sendText(res, 200, html, 'text/html; charset=utf-8');
    const sharedMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
    if (sharedMatch && req.method === 'GET') {
      const share = decodeURIComponent(sharedMatch[1]);
      if (share === slug) return sendJson(res, 200, tripPayload);
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

const originalFetch = globalThis.fetch;
let browser = null;
let app = null;

assert.equal(typeof attachIntakeItineraryFromReply, 'function');

try {
  const onboarding = await buildOnboardingFromCoupon({
    db,
    contact: { email: 'buyer@example.com', firstName: 'Buyer', lastName: 'Example' },
    plan: 'single',
    amountCents: 3700,
    metadata: { couponCheckout: true },
    env: process.env,
  });
  assert.equal(onboarding.tripId, null);
  assert.equal(state.tripCount, 0);

  const extracted = [{ name: PLACE_NAME, kind: 'restaurant', who: 'Ada', when: 'October 7' }];
  globalThis.fetch = intakeFetchMock({
    title: TRIP_TITLE,
    things: extracted,
    destination: DESTINATION,
    hasDates: true,
    intake: true,
  });
  const chatCreated = await createVacationFromChatMessage(
    db,
    state.session,
    { text: CUSTOMER_MESSAGE },
    async () => loadVacationAppTrips(),
    process.env,
  );
  assert.equal(chatCreated.ok, true);
  assert.equal(state.tripCount, 1);
  assert.equal(chatCreated.tripId, TRIP_ID);

  globalThis.fetch = intakeFetchMock({
    title: '',
    things: [],
    destination: '',
    hasDates: false,
    intake: false,
  });
  const hello = await createVacationFromChatMessage(
    db,
    { ...state.session, id: 'session-2', trip_id: null },
    { text: 'Hello there' },
    async () => loadVacationAppTrips(),
    process.env,
  );
  assert.equal(hello.ok, true);
  assert.equal(hello.action, 'queue_without_trip');

  await writeIntakeItineraryFromChat(
    db,
    TRIP_ID,
    CUSTOMER_MESSAGE,
    thingsFromIntake(extracted),
    {
      extractedDestination: DESTINATION,
      extractedTitle: TRIP_TITLE,
      searchImpl: async () => ({ ok: true }),
    },
  );
  assert.ok(state.tripThings.length >= 1);
  const tripRow = state.trips.find((t) => t.id === TRIP_ID);
  tripRow.title = TRIP_TITLE;
  tripRow.destination = DESTINATION;
  tripRow.start_date = '2026-10-07';
  tripRow.end_date = '2026-10-09';

  await publishTripIntakeShare(db, TRIP_ID);
  const trip = state.trips.find((t) => t.id === TRIP_ID);
  assert.equal(trip.metadata.intakeShare, true);
  const slug = trip.metadata.publicSlug || intakeShareSlug(TRIP_ID);
  assert.match(slug, /^intake-/);

  useSharedTripDatabase(db);
  const tripPayload = await intakeSharedResponse(slug, db);
  assert.equal(tripPayload.trip.title, TRIP_TITLE);
  assert.ok(tripPayload.places.some((p) => String(p.name).includes(PLACE_NAME)));
  assert.ok(Object.values(tripPayload.assignments).flat().length >= 1);

  const [html, js, css] = await Promise.all([
    readFile(path.join(root, 'shared-app.html'), 'utf8'),
    readFile(bundlePath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  app = await startServer({ html, js, css, slug, tripPayload });
  globalThis.fetch = originalFetch;
  const sharedRes = await fetch(`${app.origin}/api/shared/${slug}/`);
  assert.equal(sharedRes.status, 200);

  const puppeteer = loadPuppeteer();
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const consoleErrors = [];
  const pageErrors = [];
  const notFoundUrls = [];
  const blockedApi = [];

  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/auth/app-config') || url.includes('/auth/app-config')) {
      blockedApi.push(url);
      request.abort('blockedbyclient');
      return;
    }
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
    if (/ERR_BLOCKED_BY_CLIENT/i.test(text)) return;
    if (/fonts\.googleapis|leaflet|favicon/i.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    const text = String(error?.message || error);
    if (/Minified React error #299/.test(text)) return;
    pageErrors.push(text);
  });

  const nav = await page.goto(`${app.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(nav?.status(), 200);
  await page.waitForResponse((res) => res.url().includes('/api/shared/') && res.status() === 200, { timeout: 45000 });
  await page.waitForFunction(
    (title) => (document.body?.innerText || '').includes(title),
    { timeout: 45000 },
    TRIP_TITLE,
  );
  await page.waitForFunction(
    () => /\b\d+\s+days?\b/i.test(document.body?.innerText || '') || (document.body?.innerText || '').includes('Aurora'),
    { timeout: 45000 },
  );

  const blankRoot = await page.evaluate(() => {
    const root = document.getElementById('root') || document.getElementById('app');
    if (!root) return true;
    const text = (root.innerText || '').replace(/\s+/g, '').trim();
    const visible = root.querySelector('canvas,svg,img,iframe,[data-trip-view-root],[data-keepsake-admin-root],button,h1,h2');
    return !text && !visible;
  });
  assert.equal(blankRoot, false);
  assert.equal(blockedApi.length, 0);
  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')} (404: ${notFoundUrls.join(', ')})`);
  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);

  console.log('coupon intake shared trip chrome passed');
} finally {
  if (browser) await browser.close();
  if (app) await app.close();
  useSharedTripDatabase(null);
  globalThis.fetch = originalFetch;
  try {
    await rm(storeDir, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
