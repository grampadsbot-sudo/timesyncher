import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import handler from '../api/[...route].mjs';
import { useOnboardingLookup } from '../routes/eula.mjs';
import { useVacationAppDatabase } from '../routes/vacation-itinerary.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { couponHash } from '../src/vacation/coupons.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const storeDir = await mkdtemp(path.join(tmpdir(), 'coupon-no-trip-'));
const couponCode = 'TS-NOTRIP-TEST';
const site = 'https://vacation-staging.timesyncher.com';

const fixtureEnv = {
  TIMESYNCHER_SITE_BASE_URL: site,
  TIMESYNCHER_ONBOARDING_STORE: storeDir,
  TIMESYNCHER_EULA_VERSION: 'test-eula',
  RESEND_API_KEY: 'test-key',
  TIMESYNCHER_CHECKOUT_CURRENCY: 'usd',
  TIMESYNCHER_BASE_PRICE_CENTS: '3700',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
  TIMESYNCHER_MEDIA_PRICE_CENTS: '1700',
  TIMESYNCHER_SINGLE_NAME: 'Single vacation',
  TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
  TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
  TIMESYNCHER_MEDIA_NAME: 'Photo memories',
  TIMESYNCHER_COUPON_HASH_SALT: 'coupon-no-trip-test',
};

const saved = {};
for (const key of Object.keys(fixtureEnv).concat(['BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_STORE_ID', 'TIMESYNCHER_EULA_STORE'])) {
  saved[key] = process.env[key];
}
Object.assign(process.env, fixtureEnv);
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;
delete process.env.TIMESYNCHER_EULA_STORE;

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

const state = {
  customerId: crypto.randomUUID(),
  tripCount: 0,
  entitlementId: crypto.randomUUID(),
  orderId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  session: null,
  outboundEmail: null,
  coupon: {
    id: crypto.randomUUID(),
    code_hash: couponHash(couponCode, fixtureEnv),
    metadata: { plan: 'single' },
    max_redemptions: 1,
    redemption_count: 0,
    status: 'active',
  },
  redemptionId: crypto.randomUUID(),
};

function db(strings, ...values) {
  const text = sqlText(strings);
  if (/from checkout_coupons/i.test(text) && /code_hash/i.test(text)) {
    return state.coupon.code_hash === values.find((v) => typeof v === 'string' && v.length === 64)
      ? [{ metadata: state.coupon.metadata }]
      : [];
  }
  if (/update checkout_coupons/i.test(text) && /redemption_count/i.test(text)) {
    state.coupon.redemption_count += 1;
    return [{
      id: state.coupon.id,
      code_hint: 'TS-...EST',
      label: 'test',
      max_redemptions: state.coupon.max_redemptions,
      redemption_count: state.coupon.redemption_count,
      status: state.coupon.status,
      expires_at: null,
      metadata: state.coupon.metadata,
    }];
  }
  if (/insert into checkout_coupon_redemptions/i.test(text)) {
    return [{ id: state.redemptionId, status: 'processing' }];
  }
  if (/insert into customers/i.test(text)) return [{ id: state.customerId }];
  if (/insert into trips/i.test(text)) {
    state.tripCount += 1;
    return [{ id: crypto.randomUUID() }];
  }
  if (/insert into entitlements/i.test(text)) return [{ id: state.entitlementId }];
  if (/insert into paid_orders/i.test(text)) return [{ id: state.orderId }];
  if (/from onboarding_sessions/i.test(text) && /where order_id/i.test(text) && !/customers/i.test(text)) return [];
  if (/insert into onboarding_sessions/i.test(text)) {
    const token = values.find((value) => typeof value === 'string' && /^[A-Za-z0-9_-]{16,}$/.test(value) && !value.includes('@'));
    state.session = {
      id: state.sessionId,
      token,
      customer_id: state.customerId,
      trip_id: null,
      order_id: state.orderId,
      status: 'purchase_confirmed',
      current_step: 'post_purchase',
      metadata: values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {},
    };
    return [{ ...state.session }];
  }
  if (/from outbound_emails/i.test(text)) return [];
  if (/insert into outbound_emails/i.test(text)) {
    state.outboundEmail = values;
    return [{ id: 'email-1' }];
  }
  if (/update outbound_emails/i.test(text)) return [{ id: 'email-1' }];
  if (/update checkout_coupon_redemptions/i.test(text)) return [{ id: state.redemptionId, status: 'redeemed' }];
  if (/update onboarding_sessions/i.test(text)) return [];
  if (/from onboarding_sessions/i.test(text) && /where onboarding_sessions\.token/i.test(text)) {
    return state.session?.token === values.find((v) => typeof v === 'string' && v.length > 10)
      ? [{
        ...state.session,
        email: 'buyer@example.com',
        first_name: 'Buyer',
        last_name: 'Example',
        display_name: 'Buyer Example',
        plan: 'single',
        amount_cents: 0,
        currency: 'usd',
      }]
      : [];
  }
  if (/from trips/i.test(text)) return [];
  if (/count\(\*\)::int as n from trip_things/i.test(text)) return [{ n: 0 }];
  if (/^\s*select\b/i.test(text)) return [];
  throw new Error(`unexpected sql: ${text.slice(0, 220)}`);
}

const originalFetch = globalThis.fetch;
const fetchLog = [];
globalThis.fetch = async (url, init) => {
  const href = String(url);
  fetchLog.push(href);
  if (href.includes('/api/checkout-config') || href.includes('/auth/app-config')) {
    throw new Error(`unexpected fetch: ${href}`);
  }
  if (href === 'https://api.resend.com/emails') {
    return {
      ok: true,
      json: async () => ({ id: 'resend-test' }),
    };
  }
  return originalFetch(url, init);
};

useVacationDatabase(db);
useVacationAppDatabase(db);
useOnboardingLookup(db);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    await handler(req, res);
    return;
  }
  res.statusCode = 404;
  res.end('not found');
});

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const couponRes = await fetch(`${origin}/api/checkout-coupon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Buyer',
      lastName: 'Example',
      email: 'buyer@example.com',
      couponCode,
      orderBump: false,
      photoMemories: false,
    }),
  });
  const couponBody = await couponRes.json();
  assert.equal(couponRes.status, 200, JSON.stringify(couponBody));
  assert.equal(couponBody.ok, true);
  assert.equal(state.tripCount, 0, 'purchase must not insert a trip');

  const token = couponBody.session?.token;
  assert.ok(token);
  assert.match(couponBody.session?.vacationAppUrl || '', new RegExp(`${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/vacation-app\\.html\\?session=`));

  const emailHtml = String(state.outboundEmail?.find((v) => typeof v === 'string' && v.includes('<html')) || '');
  assert.match(emailHtml, /vacation-app\.html\?session=/);
  assert.doesNotMatch(emailHtml, /\/shared\/intake-/);

  const onboardingRes = await fetch(`${origin}/api/onboarding-session?session=${encodeURIComponent(token)}`);
  const onboardingBody = await onboardingRes.json();
  assert.equal(onboardingRes.status, 200, JSON.stringify(onboardingBody));

  const appRes = await fetch(`${origin}/api/vacation-itinerary?app=1&session=${encodeURIComponent(token)}`);
  const appBody = await appRes.json();
  assert.equal(appRes.status, 200, JSON.stringify(appBody));
  assert.equal(appBody.vacations.length, 0);

  const indexHtml = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(indexHtml, /tsBootCheckoutCatalog[\s\S]{0,1200}checkout-config/);
  assert.equal(fetchLog.some((href) => href.includes('checkout-config')), false);

  const orderTestHtml = await readFile(path.join(root, 'order-test.html'), 'utf8');
  assert.doesNotMatch(orderTestHtml, /couponPayBtn[\s\S]{0,2000}checkout-config/);
} finally {
  useVacationDatabase(null);
  useVacationAppDatabase(null);
  useOnboardingLookup(null);
  globalThis.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
  await rm(storeDir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('coupon purchase no trip passed');
