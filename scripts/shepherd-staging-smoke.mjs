#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/workspace/node_modules/puppeteer-core');
import { sql } from '/workspace/src/vacation/db.mjs';
import { normalizePlaceName } from '/workspace/src/vacation/intake-lodging-candidate.mjs';
import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import { inTurnPlaceReplyViolation } from '/workspace/src/vacation/chat-place-search.mjs';
import { gradeCoffeeReplyRows } from './shepherd-staging-smoke-lib.mjs';
import { createSmokeRunner } from './shepherd-staging-smoke-run-check.mjs';
import { ensureShepherdStagingSmokeEnv } from './shepherd-staging-smoke-env.mjs';
import {
  configureShepherdSmokeHelpers,
  postItinerary,
  postItineraryTimed,
  getApp,
  seedDecoy,
  turnRow,
  customerTurnRow,
  braveTacos,
  braveFromProviders,
  thingReport,
  hyattThingPass,
  anchorMatchesRealHyatt,
  lookupBundle,
  runSharedSiteMapBudLogoChecks,
  inviteUiHits,
  fullDiag,
  classifierSnapshot,
  persistedTurnClassifier,
  transcriptWelcomes,
  welcomeClaimRows,
  ERROR_REPLY_RE,
  OUTSIDE_KIHEI_RE,
} from './shepherd-staging-smoke-helpers.mjs';
import { runShepherdSmokeTail } from './shepherd-staging-smoke-tail.mjs';
import { runShepherdSmokeLateChecks } from './shepherd-staging-smoke-late-checks.mjs';

const EXPECT_SHA = process.argv[2];
if (!EXPECT_SHA || !/^[0-9a-f]{40}$/i.test(EXPECT_SHA)) {
  console.error('Usage: node scripts/shepherd-staging-smoke.mjs <full40Sha> <couponMain> <couponH2> <couponA1> <couponA2> <couponDTrip> <couponInvClaim>');
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
const { runCheck } = runner;

const [couponMain, couponH2, couponA1, couponA2, couponDTrip, couponInvClaim] = process.argv.slice(3);
if (!couponMain || !couponH2 || !couponA1 || !couponA2 || !couponDTrip || !couponInvClaim) process.exit(1);

await ensureShepherdStagingSmokeEnv();

const db = sql(process.env);
out.decoy = await seedDecoy(db);
await mkdir(ARTIFACT_DIR, { recursive: true });

let session;
let customerId;
let tripId;
let tripTitle = '';
let smokeEmail;
let leak6 = false;
let ps6;
let ps6b;
let hi;
let tripMsg;
let hTurn;
let clReply;
let creationReply;
let tTurn;
let mReply;
let rReply;
let hThing;
let hyLat;
/** @type {null | Awaited<ReturnType<typeof runSharedSiteMapBudLogoChecks>>} */
let sharedSite = null;

await runCheck('1', async ({ setStage }) => {
  setStage('GET /api/version');
  const vres = await fetch(`${BASE}/api/version`);
  const version = await vres.json();
  out.version = version;
  const pass = vres.status === 200 && version.sha === EXPECT_SHA;
  return { pass, http: vres.status };
}, { timeoutMs: 60000 });

await runCheck('2', async ({ setStage, registerBrowser }) => {
  setStage('landing price');
  const browser = await puppeteer.launch(CHROME);
  registerBrowser(browser);
  const page = await browser.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  const price = await page.$eval('#singlePrice', (el) => el.textContent).catch(() => '');
  smokeEmail = `shepherd-${SHA7}-${RUN_TS}@resend.dev`;
  await page.type('input[name="firstName"]', 'Shepherd');
  await page.type('input[name="lastName"]', SHA7);
  await page.type('input[name="email"]', smokeEmail);
  await browser.close();
  return { pass: price === '$37', http: 200 };
}, { timeoutMs: 90000 });

await runCheck('3', async ({ setStage }) => {
  setStage('checkout-coupon main');
  const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firstName: 'Shepherd', lastName: SHA7, email: smokeEmail, couponCode: couponMain, orderBump: false, photoMemories: false }),
  });
  const couponJson = JSON.parse((await couponRes.text()).split('\nHTTP:')[0]);
  session = couponJson.session?.token;
  customerId = couponJson.redemption?.customer_id;
  const tripsAfter = (await db`select count(*)::int n from trips where customer_id=${customerId}`)[0].n;
  await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${session}`)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acceptedByName: 'Shepherd', checkboxConfirmed: true }) });
  return { pass: couponRes.status === 200 && tripsAfter === 0, http: couponRes.status };
}, { timeoutMs: 60000 });

const onboardSess = (await db`select id from onboarding_sessions where token=${session} limit 1`)[0]?.id;
const wPoints = {};

await runCheck('4', async ({ setStage }) => {
  setStage('onboarding hi');
  await getApp(session);
  wPoints.afterTermsGet = await transcriptWelcomes(db, customerId);
  hi = await postItinerary(session, { text: 'hi' });
  wPoints.afterHi = await transcriptWelcomes(db, customerId);
  return { pass: hi.status === 200 && /where|when/i.test(hi.json.reply || ''), http: hi.status };
}, { timeoutMs: 60000 });

await runCheck('C', async ({ setStage, registerBrowser }) => {
  setStage('checkout zero UI');
  const chromeC = await puppeteer.launch(CHROME);
  registerBrowser(chromeC);
  const cPage = await chromeC.newPage();
  await cPage.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3000));
  await cPage.type('input[name="firstName"]', 'C');
  await cPage.type('input[name="lastName"]', 'Check');
  await cPage.type('input[name="email"]', `c-check-${Date.now()}@resend.dev`);
  await cPage.click('#continueBtn');
  await new Promise((r) => setTimeout(r, 2500));
  await cPage.type('#couponCode', couponMain);
  await cPage.evaluate(() => document.querySelector('#couponCode')?.dispatchEvent(new Event('input', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 2000));
  const checkC = await cPage.evaluate(() => ({
    total: document.getElementById('total')?.textContent?.trim(),
    redeemVisible: !document.getElementById('couponPayBtn')?.hidden,
    redeemText: document.getElementById('couponPayBtn')?.textContent?.trim(),
  }));
  const cShot = artifactPath('checkout-zero.png');
  await cPage.screenshot({ path: cShot, fullPage: true });
  await chromeC.close();
  out.checkC = { ...checkC, screenshot: cShot };
  return { pass: /\$0/.test(checkC.total || '') && checkC.redeemVisible, http: 200 };
}, { timeoutMs: 90000 });

await runCheck('W', async ({ setStage }) => {
  setStage('welcome transcript');
  tripMsg = await postItinerary(session, { text: 'Maui March 10-17 2027 with my wife' });
  tripId = tripMsg.json.trip?.id || (await db`select id from trips where customer_id=${customerId} order by created_at desc limit 1`)[0]?.id;
  wPoints.afterTripCreate = await transcriptWelcomes(db, customerId);
  await getApp(session);
  wPoints.afterSecondGet = await transcriptWelcomes(db, customerId);
  const welcomeClaims = await welcomeClaimRows(db, onboardSess);
  out.checkW = { points: wPoints, welcomeClaimRows: welcomeClaims };
  const wOk = Object.values(wPoints).every((p) => p.count === 1 && !p.hasLink);
  return { pass: wOk, http: 200 };
}, { timeoutMs: 60000 });

let chatShot;
await runCheck('5', async ({ setStage, registerBrowser }) => {
  setStage('trip create + chat screenshot');
  tripTitle = tripId ? (await db`select title from trips where id=${tripId} limit 1`)[0]?.title : '';
  const ent = (await db`select trip_id from entitlements where customer_id=${customerId} and status='active' limit 1`)[0];
  const chrome5 = await puppeteer.launch(CHROME);
  registerBrowser(chrome5);
  const p5 = await chrome5.newPage();
  await p5.goto(`${BASE}/vacation-app.html?session=${encodeURIComponent(session)}`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3000));
  chatShot = artifactPath('chat.png');
  await p5.screenshot({ path: chatShot, fullPage: true });
  const chatHtml = await p5.content();
  await chrome5.close();
  out.checkINVUI = { chatShot, chatHits: inviteUiHits(chatHtml) };
  const tripRow = tripId ? (await db`select start_date, end_date, destination from trips where id=${tripId}`)[0] : null;
  const tripTurnDb = tripId ? await turnRow(db, tripId, 'Maui March%') : null;
  const tripBlocked = tripTurnDb?.payload?.blockedReasons || tripMsg.json.blockedReasons || [];
  const tripIntakeBlock = tripBlocked.some((r) => String(r).includes('first_intake')) || tripMsg.json.status === 'blocked' || tripMsg.json.error === 'first_intake_reply_flagged';
  out.check5 = { tripId, tripRow, ent, screenshot: chatShot, intakeBlock: { tripBlocked, tripIntakeBlock } };
  const pass = tripMsg.status === 201 && !tripIntakeBlock && ent?.trip_id === tripId && tripRow?.start_date;
  return { pass, http: tripMsg.status };
}, { timeoutMs: 90000 });

await runCheck('I', async ({ setStage }) => {
  setStage('collaborator invite Alex');
  const inviteRes = await postItinerary(session, { tripId, action: 'collaborator-invite', seats: [{ name: 'Invite Alex', email: INVITE_EMAIL }] });
  const iInviteRow = (await db`
    select id, trip_id, status, metadata from vacation_collaborator_invites
    where owner_customer_id=${customerId} and metadata->>'email'=${INVITE_EMAIL} order by created_at desc limit 1`)[0];
  const iOutboundAll = await db`
    select id, status, subject, to_email, html_body, text_body, metadata from outbound_emails
    where customer_id=${customerId} and to_email=${INVITE_EMAIL} order by created_at asc`;
  const ownerDisplay = (await db`select display_name, first_name from customers where id=${customerId} limit 1`)[0];
  const iAcceptPath = iInviteRow?.id ? `/accept/vacation-collaborator-${iInviteRow.id}` : '';
  const iHtml = String(iOutboundAll[0]?.html_body || iOutboundAll[0]?.text_body || '');
  const iLinkOk = iHtml.includes(iAcceptPath);
  out.checkI = {
    http: inviteRes.status,
    inviteId: iInviteRow?.id,
    outboundCount: iOutboundAll.length,
    outboundEmail: iOutboundAll[0],
    ownerDisplay,
    tripTitle,
    acceptLinkOk: iLinkOk,
    expectedAcceptPath: iAcceptPath,
  };
  const iOwnerOk = new RegExp(ownerDisplay?.display_name?.split(/\s+/)[0] || 'Shepherd', 'i').test(iOutboundAll[0]?.subject || '');
  const iTitleOk = tripTitle && (iOutboundAll[0]?.subject || '').includes(tripTitle);
  const pass = inviteRes.status === 200 && iOutboundAll.length === 1 && iOutboundAll[0]?.status === 'sent' && iLinkOk && iOwnerOk && iTitleOk;
  return { pass, http: inviteRes.status };
}, { timeoutMs: 60000 });

await runCheck('6', async ({ setStage }) => {
  setStage('taco search Kaanapali');
  const t6 = await postItineraryTimed(session, { tripId, text: 'recommend taco spots near Kaanapali Maui' }, 60000);
  const t6db = tripId ? await turnRow(db, tripId, 'recommend taco%') : null;
  ps6 = t6.json.placeSearch || t6db?.payload?.placeSearch;
  const brave6 = braveFromProviders(ps6);
  const taco6 = t6db?.request_id ? await braveTacos(db, tripId, t6db.request_id) : [];
  leak6 = (ps6?.survivingPriorDbTitles || []).includes(DECOY_TITLE);
  const st6 = t6.json.stageTimings || t6db?.payload?.stageTimings || null;
  const st6Keys = ['classifierMs', 'searchMs', 'judgeMs', 'replyMs', 'gateMs'];
  const st6Ok = st6 && st6Keys.every((k) => Number.isFinite(Number(st6[k])));
  out.check6 = { http: t6.status, elapsedMs: t6.elapsedMs, stageTimings: st6, brave: brave6, anchor: ps6?.anchor, searchCenter: ps6?.searchCenter, braveTacoRows: taco6, diag: fullDiag(t6db?.payload, ps6) };
  const pass = t6.status >= 200 && t6.status < 300 && t6.status !== 504 && t6.elapsedMs < 60000 && st6Ok && /taco/i.test(brave6?.query || '') && brave6?.status === 'ok' && taco6.length > 0 && !leak6;
  return { pass, http: t6.status };
}, { timeoutMs: 60000 });

await runCheck('H', async ({ setStage }) => {
  setStage('Hyatt lodging intake');
  hTurn = await postItinerary(session, { tripId, text: "We're staying at the Hyatt Regency Maui in Kaanapali." });
  const hotels = tripId ? await db`select id, title, category, source, location, description, metadata from trip_things where trip_id=${tripId} and category='hotel' order by created_at` : [];
  const hDb = tripId ? await customerTurnRow(db, tripId, '%Hyatt Regency Maui%') : null;
  const hyatt = hotels.find((h) => normalizePlaceName(h.title) === normalizePlaceName(HYATT_CANON)) || hotels.find((h) => /hyatt/i.test(h.title || '')) || hotels[0];
  hThing = thingReport(hyatt);
  hyLat = Number(hThing?.lat);
  const hBundle = lookupBundle(hDb?.payload);
  out.checkH = {
    http: hTurn.status,
    reply: hTurn.json.reply?.slice(0, 200),
    hotelThing: hThing,
    hotelCount: hotels.length,
    lodgingTurnPayload: hDb?.payload || null,
    intakeLodgingLookup: hDb?.payload?.intakeLodgingLookup || null,
    pickRanking: hBundle.pickRanking,
    rawResults: hBundle.rawResults,
    diag: fullDiag(hDb?.payload),
  };
  return { pass: hTurn.status >= 200 && hTurn.status < 300 && hyattThingPass(hThing, hyatt), http: hTurn.status };
}, { timeoutMs: 60000 });

await runCheck('MAP', async ({ setStage, registerBrowser }) => {
  setStage('shared site plan map');
  const tripMetaAfterH = tripId ? (await db`select metadata from trips where id=${tripId} limit 1`)[0]?.metadata : null;
  const publicUrlAfterH = tripMetaAfterH?.publicUrl || tripMetaAfterH?.public_url || '';
  const shareSlug = tripId ? intakeShareSlug(tripId) : '';
  let sharedApi = null;
  if (shareSlug) {
    const sr = await fetch(`${BASE}/api/shared/${shareSlug}`);
    sharedApi = { status: sr.status, json: await sr.json().catch(() => ({})) };
  }
  const chromeMap = await puppeteer.launch(CHROME);
  registerBrowser(chromeMap);
  const mapPage = await chromeMap.newPage();
  const mapUrl = publicUrlAfterH || (shareSlug ? `${BASE}/shared/${shareSlug}/` : '');
  sharedSite = await runSharedSiteMapBudLogoChecks({
    page: mapPage,
    mapUrl,
    publicUrlAfterH,
    shareSlug,
    sharedApi,
    artifactPath,
  });
  await chromeMap.close();
  out.checkMAP = { ...sharedSite.checkMAP, sharedUiHits: inviteUiHits(sharedSite.sharedHtml) };
  out.checkBUD = sharedSite.checkBUD;
  out.checkLOGO = sharedSite.checkLOGO;
  return { pass: sharedSite.checks.MAP === 'PASS', http: 200 };
}, { timeoutMs: 90000 });

await runCheck('BUD', async () => ({
  pass: sharedSite?.checks.BUD === 'PASS',
  http: 200,
}), { timeoutMs: 60000 });

await runCheck('LOGO', async () => ({
  pass: sharedSite?.checks.LOGO === 'PASS',
  http: 200,
}), { timeoutMs: 60000 });

await runCheck('INV-UI', async () => {
  const pass = (out.checkINVUI?.chatHits || []).length === 0 && (out.checkMAP?.sharedUiHits || []).length === 0;
  return { pass, http: 200 };
}, { timeoutMs: 60000 });

await runCheck('6b', async ({ setStage }) => {
  setStage('tacos near hotel anchor');
  const t6b = await postItinerary(session, { tripId, text: 'best tacos near our hotel' });
  const t6bdb = tripId ? await turnRow(db, tripId, 'best tacos%') : null;
  ps6b = t6b.json.placeSearch || t6bdb?.payload?.placeSearch;
  const brave6b = braveFromProviders(ps6b);
  const anchor = ps6b?.anchor;
  const sc = ps6b?.searchCenter;
  out.check6b = { http: t6b.status, brave: brave6b, query: brave6b?.query, anchor, searchCenter: sc, diag: fullDiag(t6bdb?.payload, ps6b) };
  const t6bClassifierFail = t6bdb?.payload?.placeSearch?.error === 'turn_classifier_failed' || t6b.status === 502;
  const pass = t6b.status === 201 && !t6bClassifierFail && brave6b?.status === 'ok' && Number(brave6b?.resultCount) > 0 && anchorMatchesRealHyatt(anchor, sc);
  return { pass, http: t6b.status };
}, { timeoutMs: 60000 });

await runCheck('T', async ({ setStage }) => {
  setStage('tacos category turn');
  tTurn = await postItinerary(session, { tripId, text: 'tacos near our hotel' });
  const tDb = tripId ? await turnRow(db, tripId, 'tacos near our hotel%') : null;
  const tPs = tTurn.json.placeSearch || tDb?.payload?.placeSearch;
  const tClass = classifierSnapshot(tDb?.payload);
  const tBrave = braveFromProviders(tPs);
  const tSc = tPs?.searchCenter;
  const tNearLodging = tSc && Number.isFinite(hyLat) && Math.abs(Number(tSc.lat) - hyLat) < 0.2;
  const tReply = tTurn.json.reply || '';
  const tResults = tPs?.results || tDb?.payload?.placeSearch?.results || [];
  const tViolation = inTurnPlaceReplyViolation(tReply, tResults);
  const tMarchLeak = /\bMarch\b/i.test(tReply) && !/march\s+\d/i.test(tReply);
  const tPersist = persistedTurnClassifier(tDb?.payload);
  out.checkT = {
    http: tTurn.status,
    classifier: tClass,
    brave: tBrave,
    anchor: tPs?.anchor,
    searchCenter: tSc,
    diag: fullDiag(tDb?.payload, tPs),
    replySnippet: tReply.slice(0, 400),
    violation: tViolation,
    marchLeak: tMarchLeak,
    persistedCategory: tPersist.category,
  };
  const pass = tTurn.status === 201 && tPersist.category === 'restaurant' && tClass.targetKind === 'category' && tNearLodging && tBrave?.status === 'ok' && !tViolation && !tMarchLeak;
  return { pass, http: tTurn.status };
}, { timeoutMs: 60000 });

await runCheck('CL', async ({ setStage }) => {
  setStage('invite Kim');
  const clTurn = await postItinerary(session, { tripId, text: `please invite Kim at ${CL_EMAIL}` });
  const clInvite = (await db`
    select id, trip_id, requested_for, status, metadata from vacation_collaborator_invites
    where owner_customer_id=${customerId} and metadata->>'email'=${CL_EMAIL} order by created_at desc limit 1`)[0];
  const clOut = (await db`select id, status, provider_message_id, to_email from outbound_emails where customer_id=${customerId} and to_email=${CL_EMAIL} order by created_at desc limit 1`)[0];
  clReply = clTurn.json.reply || '';
  const clBad = /welcome,\s*Kim/i.test(clReply) || /\bKim\b.*joining the trip/i.test(clReply);
  const clGood = /emailed|pending|accept|invite/i.test(clReply);
  const clInviteOk = clTurn.json.turnActionResults?.invite?.ok === true || clInvite?.id;
  out.checkCL = { http: clTurn.status, reply: clReply, inviteDb: clInvite, outboundEmail: clOut, turnActionResults: clTurn.json.turnActionResults };
  const pass = clTurn.status === 201 && clOut?.status === 'sent' && clInviteOk && clGood && !clBad;
  return { pass, http: clTurn.status };
}, { timeoutMs: 60000 });

await runCheck('7', async ({ setStage }) => {
  setStage('weather web search');
  const w7 = await postItinerary(session, { tripId, text: "what's the weather and any events that week" });
  const w7db = tripId ? await turnRow(db, tripId, '%weather%') : null;
  const ws = w7db?.payload?.webSearch || w7.json.webSearch;
  out.check7 = { webSearch: ws };
  return { pass: w7.status === 201 && ws?.status === 'ok' && (ws?.providers || []).includes('tavily'), http: w7.status };
}, { timeoutMs: 60000 });

await runCheck('8', async ({ setStage }) => {
  setStage('land time no things');
  const before8 = tripId ? (await db`select count(*)::int n from trip_things where trip_id=${tripId}`)[0].n : 0;
  const land = await postItinerary(session, { tripId, text: 'we land in Maui at 3pm' });
  const after8 = tripId ? (await db`select count(*)::int n from trip_things where trip_id=${tripId}`)[0].n : 0;
  const landDb = tripId ? await turnRow(db, tripId, 'we land%') : null;
  out.check8 = { http: land.status, status: land.json.status, thingsDelta: after8 - before8, diag: fullDiag(landDb?.payload, landDb?.payload?.placeSearch) };
  return { pass: land.status >= 200 && land.status < 300 && land.json.status !== 'turn_classifier_failed' && after8 - before8 === 0, http: land.status };
}, { timeoutMs: 60000 });

const lateState = { mReply, rReply, creationReply };
await runShepherdSmokeLateChecks({
  runCheck,
  session,
  tripId,
  db,
  out,
  SHA7,
  RUN_TS,
  couponH2,
  BASE,
  postItinerary,
  customerTurnRow,
  turnRow,
  thingReport,
  lookupBundle,
  fullDiag,
  persistedTurnClassifier,
  classifierSnapshot,
  ERROR_REPLY_RE,
  OUTSIDE_KIHEI_RE,
  state: lateState,
});
({ mReply, rReply, creationReply } = lateState);

out.deployId = process.env.SHEPHERD_DEPLOY_ID || 'dpl_H9FZGdY3mKcvLwHLfsBjMWa7a2pn1';

await runShepherdSmokeTail({
  db,
  out,
  BASE,
  SHA7,
  RUN_TS,
  couponA1,
  couponA2,
  couponDTrip,
  couponInvClaim,
  couponMain,
  couponH2,
  session,
  customerId,
  tripId,
  smokeEmail,
  A1_EMAIL,
  A2_OWNER_FIRST,
  A2_OWNER_LAST,
  A2_COLLAB_NAME,
  A2_EMAIL,
  DECOY_TITLE,
  D1_EXPECT_START,
  SCT_CODE,
  leak6,
  ps6,
  ps6b,
  mReply,
  rReply,
  hTurn,
  clReply,
  hi,
  tripMsg,
  creationReply,
  tTurn,
  runCheck,
});

await runner.finish();
