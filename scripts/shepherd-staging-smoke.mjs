#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/workspace/node_modules/puppeteer-core');
import { sql } from '/workspace/src/vacation/db.mjs';
import { normalizePlaceName } from '/workspace/src/vacation/intake-lodging-candidate.mjs';
import { classifyTripIntake } from '/workspace/src/vacation/trip-intake-classify.mjs';
import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import { inTurnPlaceReplyViolation } from '/workspace/src/vacation/chat-place-search.mjs';
import { gradeLeafletProductMap, gradeMapBar, gradeCoffeeReplyRows } from './shepherd-staging-smoke-lib.mjs';
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
  mapSharedTripState,
  sharedBudgetTabCheck,
  sharedLogoChipMetrics,
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

const [couponMain, couponH2, couponA1, couponA2, couponDTrip, couponInvClaim] = process.argv.slice(3);
if (!couponMain || !couponH2 || !couponA1 || !couponA2 || !couponDTrip || !couponInvClaim) process.exit(1);

const db = sql(process.env);
out.decoy = await seedDecoy(db);

const vres = await fetch(`${BASE}/api/version`);
const version = await vres.json();
out.version = version;
out.http['1'] = vres.status;
out.checks['1'] = vres.status === 200 && version.sha === EXPECT_SHA ? 'PASS' : 'FAIL';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
const price = await page.$eval('#singlePrice', (el) => el.textContent).catch(() => '');
out.http['2'] = 200;
out.checks['2'] = price === '$37' ? 'PASS' : 'FAIL';

const smokeEmail = `shepherd-${SHA7}-${RUN_TS}@resend.dev`;
await page.type('input[name="firstName"]', 'Shepherd');
await page.type('input[name="lastName"]', SHA7);
await page.type('input[name="email"]', smokeEmail);
await browser.close();

const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ firstName: 'Shepherd', lastName: SHA7, email: smokeEmail, couponCode: couponMain, orderBump: false, photoMemories: false }),
});
const couponJson = JSON.parse((await couponRes.text()).split('\nHTTP:')[0]);
const session = couponJson.session?.token;
const customerId = couponJson.redemption?.customer_id;
const tripsAfter = (await db`select count(*)::int n from trips where customer_id=${customerId}`)[0].n;
out.http['3'] = couponRes.status;
out.checks['3'] = couponRes.status === 200 && tripsAfter === 0 ? 'PASS' : 'FAIL';

await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${session}`)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acceptedByName: 'Shepherd', checkboxConfirmed: true }) });

const onboardSess = (await db`select id from onboarding_sessions where token=${session} limit 1`)[0]?.id;
const wPoints = {};
await getApp(session);
wPoints.afterTermsGet = await transcriptWelcomes(db, customerId);

const hi = await postItinerary(session, { text: 'hi' });
out.http['4'] = hi.status;
out.checks['4'] = hi.status === 200 && /where|when/i.test(hi.json.reply || '') ? 'PASS' : 'FAIL';
wPoints.afterHi = await transcriptWelcomes(db, customerId);

const chromeC = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
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
await mkdir(ARTIFACT_DIR, { recursive: true });
const cShot = artifactPath('checkout-zero.png');
await cPage.screenshot({ path: cShot, fullPage: true });
await chromeC.close();
out.checkC = { ...checkC, screenshot: cShot };
out.http.C = 200;
out.checks.C = /\$0/.test(checkC.total || '') && checkC.redeemVisible ? 'PASS' : 'FAIL';

const tripMsg = await postItinerary(session, { text: 'Maui March 10-17 2027 with my wife' });
const tripId = tripMsg.json.trip?.id || (await db`select id from trips where customer_id=${customerId} order by created_at desc limit 1`)[0]?.id;
const tripTitle = tripId ? (await db`select title from trips where id=${tripId} limit 1`)[0]?.title : '';
const ent = (await db`select trip_id from entitlements where customer_id=${customerId} and status='active' limit 1`)[0];
wPoints.afterTripCreate = await transcriptWelcomes(db, customerId);
await getApp(session);
wPoints.afterSecondGet = await transcriptWelcomes(db, customerId);
const welcomeClaims = await welcomeClaimRows(db, onboardSess);
out.checkW = { points: wPoints, welcomeClaimRows: welcomeClaims };
const wOk = Object.values(wPoints).every((p) => p.count === 1 && !p.hasLink);
out.http.W = 200;
out.checks.W = wOk ? 'PASS' : 'FAIL';

const chrome5 = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const p5 = await chrome5.newPage();
await p5.goto(`${BASE}/vacation-app.html?session=${encodeURIComponent(session)}`, { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const chatShot = artifactPath('chat.png');
await p5.screenshot({ path: chatShot, fullPage: true });
const chatHtml = await p5.content();
await chrome5.close();
out.checkINVUI = { chatShot, chatHits: inviteUiHits(chatHtml) };
out.http['INV-UI'] = 200;
const tripRow = tripId ? (await db`select start_date, end_date, destination from trips where id=${tripId}`)[0] : null;
const tripTurnDb = tripId ? await turnRow(db, tripId, 'Maui March%') : null;
const tripBlocked = tripTurnDb?.payload?.blockedReasons || tripMsg.json.blockedReasons || [];
const tripIntakeBlock = tripBlocked.some((r) => String(r).includes('first_intake')) || tripMsg.json.status === 'blocked' || tripMsg.json.error === 'first_intake_reply_flagged';
out.http['5'] = tripMsg.status;
out.checks['5'] = tripMsg.status === 201 && !tripIntakeBlock && ent?.trip_id === tripId && tripRow?.start_date ? 'PASS' : 'FAIL';
out.check5 = { tripId, tripRow, ent, screenshot: chatShot, intakeBlock: { tripBlocked, tripIntakeBlock } };

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
out.http.I = inviteRes.status;
const iOwnerOk = new RegExp(ownerDisplay?.display_name?.split(/\s+/)[0] || 'Shepherd', 'i').test(iOutboundAll[0]?.subject || '');
const iTitleOk = tripTitle && (iOutboundAll[0]?.subject || '').includes(tripTitle);
out.checks.I = inviteRes.status === 200 && iOutboundAll.length === 1 && iOutboundAll[0]?.status === 'sent' && iLinkOk && iOwnerOk && iTitleOk ? 'PASS' : 'FAIL';

const t6Started = Date.now();
const t6 = await postItineraryTimed(session, { tripId, text: 'recommend taco spots near Kaanapali Maui' }, 60000);
const t6db = tripId ? await turnRow(db, tripId, 'recommend taco%') : null;
const ps6 = t6.json.placeSearch || t6db?.payload?.placeSearch;
const brave6 = braveFromProviders(ps6);
const taco6 = t6db?.request_id ? await braveTacos(db, tripId, t6db.request_id) : [];
const leak6 = (ps6?.survivingPriorDbTitles || []).includes(DECOY_TITLE);
const st6 = t6.json.stageTimings || t6db?.payload?.stageTimings || null;
const st6Keys = ['classifierMs','searchMs','judgeMs','replyMs','gateMs'];
const st6Ok = st6 && st6Keys.every((k) => Number.isFinite(Number(st6[k])));
out.check6 = { http: t6.status, elapsedMs: t6.elapsedMs, stageTimings: st6, brave: brave6, anchor: ps6?.anchor, searchCenter: ps6?.searchCenter, braveTacoRows: taco6, diag: fullDiag(t6db?.payload, ps6) };
out.http['6'] = t6.status;
out.checks['6'] = t6.status >= 200 && t6.status < 300 && t6.status !== 504 && t6.elapsedMs < 60000 && st6Ok && /taco/i.test(brave6?.query || '') && brave6?.status === 'ok' && taco6.length > 0 && !leak6 ? 'PASS' : 'FAIL';

const hTurn = await postItinerary(session, { tripId, text: "We're staying at the Hyatt Regency Maui in Kaanapali." });
const hotels = tripId ? await db`select id, title, category, source, location, description, metadata from trip_things where trip_id=${tripId} and category='hotel' order by created_at` : [];
const hDb = tripId ? await customerTurnRow(db, tripId, '%Hyatt Regency Maui%') : null;
const hyatt = hotels.find((h) => normalizePlaceName(h.title) === normalizePlaceName(HYATT_CANON)) || hotels.find((h) => /hyatt/i.test(h.title || '')) || hotels[0];
const hThing = thingReport(hyatt);
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
out.http.H = hTurn.status;
out.checks.H = hTurn.status >= 200 && hTurn.status < 300 && hyattThingPass(hThing, hyatt) ? 'PASS' : 'FAIL';

const tripMetaAfterH = tripId ? (await db`select metadata from trips where id=${tripId} limit 1`)[0]?.metadata : null;
const publicUrlAfterH = tripMetaAfterH?.publicUrl || tripMetaAfterH?.public_url || '';
const shareSlug = tripId ? intakeShareSlug(tripId) : '';
let sharedApi = null;
if (shareSlug) {
  const sr = await fetch(`${BASE}/api/shared/${shareSlug}`);
  sharedApi = { status: sr.status, json: await sr.json().catch(() => ({})) };
}
const chromeMap = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const mapPage = await chromeMap.newPage();
const mapUrl = publicUrlAfterH || (shareSlug ? `${BASE}/shared/${shareSlug}/` : '');
let mapCapture = { mapUrl, mapState: null, mapConsoleErrors: [] };
if (mapUrl) mapCapture = { mapUrl, ...(await mapSharedTripState(mapPage, mapUrl)) };
const mapShot = artifactPath('trip-map.png');
await mapPage.screenshot({ path: mapShot, fullPage: true });
const budgetShot = artifactPath('shared-budget.png');
const budgetCheck = mapUrl
  ? await sharedBudgetTabCheck(mapPage, sharedApi?.json?.budget || [])
  : { tabPresent: false, clicked: false, hardcoded: [], pageErrors: {} };
if (budgetCheck.clicked) await mapPage.screenshot({ path: budgetShot, fullPage: true });
const logoShot = artifactPath('shared-logo-chips.png');
const logoHotels = mapUrl ? await sharedLogoChipMetrics(mapPage, 'Hotels') : { pass: false, rows: [] };
const logoCars = mapUrl ? await sharedLogoChipMetrics(mapPage, 'Cars') : { pass: false, rows: [] };
if (logoHotels.clicked || logoCars.clicked) await mapPage.screenshot({ path: logoShot, fullPage: true });
const sharedHtml = await mapPage.content();
await chromeMap.close();
const productMapGrade = gradeLeafletProductMap(mapCapture.productMapState, mapCapture.mapConsoleErrors);
const mapGrade = gradeMapBar(mapCapture.mapState, mapCapture.mapConsoleErrors);
out.checkMAP = {
  publicUrl: publicUrlAfterH,
  shareSlug,
  sharedApiPlaces: (sharedApi?.json?.places || []).length,
  mapCapture,
  productMapGrade,
  mapGrade,
  mapShot,
  sharedUiHits: inviteUiHits(sharedHtml),
};
out.checkBUD = {
  budgetCheck,
  budgetShot: budgetCheck.clicked ? budgetShot : null,
  apiBudgetLines: (sharedApi?.json?.budget || []).length,
};
out.checkLOGO = { hotels: logoHotels, cars: logoCars, logoShot: (logoHotels.rows.length || logoCars.rows.length) ? logoShot : null };
out.http.MAP = 200;
out.http.BUD = 200;
out.http.LOGO = 200;
const budPass = Boolean(publicUrlAfterH)
  && (sharedApi?.json?.places?.length || 0) >= 1
  && budgetCheck.tabPresent
  && budgetCheck.clicked
  && budgetCheck.hardcoded.length === 0
  && !budgetCheck.pageErrors?.mapError;
out.checks.BUD = budPass ? 'PASS' : 'FAIL';
const logoPass = logoHotels.pass && logoCars.pass && logoHotels.clicked && logoCars.clicked;
out.checks.LOGO = logoPass ? 'PASS' : 'FAIL';
out.checks.MAP = Boolean(publicUrlAfterH) && (sharedApi?.json?.places?.length || 0) >= 1 && productMapGrade.pass ? 'PASS' : 'FAIL';
out.checks['INV-UI'] = (out.checkINVUI?.chatHits || []).length === 0 && (out.checkMAP?.sharedUiHits || []).length === 0 ? 'PASS' : 'FAIL';

const t6b = await postItinerary(session, { tripId, text: 'best tacos near our hotel' });
const t6bdb = tripId ? await turnRow(db, tripId, 'best tacos%') : null;
const ps6b = t6b.json.placeSearch || t6bdb?.payload?.placeSearch;
const brave6b = braveFromProviders(ps6b);
const anchor = ps6b?.anchor;
const taco6b = t6bdb?.request_id ? await braveTacos(db, tripId, t6bdb.request_id) : [];
const hyLat = Number(hThing?.lat);
const sc = ps6b?.searchCenter;
const nearHyatt = sc && Number.isFinite(hyLat) && Math.abs(Number(sc.lat) - hyLat) < 0.15;
out.check6b = { http: t6b.status, brave: brave6b, query: brave6b?.query, anchor, searchCenter: sc, diag: fullDiag(t6bdb?.payload, ps6b) };
out.http['6b'] = t6b.status;
const t6bClassifierFail = t6bdb?.payload?.placeSearch?.error === 'turn_classifier_failed' || t6b.status === 502;
out.checks['6b'] = t6b.status === 201 && !t6bClassifierFail && brave6b?.status === 'ok' && Number(brave6b?.resultCount) > 0 && anchorMatchesRealHyatt(anchor, sc) ? 'PASS' : 'FAIL';

const tTurn = await postItinerary(session, { tripId, text: 'tacos near our hotel' });
const tDb = tripId ? await turnRow(db, tripId, 'tacos near our hotel%') : null;
const tPs = tTurn.json.placeSearch || tDb?.payload?.placeSearch;
const tClass = classifierSnapshot(tDb?.payload);
const tBrave = braveFromProviders(tPs);
const tSc = tPs?.searchCenter;
const tNearLodging = tSc && Number.isFinite(hyLat) && Math.abs(Number(tSc.lat) - hyLat) < 0.2;
out.checkT = { http: tTurn.status, classifier: tClass, brave: tBrave, anchor: tPs?.anchor, searchCenter: tSc, diag: fullDiag(tDb?.payload, tPs) };
out.http.T = tTurn.status;
const tReply = tTurn.json.reply || '';
const tResults = tPs?.results || tDb?.payload?.placeSearch?.results || [];
const tViolation = inTurnPlaceReplyViolation(tReply, tResults);
const tMarchLeak = /\bMarch\b/i.test(tReply) && !/march\s+\d/i.test(tReply);
out.checkT.replySnippet = tReply.slice(0, 400);
out.checkT.violation = tViolation;
out.checkT.marchLeak = tMarchLeak;
const tPersist = persistedTurnClassifier(tDb?.payload);
out.checkT.persistedCategory = tPersist.category;
out.checks.T = tTurn.status === 201 && tPersist.category === 'restaurant' && tClass.targetKind === 'category' && tNearLodging && tBrave?.status === 'ok' && !tViolation && !tMarchLeak ? 'PASS' : 'FAIL';

const clTurn = await postItinerary(session, { tripId, text: `please invite Kim at ${CL_EMAIL}` });
const clInvite = (await db`
  select id, trip_id, requested_for, status, metadata from vacation_collaborator_invites
  where owner_customer_id=${customerId} and metadata->>'email'=${CL_EMAIL} order by created_at desc limit 1`)[0];
const clOut = (await db`select id, status, provider_message_id, to_email from outbound_emails where customer_id=${customerId} and to_email=${CL_EMAIL} order by created_at desc limit 1`)[0];
const clReply = clTurn.json.reply || '';
const clBad = /welcome,\s*Kim/i.test(clReply) || /\bKim\b.*joining the trip/i.test(clReply);
const clGood = /emailed|pending|accept|invite/i.test(clReply);
const clInviteOk = clTurn.json.turnActionResults?.invite?.ok === true || clInvite?.id;
out.checkCL = { http: clTurn.status, reply: clReply, inviteDb: clInvite, outboundEmail: clOut, turnActionResults: clTurn.json.turnActionResults };
out.http.CL = clTurn.status;
out.checks.CL = clTurn.status === 201 && clOut?.status === 'sent' && clInviteOk && clGood && !clBad ? 'PASS' : 'FAIL';

const w7 = await postItinerary(session, { tripId, text: "what's the weather and any events that week" });
const w7db = tripId ? await turnRow(db, tripId, '%weather%') : null;
const ws = w7db?.payload?.webSearch || w7.json.webSearch;
out.http['7'] = w7.status;
out.checks['7'] = w7.status === 201 && ws?.status === 'ok' && (ws?.providers || []).includes('tavily') ? 'PASS' : 'FAIL';
out.check7 = { webSearch: ws };

const before8 = tripId ? (await db`select count(*)::int n from trip_things where trip_id=${tripId}`)[0].n : 0;
const land = await postItinerary(session, { tripId, text: 'we land in Maui at 3pm' });
const after8 = tripId ? (await db`select count(*)::int n from trip_things where trip_id=${tripId}`)[0].n : 0;
const landDb = tripId ? await turnRow(db, tripId, 'we land%') : null;
out.check8 = { http: land.status, status: land.json.status, thingsDelta: after8 - before8, diag: fullDiag(landDb?.payload, landDb?.payload?.placeSearch) };
out.http['8'] = land.status;
out.checks['8'] = land.status >= 200 && land.status < 300 && land.json.status !== 'turn_classifier_failed' && after8 - before8 === 0 ? 'PASS' : 'FAIL';

const h2Email = `shepherd-h2-${SHA7}-${RUN_TS}@resend.dev`;
const H2_CREATE_TEXT = "Maui March 10-17 2027 with my wife — we're staying at Kihei Kai Nani in Kihei.";
const h2Coupon = await fetch(`${BASE}/api/checkout-coupon`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ firstName: 'H2', lastName: 'Kihei', email: h2Email, couponCode: couponH2, orderBump: false, photoMemories: false }),
});
const h2Json = JSON.parse((await h2Coupon.text()).split('\nHTTP:')[0]);
const h2Session = h2Json.session?.token;
await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${h2Session}`)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acceptedByName: 'H2', checkboxConfirmed: true }) });
await postItinerary(h2Session, { text: 'hi' });
const h2Trip = await postItinerary(h2Session, { text: H2_CREATE_TEXT });
const h2TripId = h2Trip.json.trip?.id;
const h2Hotels = h2TripId ? await db`select id, title, source, location, description, metadata from trip_things where trip_id=${h2TripId} and category='hotel' order by created_at` : [];
const h2Db = h2TripId ? await customerTurnRow(db, h2TripId, 'Maui March%') : null;
const h2Bundle = lookupBundle(h2Db?.payload);
const h2Raw = h2Hotels[0];
const h2Thing = thingReport(h2Raw);
const h2SiteRes = h2Session ? await fetch(`${BASE}/api/vacation-itinerary?session=${encodeURIComponent(h2Session)}`) : null;
const h2Site = h2SiteRes ? await h2SiteRes.json().catch(() => ({})) : {};
const h2HotelThings = (h2Site.things || []).filter((t) => t.category === 'hotel');
const creationReply = String(h2Trip.json.reply || '');
const creationMentionsKihei = /kihei\s+kai\s+nani/i.test(creationReply) || /kihei\s+kai\s+nani/i.test(h2Db?.body || '');
out.checkH2 = {
  http: h2Trip.status,
  tripId: h2TripId,
  creationReply: creationReply.slice(0, 400),
  creationMentionsKihei,
  hotelCount: h2Hotels.length,
  hotelThing: h2Thing,
  hotels: h2Hotels.map(thingReport),
  hotelsTabCount: h2HotelThings.length,
  hotelsTabSample: h2HotelThings.map((t) => ({ title: t.title, address: t.location?.address || t.description })),
  lodgingOutcome: h2Db?.payload?.lodgingOutcome || h2Db?.payload?.liveTranscript?.lodgingOutcome || null,
  lodgingTurnPayload: h2Db?.payload || null,
  intakeLodgingLookup: h2Db?.payload?.intakeLodgingLookup || null,
  pickRanking: h2Bundle.pickRanking,
  rawResults: h2Bundle.rawResults,
  diag: fullDiag(h2Db?.payload),
  siteHttp: h2SiteRes?.status,
};
out.http.H2 = h2Trip.status;
const h2HotelsTabOk = h2HotelThings.some((t) => String(t.location?.address || t.description || '').includes('2495'));
const h2AddrOk = h2Hotels.length === 1 && String(h2Thing?.address || '').includes('2495') && h2Thing?.providerId;
const h2OneHotelAtShip = h2Hotels.length === 1;
out.checkH2.h2OneHotelAtShip = h2OneHotelAtShip;
out.checks.H2 = h2Trip.status >= 200 && h2Trip.status < 300 && h2Trip.status !== 502 && creationMentionsKihei && h2AddrOk && h2HotelsTabOk && h2OneHotelAtShip ? 'PASS' : 'FAIL';

const mTurn = await postItinerary(session, { tripId, text: 'farmers market near Kihei' });
const mDb = tripId ? await turnRow(db, tripId, 'farmers market%') : null;
const mReply = mTurn.json.reply || mDb?.body || '';
const mPs = mTurn.json.placeSearch || mDb?.payload?.placeSearch;
const mThings = tripId ? await db`select title, category, metadata, source from trip_things where trip_id=${tripId} order by created_at desc limit 30` : [];
const mMarketRows = mThings.filter((t) => /market|farm/i.test(String(t.metadata?.categoryName || t.category || '')) || /market/i.test(t.title || ''));
const mGrocery = /grocery|supermarket|safeway|foodland/i.test(mReply) && !/farmers?\s+market/i.test(mReply);
const mHonestNo = /no results|couldn't find|could not find|nothing specific/i.test(mReply);
const mRealMarket = mMarketRows.length > 0 || /farmers?\s+market/i.test(mReply);
out.checkM = { http: mTurn.status, reply: mReply.slice(0, 500), placeSearch: mPs, marketRows: mMarketRows.slice(0, 5), diag: fullDiag(mDb?.payload, mPs) };
out.http.M = mTurn.status;
out.checks.M = mTurn.status >= 200 && mTurn.status < 300 && !ERROR_REPLY_RE.test(mReply) && !mGrocery && (mRealMarket || mHonestNo) ? 'PASS' : 'FAIL';

const rTurn = await postItinerary(session, { tripId, text: 'coffee shops near Kihei' });
const rDb = tripId ? await turnRow(db, tripId, 'coffee shops near Kihei%') : null;
const rPs = rTurn.json.placeSearch || rDb?.payload?.placeSearch;
const rReply = rTurn.json.reply || '';
const rOffersOutside = OUTSIDE_KIHEI_RE.test(rReply);
const rAnchorRejected = Number(rPs?.anchorRadiusRejected ?? rDb?.payload?.placeSearch?.anchorRadiusRejected ?? 0);
out.checkR = { http: rTurn.status, anchorRadiusRejected: rAnchorRejected, replySnippet: rReply.slice(0, 500), diag: fullDiag(rDb?.payload, rPs) };
out.http.R = rTurn.status;
const rPersist = persistedTurnClassifier(rDb?.payload);
const rClass = classifierSnapshot(rDb?.payload);
const rClassifierFail = rTurn.status === 502 || rClass.reason === 'turn_classifier_failed' || String(rPs?.error || '').includes('turn_classifier_failed') || String(rDb?.payload?.placeSearch?.error || '').includes('category unknown');
const rResultRows = rPs?.results || rDb?.payload?.placeSearch?.results || [];
const rCoffee = gradeCoffeeReplyRows(rResultRows);
out.checkR = {
  ...(out.checkR || {}),
  persistedCategory: rPersist.category,
  classifier: rClass,
  coffeeRows: rCoffee.rows,
  coffeeFailures: rCoffee.failures,
};
out.checks.R = rTurn.status >= 200 && rTurn.status < 300 && !rOffersOutside && !rClassifierFail && Boolean(rPersist.category) && rCoffee.pass ? 'PASS' : 'FAIL';

const kClass = await classifyTripIntake({ text: 'farmers market near Kihei', env: process.env });
out.checkK = { category: kClass?.category || kClass?.classification?.category, ok: kClass?.ok, turnKind: kClass?.turnKind };
out.http.K = 200;
out.checks.K = String(kClass?.category || '').toLowerCase() === 'market' ? 'PASS' : 'FAIL';

const oTurn = await postItinerary(session, { tripId, text: 'Hi Shepherd — quick question about our Maui trip' });
const oDb = tripId ? await turnRow(db, tripId, '%quick question%') : null;
const oReply = oTurn.json.reply || '';
const oBlocked = oDb?.payload?.blockedReasons || oTurn.json.blockedReasons || [];
const oFail = oDb?.payload?.replyFailure || oTurn.json.replyFailure || null;
const oGreets = /Shepherd/i.test(oReply);
out.checkO = { http: oTurn.status, reply: oReply.slice(0, 400), greetsOwner: oGreets, blockedReasons: oBlocked, replyFailure: oFail, diag: fullDiag(oDb?.payload) };
out.http.O = oTurn.status;
const oUnsourced = /unsourced_place|reply cites place not from/i.test(String(oFail || ''));
out.checks.O = oTurn.status >= 200 && oTurn.status < 300 && oGreets && !oUnsourced
  && !String(oFail || '').includes('reply_action_claim') && !(oBlocked || []).some((r) => String(r).includes('reply_action_claim')) ? 'PASS' : 'FAIL';

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
});
