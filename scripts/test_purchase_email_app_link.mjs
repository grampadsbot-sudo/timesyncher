import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/[...route].mjs';
import { useOnboardingLookup } from '../routes/eula.mjs';
import { useVacationAppDatabase } from '../routes/vacation-itinerary.mjs';
import { intakeSharedResponse, useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';
import { buildOnboardingFromCoupon } from '../src/vacation/onboarding.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const storeDir = await mkdtemp(path.join(tmpdir(), 'purchase-app-link-'));
const site = 'https://vacation-staging.timesyncher.com';
const saved = {};
for (const key of ['TIMESYNCHER_SITE_BASE_URL', 'TIMESYNCHER_ONBOARDING_STORE', 'TIMESYNCHER_EULA_VERSION', 'BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_STORE_ID', 'TIMESYNCHER_EULA_STORE', 'RESEND_API_KEY', 'TIMESYNCHER_CHECKOUT_CURRENCY']) {
  saved[key] = process.env[key];
}
process.env.TIMESYNCHER_CHECKOUT_CURRENCY = 'usd';
process.env.TIMESYNCHER_SITE_BASE_URL = site;
process.env.TIMESYNCHER_ONBOARDING_STORE = storeDir;
process.env.TIMESYNCHER_EULA_VERSION = 'test-eula';
process.env.RESEND_API_KEY = 'test-key';
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;
delete process.env.TIMESYNCHER_EULA_STORE;

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

const state = {
  customerId: '11111111-2222-4333-8444-555555555555',
  tripId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  entitlementId: '22222222-3333-4444-8555-666666666666',
  orderId: '33333333-4444-4555-8666-777777777777',
  sessionId: '44444444-5555-4666-8777-888888888888',
  trip: null,
  session: null,
  contact: null,
  turns: [],
};

function db(strings, ...values) {
  const text = sqlText(strings);
  if (/insert into customers/i.test(text)) {
    state.contact = {
      email: values[0],
      first_name: values[2],
      last_name: values[3],
      display_name: values[4],
    };
    return [{ id: state.customerId }];
  }
  if (/insert into trips/i.test(text)) {
    state.trip = {
      id: state.tripId,
      customer_id: values[0],
      title: values[1],
      start_date: values[2] || null,
      destination: null,
      end_date: null,
      status: 'onboarding',
      metadata: values.find((value) => value && value.couponCheckout) || {},
    };
    return [{ id: state.tripId }];
  }
  if (/update trips/i.test(text)) {
    const patch = values.find((value) => value && typeof value === 'object' && !Array.isArray(value));
    if (patch && state.trip) state.trip.metadata = { ...(state.trip.metadata || {}), ...patch };
    if (/returning metadata/i.test(text)) return [{ public_slug: state.trip?.metadata?.publicSlug || null }];
    return [];
  }
  if (/insert into entitlements/i.test(text)) return [{ id: state.entitlementId }];
  if (/insert into paid_orders/i.test(text)) return [{ id: state.orderId }];
  if (/from onboarding_sessions/i.test(text) && /where order_id/i.test(text) && !/customers/i.test(text)) return [];
  if (/insert into onboarding_sessions/i.test(text)) {
    const token = values.find((value) => typeof value === 'string' && /^[A-Za-z0-9_-]{24}$/.test(value));
    state.session = {
      id: state.sessionId,
      token,
      customer_id: state.customerId,
      trip_id: state.tripId,
      order_id: state.orderId,
      status: 'purchase_confirmed',
      current_step: 'post_purchase',
      metadata: values.find((value) => value && typeof value === 'object') || {},
    };
    return [{ ...state.session }];
  }
  if (/from outbound_emails/i.test(text)) return [];
  if (/insert into outbound_emails/i.test(text) || /update outbound_emails/i.test(text)) return [{ id: 'email-1' }];
  if (/update onboarding_sessions/i.test(text)) return [];
  if (/metadata->>'publicSlug'/i.test(text)) {
    const slug = values[0];
    const meta = state.trip?.metadata || {};
    if (meta.publicSlug === slug && String(meta.intakeShare) === 'true') return [{ ...state.trip }];
    return [];
  }
  if (/count\(\*\)::int as n from trip_things/i.test(text)) return [{ n: 0 }];
  if (/from trip_things/i.test(text)) return [];
  if (/from onboarding_sessions/i.test(text) && /customers/i.test(text)) {
    return [{
      ...state.session,
      email: state.contact?.email,
      first_name: state.contact?.first_name,
      last_name: state.contact?.last_name,
      display_name: state.contact?.display_name,
      plan: 'single',
      amount_cents: 0,
      currency: 'usd',
    }];
  }
  if (/select metadata from trips/i.test(text)) return [{ metadata: state.trip?.metadata || {} }];
  if (/from vacation_collaborators/i.test(text)) return [];
  if (/from trips/i.test(text)) {
    if (/public_slug/i.test(text)) return [{ public_slug: state.trip?.metadata?.publicSlug || '' }];
    return state.trip ? [{ ...state.trip, current: true }] : [];
  }
  if (/select 1\s+from transcript_turns/i.test(text)) return state.turns.length ? [1] : [];
  if (/insert into transcript_turns/i.test(text)) {
    const body = [...values].reverse().find((value) => typeof value === 'string' && value.length > 20);
    const payload = values.find((value) => value && typeof value === 'object' && value.liveTranscript);
    state.turns.push({
      speaker: 'app',
      body: body || '',
      channel: 'vacation-app',
      payload: payload || {},
      direction: 'outbound',
      sent_at: new Date().toISOString(),
    });
    return [];
  }
  if (/from transcript_turns/i.test(text)) return state.turns.map((turn) => ({ ...turn }));
  throw new Error(`unexpected sql: ${text}`);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) {
    return { ok: true, status: 200, json: async () => ({ id: 'resend-1' }) };
  }
  return originalFetch(url, init);
};

function contentType(file) {
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function dumpDom(url) {
  return new Promise((resolve, reject) => {
    const profile = path.join(storeDir, `chrome-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const child = spawn('google-chrome', [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--password-store=basic',
      '--host-resolver-rules=EXCLUDE 127.0.0.1, EXCLUDE localhost, MAP * ~NOTFOUND',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=10000',
      '--timeout=12000',
      '--dump-dom',
      url,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: '', HOME: profile },
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`chrome timed out for ${url}\n${err.slice(0, 400)}\n${out.slice(0, 400)}`));
    }, 20000);
    let out = '';
    let err = '';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      if (error) reject(error);
      else resolve(out);
    };
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('</html>')) finish();
    });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('exit', (code) => {
      if (out.includes('</html>')) finish();
      else finish(new Error(`chrome ${code}: ${err.slice(0, 500)}\n${out.slice(0, 500)}`));
    });
  });
}

useVacationAppDatabase(db);
useOnboardingLookup(db);
useSharedTripDatabase(db);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      await handler(req, res);
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\//, '');
    const filePath = path.join(root, rel);
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader('content-type', contentType(filePath));
    res.end(body);
  } catch (error) {
    if (!res.headersSent && !res.writableEnded) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end(error.message || 'not found');
    }
  }
});

try {
  const onboarding = await buildOnboardingFromCoupon({
    db,
    contact: { email: 'ada.zero@example.com', firstName: 'Ada', lastName: 'Zero' },
    plan: 'single',
    amountCents: 0,
    metadata: { couponCheckout: true },
    env: process.env,
  });
  assert.equal(onboarding.contact.firstName, 'Ada');
  assert.equal(state.trip.destination, null);
  assert.equal(state.trip.start_date, null);
  const sent = await queueOrSendPurchaseEmail(db, onboarding, process.env);
  assert.equal(sent.status, 'sent');
  const launchUrl = new URL(onboarding.vacationAppUrl);
  assert.equal(launchUrl.origin + launchUrl.pathname, `${site}/vacation-app.html`);
  assert.equal(launchUrl.searchParams.get('session'), onboarding.token);
  assert.equal(launchUrl.href.includes('/shared/intake-'), false);
  assert.equal(onboarding.publicSlug.startsWith('intake-'), true);

  const migrated = await intakeSharedResponse(onboarding.publicSlug, db);
  assert.equal(Boolean(migrated?.trip), true);
  assert.equal(migrated.error, undefined);
  assert.deepEqual(migrated.places, []);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const appPath = `/vacation-app.html?session=${encodeURIComponent(onboarding.token)}`;

  const page = await fetch(`${origin}${appPath}`);
  const pageHtml = await page.text();
  assert.equal(page.status, 200);
  assert.match(pageHtml, /id="eulaScreen"/);
  const gateAt = pageHtml.indexOf('state.eula?.accepted !== true');
  const renderEulaAt = pageHtml.indexOf('renderEula();', gateAt);
  const renderAppAt = pageHtml.indexOf('renderApp();', renderEulaAt);
  assert.ok(gateAt > 0 && renderEulaAt > gateAt && renderAppAt > renderEulaAt);

  const before = await fetch(`${origin}/api/vacation-itinerary?app=1&session=${encodeURIComponent(onboarding.token)}`);
  const beforeBody = await before.json();
  assert.equal(before.status, 200, JSON.stringify(beforeBody));
  assert.equal(beforeBody.eula.accepted, false);

  const visible = (html) => html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const terms = visible(await dumpDom(`${origin}${appPath}`));
  assert.match(terms, /id="eulaScreen"/);
  assert.doesNotMatch(terms, /id="workspace"/);
  assert.equal(terms.includes('/shared/intake-'), false);

  const accept = await fetch(`${origin}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${onboarding.token}`)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acceptedByName: 'Ada Zero', checkboxConfirmed: true }),
  });
  const acceptBody = await accept.json();
  assert.equal(accept.status, 201, JSON.stringify(acceptBody));

  const after = await fetch(`${origin}/api/vacation-itinerary?app=1&session=${encodeURIComponent(onboarding.token)}`);
  const afterBody = await after.json();
  assert.equal(after.status, 200, JSON.stringify(afterBody));
  assert.equal(afterBody.eula.accepted, true);
  assert.equal(afterBody.vacations.length, 1);
  assert.equal(afterBody.vacations[0].destination, '');
  assert.equal(afterBody.vacations[0].startDate, null);

  const chat = visible(await dumpDom(`${origin}${appPath}`));
  assert.match(chat, /class="workspace chat-only"/);
  assert.match(chat, /id="messageText"/);
  assert.doesNotMatch(chat, /id="eulaScreen"/);
  assert.equal(chat.includes('/shared/intake-'), false);
  assert.doesNotMatch(chat, /<iframe/i);

  const order = visible(await dumpDom(`${origin}/order-success.html?session=${encodeURIComponent(onboarding.token)}`));
  assert.match(order, /Check your email and click the link in that email/);
  assert.match(order, new RegExp(`id="openApp"[^>]*href="/vacation-app.html\\?session=${onboarding.token}"`));
  assert.equal(order.includes('/shared/intake-'), false);

  const orderSource = await readFile(path.join(root, 'order-success.html'), 'utf8');
  assert.match(orderSource, /Check your email and click the link in that email/);
  assert.match(orderSource, /\/vacation-app\.html\?session=/);
  assert.doesNotMatch(orderSource, /href="\/shared\//);
} finally {
  useVacationAppDatabase(null);
  useOnboardingLookup(null);
  useSharedTripDatabase(null);
  globalThis.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
  await rm(storeDir, { recursive: true, force: true });
}

console.log('purchase email app link passed');
