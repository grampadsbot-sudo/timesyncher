#!/usr/bin/env node
/** Run LOGO bar only against live staging (shared Hotels + Cars logo chips). */
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/workspace/node_modules/puppeteer-core');
import { sql } from '/workspace/src/vacation/db.mjs';
import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import { ensureShepherdStagingSmokeEnv } from './shepherd-staging-smoke-env.mjs';
import {
  configureShepherdSmokeHelpers,
  postItinerary,
  getApp,
  runSharedSiteLogoBarChecks,
} from './shepherd-staging-smoke-helpers.mjs';
import { mintCheckoutCoupons } from './mint-checkout-coupons.mjs';

const EXPECT_SHA = process.argv[2];
const shareOnlyArg = process.argv.find((a) => a.startsWith('--share='));
const shareOnly = shareOnlyArg ? shareOnlyArg.slice('--share='.length) : process.env.SHEPHERD_LOGO_SHARE_URL || '';
if (!EXPECT_SHA || !/^[0-9a-f]{7,40}$/i.test(EXPECT_SHA)) {
  console.error('Usage: node scripts/shepherd-staging-smoke-logo-bar.mjs <gitSha7or40> [couponMain] [--share=slug-or-url]');
  process.exit(1);
}
const SHA7 = EXPECT_SHA.slice(0, 7);
const BASE = 'https://vacation-staging.timesyncher.com';
const RUN_TS = Date.now();
const ARTIFACT_DIR = '/opt/cursor/artifacts';
const CHROME = { executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox'] };

configureShepherdSmokeHelpers({
  BASE,
  RUN_TS,
  DECOY_TITLE: `LOGO_BAR_${SHA7}`,
  HYATT_CANON: 'Hyatt Regency Maui Resort & Spa',
  REAL_HYATT: { lat: 20.91297, lng: -156.69217, street: '200 Nohea Kai' },
  SHA7,
  commerceHits: () => [],
});

await ensureShepherdStagingSmokeEnv();
await mkdir(ARTIFACT_DIR, { recursive: true });

const vres = await fetch(`${BASE}/api/version`);
const version = await vres.json();
if (version.sha !== EXPECT_SHA && !String(version.sha || '').startsWith(SHA7)) {
  console.error(JSON.stringify({ error: 'version_mismatch', want: EXPECT_SHA, got: version.sha }));
  process.exit(2);
}

let mapUrl = '';
let sharedApi = null;

if (shareOnly) {
  mapUrl = shareOnly.startsWith('http') ? shareOnly : `${BASE}/shared/${shareOnly.replace(/^\/+|\/+$/g, '')}/`;
} else {
  let couponMain = process.argv[3];
  if (!couponMain) {
    const dbMint = sql(process.env);
    const codes = await mintCheckoutCoupons(dbMint, { count: 1, tier: 'single', label: `logo-bar-${SHA7}`, max: 1 });
    couponMain = codes[0];
  }
  if (!couponMain) {
    console.error('No coupon (pass as argv[3] or mint with VERCEL_TOKEN + DATABASE_URL)');
    process.exit(1);
  }

  const smokeEmail = `logo-bar-${SHA7}-${RUN_TS}@resend.dev`;
  const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Logo',
      lastName: SHA7,
      email: smokeEmail,
      couponCode: couponMain,
      orderBump: false,
      photoMemories: false,
    }),
  });
  const couponJson = JSON.parse((await couponRes.text()).split('\nHTTP:')[0]);
  const session = couponJson.session?.token;
  const customerId = couponJson.redemption?.customer_id;
  const db = sql(process.env);
  await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${session}`)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acceptedByName: 'Logo', checkboxConfirmed: true }),
  });

  await getApp(session);
  await postItinerary(session, { text: 'hi' });
  const tripMsg = await postItinerary(session, { text: 'Maui March 10-17 2027 with my wife' });
  const tripId = tripMsg.json.trip?.id || (await db`select id from trips where customer_id=${customerId} order by created_at desc limit 1`)[0]?.id;
  await postItinerary(session, { tripId, text: "We're staying at the Westin Maui in Kaanapali." });
  await postItinerary(session, { tripId, text: 'Hertz rental car at OGG' });
  const shareSlug = tripId ? intakeShareSlug(tripId) : '';
  mapUrl = shareSlug ? `${BASE}/shared/${shareSlug}/` : '';
  for (let i = 0; i < 25; i += 1) {
    if (!shareSlug) break;
    const sr = await fetch(`${BASE}/api/shared/${shareSlug}`);
    const json = await sr.json().catch(() => ({}));
    sharedApi = { status: sr.status, json };
    if ((json.places || []).length >= 1) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

if (!mapUrl) {
  console.error(JSON.stringify({ error: 'no_share_url' }));
  process.exit(1);
}

if (!sharedApi) {
  const slug = mapUrl.split('/shared/')[1]?.replace(/\/$/, '') || '';
  if (slug) {
    const sr = await fetch(`${BASE}/api/shared/${slug}`);
    sharedApi = { status: sr.status, json: await sr.json().catch(() => ({})) };
  }
}

const browser = await puppeteer.launch(CHROME);
const page = await browser.newPage();
const logoBar = await runSharedSiteLogoBarChecks({
  page,
  mapUrl,
  sharedApi,
  artifactPath: (name) => `${ARTIFACT_DIR}/shepherd-${SHA7}-logo-bar-${name}`,
});
await browser.close();

const out = {
  expectSha: version.sha,
  checkLOGO: logoBar.checkLOGO,
  pass: logoBar.pass,
  mapUrl,
};
console.log(JSON.stringify(out, null, 2));
process.exit(logoBar.pass ? 0 : 1);
