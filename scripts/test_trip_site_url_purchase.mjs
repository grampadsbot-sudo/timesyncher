import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { createAdminOnboarding } from '../routes/admin-onboardings.mjs';
import { ensureOnboardingOpener } from '../routes/vacation-itinerary.mjs';
import { sendJson } from '../src/vacation/http.mjs';
import { welcomeFailureBody } from '../src/vacation/welcome-failure.mjs';
import { joinCollaboratorAppSession } from '../src/vacation/collaborator-app-seat.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import {
  assignTripSiteUrl,
  buildOnboardingFromCoupon,
  buildOnboardingFromStripe,
} from '../src/vacation/onboarding.mjs';
import { publicTripUrl, sharedTripWebsiteUrl } from '../src/vacation/web-access.mjs';

const tripId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const customerId = '11111111-2222-4333-8444-555555555555';
const entitlementId = '22222222-3333-4444-8555-666666666666';
const orderId = '33333333-4444-4555-8666-777777777777';
const sessionId = '44444444-5555-4666-8777-888888888888';
const storeDir = mkdtempSync(path.join(tmpdir(), 'trip-site-url-'));
const env = {
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
  TIMESYNCHER_ONBOARDING_STORE: storeDir,
  TIMESYNCHER_EULA_VERSION: 'test-eula',
};
const savedEnv = {};
const envKeys = [
  'TIMESYNCHER_SITE_BASE_URL',
  'TIMESYNCHER_ONBOARDING_STORE',
  'TIMESYNCHER_EULA_VERSION',
  'BLOB_READ_WRITE_TOKEN',
  'VERCEL_BLOB_STORE_ID',
  'TIMESYNCHER_EULA_STORE',
];
for (const key of envKeys) savedEnv[key] = process.env[key];
process.env.TIMESYNCHER_SITE_BASE_URL = env.TIMESYNCHER_SITE_BASE_URL;
process.env.TIMESYNCHER_ONBOARDING_STORE = storeDir;
process.env.TIMESYNCHER_EULA_VERSION = env.TIMESYNCHER_EULA_VERSION;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;
delete process.env.TIMESYNCHER_EULA_STORE;

const originalFetch = globalThis.fetch;
let fetches = 0;
globalThis.fetch = async () => {
  fetches += 1;
  throw new Error('network disabled');
};

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function sitePayload(calls) {
  const update = calls.find((call) => /update trips/i.test(call.text) && call.values.some((value) => value && value.publicSlug));
  assert.ok(update, 'purchase persisted a trip site slug');
  return update.values.find((value) => value && value.publicSlug);
}

function mockDb({ existing = null, trip = tripId } = {}) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = sqlText(strings);
    calls.push({ text, values });
    if (/update trips/i.test(text)) return [];
    if (/join onboarding_sessions/i.test(text)) return existing ? [existing] : [];
    if (/insert into customers/i.test(text)) return [{ id: customerId }];
    if (/insert into trips/i.test(text)) return [{ id: trip }];
    if (/insert into entitlements/i.test(text)) return [{ id: entitlementId }];
    if (/select id from paid_orders/i.test(text)) return [];
    if (/insert into paid_orders/i.test(text)) return [{ id: orderId }];
    if (/from onboarding_sessions/i.test(text)) return [];
    if (/insert into onboarding_sessions/i.test(text)) {
      const token = values.find((value) => typeof value === 'string' && /^[A-Za-z0-9_-]{16,}$/.test(value) && !value.startsWith('http'));
      return [{
        id: sessionId,
        token,
        customer_id: customerId,
        trip_id: trip,
        status: 'purchase_confirmed',
        current_step: 'post_purchase',
        telegram_deep_link: values.find((value) => typeof value === 'string' && value.startsWith('https://t.me/')) || '',
      }];
    }
    if (/insert into vacation_collaborators/i.test(text)) return [];
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected sql: ${text.slice(0, 220)}`);
  };
  tag.calls = calls;
  return tag;
}

function assertStoredSite(calls, id) {
  const payload = sitePayload(calls);
  const publicSlug = intakeShareSlug(id);
  assert.equal(payload.publicSlug, publicSlug);
  assert.equal(payload.intakeShare, true);
  const publicUrl = sharedTripWebsiteUrl(publicSlug, env);
  assert.equal(publicTripUrl({ metadata: payload }, env), publicUrl);
  assert.match(publicUrl, new RegExp(`/shared/${publicSlug}/$`));
  return { publicSlug, publicUrl };
}

try {
  const adminDb = mockDb();
  const purchase = await createAdminOnboarding(adminDb, {
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lee',
    plan: 'single',
    sendEmail: false,
  });
  const stored = assertStoredSite(adminDb.calls, tripId);
  assert.equal(purchase.publicSlug, stored.publicSlug);
  assert.equal(purchase.publicUrl, stored.publicUrl);
  assert.equal(fetches, 0);
  const assignAt = adminDb.calls.findIndex((call) => /update trips/i.test(call.text));
  assert.ok(assignAt > adminDb.calls.findIndex((call) => /insert into trips/i.test(call.text)));
  assert.ok(purchase.publicUrl);

  const paidDb = mockDb();
  const paid = await buildOnboardingFromStripe({
    db: paidDb,
    stripe: {},
    paymentIntent: {
      id: 'pi_test_create',
      status: 'succeeded',
      amount_received: 3700,
      currency: 'usd',
      metadata: {
        email: 'ada@example.com',
        first_name: 'Ada',
        last_name: 'Lee',
        plan: 'single',
      },
    },
    env,
  });
  const paidSite = assertStoredSite(paidDb.calls, tripId);
  assert.equal(paid.publicUrl, paidSite.publicUrl);

  const retryTripId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  const retryDb = mockDb({
    trip: retryTripId,
    existing: {
      customer_id: customerId,
      trip_id: retryTripId,
      entitlement_id: entitlementId,
      order_id: orderId,
      contact: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lee' },
      amount_cents: 3700,
      currency: 'usd',
      plan: 'single',
      id: sessionId,
      token: 'existing-session-token-value',
      telegram_deep_link: 'https://t.me/TimeSyncherVacationBot?start=existing-session-token-value',
    },
  });
  const retry = await buildOnboardingFromStripe({
    db: retryDb,
    stripe: {},
    paymentIntent: { id: 'pi_test_retry', status: 'succeeded' },
    env,
  });
  const retrySite = assertStoredSite(retryDb.calls, retryTripId);
  assert.equal(retry.publicUrl, retrySite.publicUrl);
  assert.equal(retryDb.calls.some((call) => /insert into trips/i.test(call.text)), false);

  const couponDb = mockDb();
  const coupon = await buildOnboardingFromCoupon({
    db: couponDb,
    contact: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lee' },
    plan: 'single',
    amountCents: 3700,
    env,
  });
  const couponSite = assertStoredSite(couponDb.calls, tripId);
  assert.equal(coupon.publicUrl, couponSite.publicUrl);

  const collabDb = mockDb();
  await joinCollaboratorAppSession(collabDb, {
    invite: {
      id: '55555555-6666-4777-8888-999999999999',
      owner_customer_id: customerId,
      trip_id: tripId,
      plan_code: 'telegram_collaborators_single_trip',
      scope: 'single_trip',
      requested_for: 'Sam Lee',
      metadata: { email: 'sam@example.com', displayName: 'Sam Lee' },
    },
    contact: { email: 'sam@example.com', firstName: 'Sam', lastName: 'Lee', displayName: 'Sam Lee' },
    env,
  });
  assertStoredSite(collabDb.calls, tripId);

  const blankDb = mockDb();
  const blank = await assignTripSiteUrl(blankDb, 'not-a-trip', env);
  assert.deepEqual(blank, { publicSlug: '', publicUrl: '' });
  assert.equal(blankDb.calls.length, 0);

  const onboardingSource = await readFile(new URL('../src/vacation/onboarding.mjs', import.meta.url), 'utf8');
  const couponSource = await readFile(new URL('../src/vacation/checkout-coupons.mjs', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../routes/admin-onboardings.mjs', import.meta.url), 'utf8');
  const seatSource = await readFile(new URL('../src/vacation/collaborator-app-seat.mjs', import.meta.url), 'utf8');
  const collaboratorSource = await readFile(new URL('../src/vacation/collaborators.mjs', import.meta.url), 'utf8');
  const welcomeSource = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
  assert.equal(onboardingSource.match(/assignTripSiteUrl\(/g).length, 4);
  assert.equal(onboardingSource.match(/intakeShareSlug\(/g).length, 1);
  assert.doesNotMatch(couponSource, /intakeShareSlug/);
  assert.match(couponSource, /assignTripSiteUrl/);
  assert.match(adminSource, /assignTripSiteUrl/);
  assert.doesNotMatch(adminSource, /produceOnboardingOpener|ensureOnboardingOpener/);
  assert.match(seatSource, /assignTripSiteUrl/);
  assert.match(collaboratorSource, /assignTripSiteUrl/);
  const welcomeInputs = welcomeSource.slice(
    welcomeSource.indexOf('async function welcomeInputs'),
    welcomeSource.indexOf('function ensureOnboardingOpener'),
  );
  assert.match(welcomeInputs, /trip\?\.publicUrl/);
  assert.doesNotMatch(welcomeInputs, /assignTripSiteUrl|intakeShareSlug|sharedTripWebsiteUrl/);

  const appPage = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
  assert.match(appPage, /data\.code, data\.reason/);
  assert.match(appPage, /role="alert"/);
  const handlerCatch = welcomeSource.slice(welcomeSource.lastIndexOf('} catch (error)'));
  assert.match(handlerCatch, /welcomeFailureBody\(error\)/);

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => { logs.push(args); };
  try {
    await assert.rejects(
      () => ensureOnboardingOpener(mockDb(), {
        customer_id: customerId,
        token: 'session-token-value',
        email: 'ada@example.com',
        first_name: 'Ada',
        display_name: 'Ada',
      }, {
        id: tripId,
        publicUrl: '',
        title: 'Trip',
      }),
      (error) => {
        assert.equal(error.message, 'onboarding welcome missing tripSiteUrl');
        assert.equal(error.statusCode, 502);
        assert.equal(error.code, 'onboarding_welcome_failed');
        const res = {
          statusCode: 0,
          headers: {},
          body: '',
          setHeader(name, value) { this.headers[name] = value; },
          getHeader(name) { return this.headers[name]; },
          end(payload) { this.body = payload; },
        };
        const welcome = welcomeFailureBody(error);
        sendJson(res, error.statusCode || 400, welcome);
        const payload = JSON.parse(res.body);
        assert.equal(res.statusCode, 502);
        assert.equal(payload.ok, false);
        assert.equal(payload.code, 'onboarding_welcome_failed');
        assert.equal(payload.reason, 'onboarding welcome missing tripSiteUrl');
        assert.equal(logs.length, 1);
        assert.equal(logs[0].length, 1);
        const logged = JSON.parse(logs[0][0]);
        assert.deepEqual(logged, { reason: 'onboarding welcome missing tripSiteUrl', tripId });
        assert.deepEqual(Object.keys(logged), ['reason', 'tripId']);
        assert.equal(logs[0][0].includes('ada@example.com'), false);
        assert.equal(logs[0][0].includes('Ada'), false);
        assert.equal(logs[0][0].includes('session-token-value'), false);
        assert.equal(logs[0][0].includes('http'), false);
        return true;
      },
    );
  } finally {
    console.log = originalLog;
  }
  assert.equal(fetches, 0);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  rmSync(storeDir, { recursive: true, force: true });
}

console.log('trip site url purchase passed');
