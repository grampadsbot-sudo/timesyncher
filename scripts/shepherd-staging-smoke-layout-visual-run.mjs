#!/usr/bin/env node
/** Proof runner: LAYOUT + VISUAL against live staging (fail-closed). */
import { writeFile } from 'node:fs/promises';
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
import {
  runVisualHarnessCheck,
  summarizeVisualVerdicts,
} from './shepherd-staging-smoke-visual.mjs';
import { VISUAL_JUDGE_MODEL } from './shepherd-staging-smoke-visual-judge.mjs';
import { loadAppScreenSpecText } from './shepherd-staging-smoke-ui-spec.mjs';

const EXPECT_SHA = process.argv[2];
if (!EXPECT_SHA || !/^[0-9a-f]{7,40}$/i.test(EXPECT_SHA)) {
  console.error('Usage: node scripts/shepherd-staging-smoke-layout-visual-run.mjs <full40Sha>');
  process.exit(1);
}
const SHA7 = EXPECT_SHA.slice(0, 7);
const BASE = 'https://vacation-staging.timesyncher.com';
const ARTIFACT_DIR = '/opt/cursor/artifacts';
const CHROME = { executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox'] };

configureShepherdSmokeHelpers({
  BASE,
  RUN_TS: Date.now(),
  DECOY_TITLE: `JUDGE_${SHA7}`,
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

const db = sql(process.env);
const spec = loadAppScreenSpecText();

const browser = await puppeteer.launch(CHROME);
const page = await browser.newPage();
let layout;
let visual;
try {
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
  const chatUrl = `${BASE}/vacation-app.html?session=${encodeURIComponent(session)}`;
  const sharedUrl = tripId ? `${BASE}/shared/${intakeShareSlug(tripId)}/` : '';

  layout = await runLayoutHarnessCheck({
    page,
    chatUrl,
    sharedUrl,
    artifactPath: (name) => `${ARTIFACT_DIR}/${name}`,
    setStage: (label) => { process.stderr.write(`[LAYOUT] ${label}\n`); },
  });
  visual = await runVisualHarnessCheck({
    page,
    db,
    BASE,
    SHA7,
    expectSha: EXPECT_SHA,
    setStage: (label) => { process.stderr.write(`[VISUAL] ${label}\n`); },
  });
} finally {
  try {
    await page.close();
  } catch (err) {
    process.stderr.write(`page close: ${String(err?.message || err)}\n`);
  }
  try {
    await browser.close();
  } catch (err) {
    process.stderr.write(`browser close: ${String(err?.message || err)}\n`);
  }
}

const layoutSummary = summarizeLayoutFailures(layout.probes);
const visualSummary = summarizeVisualVerdicts(visual.judged);
const pass = layout.pass && visual.pass;
const out = {
  expectSha: EXPECT_SHA,
  visualJudgeModel: VISUAL_JUDGE_MODEL,
  uiSpecSource: spec.source,
  deployId: process.env.SHEPHERD_DEPLOY_ID || 'dpl_EJNxPWyTbdDPTb7UagmT487jAte9',
  checks: { LAYOUT: layout.pass ? 'PASS' : 'FAIL', VISUAL: visual.pass ? 'PASS' : 'FAIL' },
  checkLAYOUT: layout,
  checkVISUAL: { pass: visual.pass, artifactDir: visual.artifactDir, verdictPath: `${visual.artifactDir}/verdict.json` },
  layoutSummary,
  visualSummary,
};
process.stdout.write(`${layoutSummary}\n\n--- VISUAL ---\n${visualSummary}\n`);
await writeFile(`${ARTIFACT_DIR}/shepherd-${SHA7}-layout-visual-run-out.json`, `${JSON.stringify(out, null, 2)}\n`);
process.stdout.write(JSON.stringify({ checks: out.checks, pass }, null, 2));
process.exit(pass ? 0 : 1);
