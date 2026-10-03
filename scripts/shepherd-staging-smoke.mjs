#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/workspace/node_modules/puppeteer-core');
import { sql } from '/workspace/src/vacation/db.mjs';
import { createSmokeRunner } from './shepherd-staging-smoke-run-check.mjs';
import { ensureShepherdStagingSmokeEnv } from './shepherd-staging-smoke-env.mjs';
import { configureShepherdSmokeHelpers, seedDecoy } from './shepherd-staging-smoke-helpers.mjs';
import { runShepherdSmokeBootstrap, runShepherdSmokeSpine, runShepherdSmokeMapBudLogoChecks } from './shepherd-staging-smoke-main.mjs';
import { buildMainIndependentParallelChecks } from './shepherd-staging-smoke-parallel.mjs';
import {
  SMOKE_MAIN_SPINE_ORDER,
  SMOKE_TAIL_SEQUENTIAL,
  SMOKE_PARALLEL_INDEPENDENT,
} from './shepherd-staging-smoke-plan.mjs';
import { buildAskLodgingParallelCheck } from './shepherd-staging-smoke-ask.mjs';
import { buildTailIndependentParallelChecks, runShepherdSmokeTail } from './shepherd-staging-smoke-tail.mjs';

const EXPECT_SHA = process.argv[2];
if (!EXPECT_SHA || !/^[0-9a-f]{40}$/i.test(EXPECT_SHA)) {
  console.error('Usage: node scripts/shepherd-staging-smoke.mjs <full40Sha> <couponMain> <couponH2> <couponA1> <couponA2> <couponDTrip> <couponInvClaim> <couponK> <couponAskLodging>');
  process.exit(1);
}
const SHA7 = EXPECT_SHA.slice(0, 7);
const BASE = 'https://vacation-staging.timesyncher.com';
const RUN_TS = Date.now();
const INVITE_EMAIL = 'alex.rivera.sct@agentmail.to';
const CL_EMAIL = 'kim.rivera.sct@agentmail.to';
const A1_EMAIL = `collab-a1-${SHA7}-${RUN_TS}@resend.dev`;
const A2_OWNER_FIRST = `Owner${SHA7}`;
const A2_OWNER_LAST = SHA7;
const A2_COLLAB_NAME = `Spouse${SHA7}`;
const A2_EMAIL = `collab-a2-${SHA7}-${RUN_TS}@resend.dev`;
const DECOY_TITLE = `PRIOR_DB_LEAK_OTHER_TRIP_${SHA7}`;
const ARTIFACT_DIR = '/opt/cursor/artifacts';
const artifactPath = (name) => `${ARTIFACT_DIR}/shepherd-${SHA7}-${name}`;
const D1_EXPECT_START = '2027-03-13';
const SCT_CODE = 'TS-2TZD3CGMA_J7';
const CHROME = { executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox'] };

const COLLAB_COMMERCE_RE = [
  /\bcheckout\b/i, /\bupgrade\b/i, /\bunlimited\b/i, /\$\s?\d/, /\bplan single\b/i,
  /Checkout offers four plans/i, /per collaborator seat/i, /purchase email/i,
];
function commerceHits(text) {
  const hay = String(text || '');
  return COLLAB_COMMERCE_RE.filter((re) => re.test(hay)).map(String);
}

const HYATT_CANON = 'Hyatt Regency Maui Resort & Spa';
const REAL_HYATT = { lat: 20.91297, lng: -156.69217, street: '200 Nohea Kai' };

configureShepherdSmokeHelpers({
  BASE,
  RUN_TS,
  DECOY_TITLE,
  HYATT_CANON,
  REAL_HYATT,
  SHA7,
  commerceHits,
});

const out = { expectSha: EXPECT_SHA, checks: {}, http: {} };
const runStartedAt = Date.now();
const runner = createSmokeRunner({ out, sha7: SHA7, artifactDir: ARTIFACT_DIR, runStartedAt });
const { runCheck, runChecksParallel, registerBrowser, killBrowsers } = runner;

const [couponMain, couponH2, couponA1, couponA2, couponDTrip, couponInvClaim, couponK, couponAskLodging] = process.argv.slice(3);
if (!couponMain || !couponH2 || !couponA1 || !couponA2 || !couponDTrip || !couponInvClaim || !couponK || !couponAskLodging) process.exit(1);

await ensureShepherdStagingSmokeEnv();

const db = sql(process.env);
out.decoy = await seedDecoy(db);
await mkdir(ARTIFACT_DIR, { recursive: true });

const state = {
  tripTitle: '',
  leak6: false,
  sharedSite: null,
  creationReply: '',
};

const sharedCtx = {
  runCheck,
  out,
  db,
  state,
  EXPECT_SHA,
  BASE,
  SHA7,
  RUN_TS,
  couponMain,
  couponH2,
  INVITE_EMAIL,
  CL_EMAIL,
  DECOY_TITLE,
  HYATT_CANON,
  artifactPath,
  CHROME,
  couponA1,
  couponA2,
  couponDTrip,
  couponInvClaim,
  couponK,
  couponAskLodging,
  A1_EMAIL,
  A2_OWNER_FIRST,
  A2_OWNER_LAST,
  A2_COLLAB_NAME,
  A2_EMAIL,
  D1_EXPECT_START,
  registerBrowser,
};

await runShepherdSmokeBootstrap(sharedCtx);

const sharedBrowser = await puppeteer.launch(CHROME);
registerBrowser(sharedBrowser);
sharedCtx.sharedBrowser = sharedBrowser;

const parallelEntries = [
  ...buildMainIndependentParallelChecks(sharedCtx),
  ...buildTailIndependentParallelChecks(sharedCtx),
  ...buildAskLodgingParallelCheck(sharedCtx),
];

await Promise.all([
  runShepherdSmokeSpine(sharedCtx),
  runChecksParallel(parallelEntries),
]);

await killBrowsers();

await runShepherdSmokeMapBudLogoChecks(sharedCtx);

out.deployId = process.env.SHEPHERD_DEPLOY_ID || 'dpl_H9TcCqtk2bmxzE2WSdyduGERw3yr';
out.smokePlan = { spine: SMOKE_MAIN_SPINE_ORDER, tail: SMOKE_TAIL_SEQUENTIAL, parallel: SMOKE_PARALLEL_INDEPENDENT.map((r) => r.name) };

await runShepherdSmokeTail({
  ...sharedCtx,
  session: state.session,
  customerId: state.customerId,
  tripId: state.tripId,
  smokeEmail: state.smokeEmail,
  leak6: state.leak6,
  ps6: state.ps6,
  ps6b: state.ps6b,
  mReply: state.mReply,
  rReply: state.rReply,
  hTurn: state.hTurn,
  clReply: state.clReply,
  hi: state.hi,
  tripMsg: state.tripMsg,
  creationReply: state.creationReply,
  tTurn: state.tTurn,
  SCT_CODE,
});

await runner.finish();
