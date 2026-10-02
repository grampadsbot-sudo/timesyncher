import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { createAdminOnboarding } from '../routes/admin-onboardings.mjs';
import { ensureOnboardingOpener } from '../routes/vacation-itinerary.mjs';
import { joinCollaboratorAppSession } from '../src/vacation/collaborator-app-seat.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import {
  assignTripSiteUrl,
  buildOnboardingFromCoupon,
  buildOnboardingFromStripe,
} from '../src/vacation/onboarding.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { sharedTripWebsiteUrl } from '../src/vacation/web-access.mjs';

const tripId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const customerId = '11111111-2222-4333-8444-555555555555';
const entitlementId = '22222222-3333-4444-8555-666666666666';
const orderId = '33333333-4444-4555-8666-777777777777';
const sessionId = '44444444-5555-4666-8777-888888888888';
const storeDir = mkdtempSync(path.join(tmpdir(), 'trip-site-url-'));
const env = {
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation-staging.timesyncher.com/',
  TIMESYNCHER_ONBOARDING_STORE: storeDir,
  TIMESYNCHER_EULA_VERSION: 'test-eula',
  TIMESYNCHER_CHECKOUT_CURRENCY: 'usd',
  TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
};
const savedEnv = {};
const envKeys = [
  'TIMESYNCHER_SITE_BASE_URL',
  'TIMESYNCHER_TRAVEL_BASE_URL',
  'TIMESYNCHER_ONBOARDING_STORE',
  'TIMESYNCHER_EULA_VERSION',
  'TIMESYNCHER_COLLABORATOR_NAME',
  'BLOB_READ_WRITE_TOKEN',
  'VERCEL_BLOB_STORE_ID',
  'TIMESYNCHER_EULA_STORE',
];
for (const key of envKeys) savedEnv[key] = process.env[key];
process.env.TIMESYNCHER_SITE_BASE_URL = env.TIMESYNCHER_SITE_BASE_URL;
process.env.TIMESYNCHER_TRAVEL_BASE_URL = env.TIMESYNCHER_TRAVEL_BASE_URL;
process.env.TIMESYNCHER_ONBOARDING_STORE = storeDir;
process.env.TIMESYNCHER_EULA_VERSION = env.TIMESYNCHER_EULA_VERSION;
process.env.TIMESYNCHER_COLLABORATOR_NAME = env.TIMESYNCHER_COLLABORATOR_NAME;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;
delete process.env.TIMESYNCHER_EULA_STORE;

const templates = JSON.parse(await readFile(new URL('../content/onboarding-welcome.json', import.meta.url), 'utf8'));

const originalFetch = globalThis.fetch;
let fetches = 0;
globalThis.fetch = async () => {
  fetches += 1;
  throw new Error('network disabled');
};

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function mockDb({ existing = null, trip = tripId, tripMeta = {} } = {}) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = sqlText(strings);
    calls.push({ text, values });
    if (/update trips/i.test(text)) {
      if (values.some((value) => value && value.publicSlug)) return [{ public_slug: values.find((v) => v?.publicSlug)?.publicSlug }];
      return [];
    }
    if (/select metadata->>'publicSlug'/i.test(text)) {
      return [{ public_slug: tripMeta.publicSlug || '' }];
    }
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
      }];
    }
    if (/insert into vacation_collaborators/i.test(text)) return [];
    if (/update vacation_collaborator_invites/i.test(text)) return [];
    if (/insert into transcript_turns/i.test(text)) return [];
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected sql: ${text.slice(0, 220)}`);
  };
  tag.calls = calls;
  return tag;
}

function assertNoPurchaseSlug(calls) {
  assert.equal(calls.some((call) => /update trips/i.test(call.text) && call.values.some((v) => v?.publicSlug)), false);
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
  assertNoPurchaseSlug(adminDb.calls);
  assert.equal(purchase.publicSlug, '');
  assert.equal(purchase.publicUrl, '');
  assert.equal(fetches, 0);

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
  assertNoPurchaseSlug(paidDb.calls);
  assert.equal(paid.tripId, null);
  assert.equal(paid.publicUrl, '');
  assert.equal(paid.publicSlug, '');
  assert.equal(paidDb.calls.some((call) => /insert into trips/i.test(call.text)), false);

  const couponDb = mockDb();
  const coupon = await buildOnboardingFromCoupon({
    db: couponDb,
    contact: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lee' },
    plan: 'single',
    amountCents: 3700,
    metadata: { source: 'coupon_checkout' },
    env,
  });
  assertNoPurchaseSlug(couponDb.calls);
  assert.equal(coupon.tripId, null);
  assert.equal(coupon.publicSlug, '');
  assert.equal(couponDb.calls.some((call) => /insert into trips/i.test(call.text)), false);

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
  assertNoPurchaseSlug(collabDb.calls);

  const publicSlug = intakeShareSlug(tripId);
  const siteDb = mockDb({ tripMeta: { publicSlug } });
  const site = await assignTripSiteUrl(siteDb, tripId, env);
  assert.equal(site.publicSlug, publicSlug);
  assert.match(site.publicUrl, new RegExp(`/shared/${publicSlug}/$`));
  assert.equal(siteDb.calls.filter((call) => /update trips/i.test(call.text)).length, 1);

  const failCalls = [];
  const failDb = async (strings, ...values) => {
    const text = sqlText(strings);
    failCalls.push({ text, values });
    if (/update trips/i.test(text)) return [];
    if (/select metadata->>'publicSlug'/i.test(text)) return [{ public_slug: 'other-slug' }];
    throw new Error(`unexpected fail sql: ${text}`);
  };
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => { logs.push(args); };
  let siteError;
  try {
    await assignTripSiteUrl(failDb, tripId, env);
  } catch (error) {
    siteError = error;
  } finally {
    console.log = originalLog;
  }
  assert.equal(siteError?.code, 'onboarding_trip_site_url_failed');
  assert.equal(siteError?.reason, 'onboarding trip site url not stored');
  assert.equal(siteError?.tripId, tripId);
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0][0]), { reason: siteError.reason, tripId });

  const ownerNoSite = renderOnboardingWelcome({ audience: 'owner_no_site', firstName: 'Ada' });
  assert.doesNotMatch(ownerNoSite, /https?:\/\//);
  assert.doesNotMatch(templates.owner_no_site, /\{tripSiteUrl\}/);
  assert.doesNotMatch(templates.collaborator_no_site, /\{tripSiteUrl\}/);

  const collabNoSite = renderOnboardingWelcome({
    audience: 'collaborator_no_site',
    collabFirstName: 'Sam',
    ownerFirstName: 'Ada',
    tripTitle: 'Beach week',
  });
  assert.doesNotMatch(collabNoSite, /https?:\/\//);

  const tripSiteUrl = sharedTripWebsiteUrl(publicSlug, env);
  const ownerWithSite = renderOnboardingWelcome({ audience: 'owner', firstName: 'Ada', tripSiteUrl });
  assert.match(ownerWithSite, new RegExp(tripSiteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const mockWelcomeDb = async (strings, ...values) => {
    const text = sqlText(strings);
    if (/insert into vacation_onboarding_welcomes/i.test(text)) return [{ id: 'welcome-claim-1' }];
    if (/from customers/i.test(text)) return [{ first_name: 'Ada', display_name: 'Ada' }];
    if (/insert into transcript_turns/i.test(text)) return [{ id: 'turn-1' }];
    throw new Error(`unexpected welcome sql: ${text}`);
  };

  await ensureOnboardingOpener(mockWelcomeDb, {
    id: 'purchase-session-1',
    customer_id: customerId,
    first_name: 'Ada',
    display_name: 'Ada',
  }, {
    id: tripId,
    title: 'Trip',
    publicUrl: '',
    shareToken: '',
  }, {});

  const itinerarySource = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
  assert.match(itinerarySource, /assignTripSiteUrl\(db, tripId, process\.env\)/);
  assert.doesNotMatch(itinerarySource, /publicSlug: slug, intakeShare: true/);
  const onboardingSource = await readFile(new URL('../src/vacation/onboarding.mjs', import.meta.url), 'utf8');
  assert.equal(onboardingSource.match(/assignTripSiteUrl\(/g).length, 1);
  assert.doesNotMatch(onboardingSource, /buildOnboardingFromCoupon[\s\S]*assignTripSiteUrl/);
  assert.doesNotMatch(onboardingSource, /buildOnboardingFromStripe[\s\S]*assignTripSiteUrl/);

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
