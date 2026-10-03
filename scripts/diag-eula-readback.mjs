#!/usr/bin/env node
/** Standalone EULA receipt readback diagnostic (staging DB + same smoke accept path). */
import { sql } from '/workspace/src/vacation/db.mjs';
import { receiptKey } from '/workspace/src/onboarding/eula-persistent-core.mjs';
import { mintCheckoutCoupons } from './mint-checkout-coupons.mjs';
import {
  eulaStoreObjectKey,
  eulaVacationSessionId,
  listEulaStoreObjectKeysForSession,
} from './shepherd-staging-smoke-eula-readback.mjs';

const BASE = process.env.SHEPHERD_BASE || 'https://vacation-staging.timesyncher.com';
const RUN_TS = Date.now();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for diag-eula-readback.mjs');
  process.exit(1);
}

const db = sql(process.env);
const codes = await mintCheckoutCoupons(db, { count: 1, tier: 'single', label: `diag-eula-${RUN_TS}`, max: 1 });
const couponMain = codes[0];
if (!couponMain) {
  console.error('Could not mint checkout coupon (need VERCEL_TOKEN + DATABASE_URL)');
  process.exit(1);
}

const smokeEmail = `diag-eula-${RUN_TS}@resend.dev`;
const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    firstName: 'Diag',
    lastName: 'Eula',
    email: smokeEmail,
    couponCode: couponMain,
    orderBump: false,
    photoMemories: false,
  }),
});
const couponJson = JSON.parse((await couponRes.text()).split('\nHTTP:')[0]);
const sessionToken = couponJson.session?.token;
if (!sessionToken) {
  console.error(JSON.stringify({ error: 'checkout_missing_session', status: couponRes.status, couponJson }, null, 2));
  process.exit(1);
}

const sessionId = eulaVacationSessionId(sessionToken);
const acceptRes = await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(sessionId)}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ acceptedByName: 'Diag Eula', checkboxConfirmed: true }),
});
const acceptJson = await acceptRes.json().catch(() => ({}));

const expectedKey = eulaStoreObjectKey(sessionId, 'receipt', process.env);
const relReceipt = receiptKey(sessionId);
const exactRows = await db`select key, document from eula_store_objects where key = ${expectedKey} limit 1`;
const storeKeys = await listEulaStoreObjectKeysForSession(db, sessionId, process.env);

const out = {
  base: BASE,
  sessionToken,
  sessionId,
  acceptHttp: acceptRes.status,
  acceptOk: acceptJson.ok === true,
  receiptSha256FromApi: acceptJson.receiptSha256 || null,
  expectedReceiptKey: expectedKey,
  appRelativeReceiptKey: relReceipt,
  exactKeyFound: exactRows.length > 0,
  eulaStoreKeysForSession: storeKeys.keys,
  eulaStoreKeyRowCount: storeKeys.rowCount,
  sessionIdLike: storeKeys.sessionIdLike,
};

console.log(JSON.stringify(out, null, 2));
if (!exactRows.length) {
  console.error(`missing expected eula_store_objects key: ${expectedKey}`);
  process.exit(1);
}
process.exit(0);
