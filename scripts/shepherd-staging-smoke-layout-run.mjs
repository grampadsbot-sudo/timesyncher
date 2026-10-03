#!/usr/bin/env node
/** Run LAYOUT check only against live staging (fail-closed composer + overflow probes). */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/workspace/node_modules/puppeteer-core');
import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import { sql } from '/workspace/src/vacation/db.mjs';
import { ensureShepherdStagingSmokeEnv } from './shepherd-staging-smoke-env.mjs';
import { runShepherdJevPreflight } from './shepherd-staging-smoke-jev-preflight.mjs';
import { mintCheckoutCoupons } from './mint-checkout-coupons.mjs';
import {
  configureShepherdSmokeHelpers,
  postItinerary,
  getApp,
} from './shepherd-staging-smoke-helpers.mjs';
import {
  ensureLayoutArtifactDir,
  runLayoutHarnessCheck,
  summarizeLayoutFailures,
} from './shepherd-staging-smoke-layout.mjs';

const EXPECT_SHA = process.argv[2];
const shareArg = process.argv.find((a) => a.startsWith('--share='));
const sessionArg = process.argv.find((a) => a.startsWith('--session='));
if (!EXPECT_SHA || !/^[0-9a-f]{7,40}$/i.test(EXPECT_SHA)) {
  console.error('Usage: node scripts/shepherd-staging-smoke-layout-run.mjs <full40Sha> [--share=slug] [--session=token]');
  process.exit(1);
}
const SHA7 = EXPECT_SHA.slice(0, 7);
const BASE = 'https://vacation-staging.timesyncher.com';
const ARTIFACT_DIR = '/opt/cursor/artifacts';
const CHROME = { executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox'] };

configureShepherdSmokeHelpers({
  BASE,
  RUN_TS: Date.now(),
  DECOY_TITLE: `LAYOUT_${SHA7}`,
  HYATT_CANON: 'Hyatt Regency Maui Resort & Spa',
  REAL_HYATT: { lat: 20.91297, lng: -156.69217, street: '200 Nohea Kai' },
  SHA7,
  commerceHits: () => [],
});

await ensureShepherdStagingSmokeEnv();
ensureLayoutArtifactDir(ARTIFACT_DIR);

const jev = await runShepherdJevPreflight();
if (!jev.ok) {
  console.error(JSON.stringify({ harnessBlocker: jev }, null, 2));
  process.exit(2);
}

const vres = await fetch(`${BASE}/api/version`);
const version = await vres.json();
if (version.sha !== EXPECT_SHA && !String(version.sha || '').startsWith(SHA7)) {
  console.error(JSON.stringify({ error: 'version_mismatch', want: EXPECT_SHA, got: version.sha }));
  process.exit(2);
}

let chatUrl = '';
let sharedUrl = '';
if (sessionArg && shareArg) {
  const session = sessionArg.slice('--session='.length);
  const share = shareArg.slice('--share='.length).replace(/^\/+|\/+$/g, '');
  chatUrl = `${BASE}/vacation-app.html?session=${encodeURIComponent(session)}`;
  sharedUrl = share.startsWith('http') ? share : `${BASE}/shared/${share}/`;
} else {
  const db = sql(process.env);
  const [couponMain] = await mintCheckoutCoupons(db, { count: 1, max: 1, label: `layout-${SHA7}` });
  const email = `layout-${SHA7}-${Date.now()}@resend.dev`;
  const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Layout', lastName: SHA7, email, couponCode: couponMain, orderBump: false, photoMemories: false,
    }),
  });
  const couponJson = await couponRes.json();
  const session = couponJson.session?.token;
  await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${session}`)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acceptedByName: 'Layout', checkboxConfirmed: true }),
  });
  await getApp(session);
  await postItinerary(session, { text: 'hi' });
  const tripMsg = await postItinerary(session, { text: 'Maui March 10-17 2027 with my wife' });
  const tripId = tripMsg.json.trip?.id;
  chatUrl = `${BASE}/vacation-app.html?session=${encodeURIComponent(session)}`;
  sharedUrl = tripId ? `${BASE}/shared/${intakeShareSlug(tripId)}/` : '';
}

const artifactPath = (name) => `${ARTIFACT_DIR}/shepherd-${SHA7}-${name}`;
const browser = await puppeteer.launch(CHROME);
const page = await browser.newPage();
let layout;
try {
  layout = await runLayoutHarnessCheck({
    page,
    chatUrl,
    sharedUrl,
    artifactPath: (name) => `${ARTIFACT_DIR}/${name}`,
    setStage: (label) => { process.stderr.write(`[LAYOUT] ${label}\n`); },
  });
} finally {
  await browser.close();
}

const summary = summarizeLayoutFailures(layout.probes);
const out = {
  expectSha: EXPECT_SHA,
  deployId: process.env.SHEPHERD_DEPLOY_ID || 'dpl_EJNxPWyTbdDPTb7UagmT487jAte9',
  checks: { LAYOUT: layout.pass ? 'PASS' : 'FAIL' },
  checkLAYOUT: layout,
  summary,
};
await writeFile(`${ARTIFACT_DIR}/shepherd-${SHA7}-layout-run-out.json`, `${JSON.stringify(out, null, 2)}\n`);
process.stdout.write(`${summary}\n`);
process.stdout.write(JSON.stringify({ checks: out.checks, pass: layout.pass }, null, 2));
process.exit(layout.pass ? 0 : 1);
