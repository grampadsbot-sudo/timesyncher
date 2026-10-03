import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/workspace/node_modules/puppeteer-core');
import { normalizePlaceName } from '/workspace/src/vacation/intake-lodging-candidate.mjs';
import { classifyTripIntake } from '/workspace/src/vacation/trip-intake-classify.mjs';
import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import { inTurnPlaceReplyViolation } from '/workspace/src/vacation/chat-place-search.mjs';
import { gradeCoffeeReplyRows } from './shepherd-staging-smoke-lib.mjs';
import {
  postItinerary,
  postItineraryTimed,
  getApp,
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

/**
 * @param {object} ctx
 * @param {Function} ctx.runCheck
 * @param {Record<string, unknown>} ctx.out
 * @param {import('/workspace/src/vacation/db.mjs').sql} ctx.db
 * @param {Record<string, unknown>} ctx.state mutable run state (session, tripId, replies, …)
 */
export async function runShepherdStagingSmokeMainChecks(ctx) {
  const {
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
  } = ctx;

  const wPoints = {};

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
    state.smokeEmail = `shepherd-${SHA7}-${RUN_TS}@resend.dev`;
    await page.type('input[name="firstName"]', 'Shepherd');
    await page.type('input[name="lastName"]', SHA7);
    await page.type('input[name="email"]', state.smokeEmail);
    await browser.close();
    return { pass: price === '$37', http: 200 };
  }, { timeoutMs: 90000 });

  await runCheck('3', async ({ setStage }) => {
    setStage('checkout-coupon main');
    const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Shepherd', lastName: SHA7, email: state.smokeEmail, couponCode: couponMain, orderBump: false, photoMemories: false,
      }),
    });
    const couponJson = JSON.parse((await couponRes.text()).split('\nHTTP:')[0]);
    state.session = couponJson.session?.token;
    state.customerId = couponJson.redemption?.customer_id;
    const tripsAfter = (await db`select count(*)::int n from trips where customer_id=${state.customerId}`)[0].n;
    await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${state.session}`)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acceptedByName: 'Shepherd', checkboxConfirmed: true }),
    });
    return { pass: couponRes.status === 200 && tripsAfter === 0, http: couponRes.status };
  }, { timeoutMs: 60000 });

  await runCheck('4', async ({ setStage }) => {
    setStage('onboarding hi');
    await getApp(state.session);
    wPoints.afterTermsGet = await transcriptWelcomes(db, state.customerId);
    state.hi = await postItinerary(state.session, { text: 'hi' });
    wPoints.afterHi = await transcriptWelcomes(db, state.customerId);
    return { pass: state.hi.status === 200 && /where|when/i.test(state.hi.json.reply || ''), http: state.hi.status };
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
    const onboardSess = (await db`select id from onboarding_sessions where token=${state.session} limit 1`)[0]?.id;
    state.tripMsg = await postItinerary(state.session, { text: 'Maui March 10-17 2027 with my wife' });
    state.tripId = state.tripMsg.json.trip?.id || (await db`select id from trips where customer_id=${state.customerId} order by created_at desc limit 1`)[0]?.id;
    wPoints.afterTripCreate = await transcriptWelcomes(db, state.customerId);
    await getApp(state.session);
    wPoints.afterSecondGet = await transcriptWelcomes(db, state.customerId);
    const welcomeClaims = await welcomeClaimRows(db, onboardSess);
    out.checkW = { points: wPoints, welcomeClaimRows: welcomeClaims };
    const wOk = Object.values(wPoints).every((p) => p.count === 1 && !p.hasLink);
    return { pass: wOk, http: 200 };
  }, { timeoutMs: 60000 });

  await runCheck('5', async ({ setStage, registerBrowser }) => {
    setStage('trip create + chat screenshot');
    state.tripTitle = state.tripId ? (await db`select title from trips where id=${state.tripId} limit 1`)[0]?.title : '';
    const ent = (await db`select trip_id from entitlements where customer_id=${state.customerId} and status='active' limit 1`)[0];
    const chrome5 = await puppeteer.launch(CHROME);
    registerBrowser(chrome5);
    const p5 = await chrome5.newPage();
    await p5.goto(`${BASE}/vacation-app.html?session=${encodeURIComponent(state.session)}`, { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 3000));
    const chatShot = artifactPath('chat.png');
    await p5.screenshot({ path: chatShot, fullPage: true });
    const chatHtml = await p5.content();
    await chrome5.close();
    out.checkINVUI = { chatShot, chatHits: inviteUiHits(chatHtml) };
    const tripRow = state.tripId ? (await db`select start_date, end_date, destination from trips where id=${state.tripId}`)[0] : null;
    const tripTurnDb = state.tripId ? await turnRow(db, state.tripId, 'Maui March%') : null;
    const tripBlocked = tripTurnDb?.payload?.blockedReasons || state.tripMsg.json.blockedReasons || [];
    const tripIntakeBlock = tripBlocked.some((r) => String(r).includes('first_intake')) || state.tripMsg.json.status === 'blocked' || state.tripMsg.json.error === 'first_intake_reply_flagged';
    out.check5 = { tripId: state.tripId, tripRow, ent, screenshot: chatShot, intakeBlock: { tripBlocked, tripIntakeBlock } };
    const pass = state.tripMsg.status === 201 && !tripIntakeBlock && ent?.trip_id === state.tripId && tripRow?.start_date;
    return { pass, http: state.tripMsg.status };
  }, { timeoutMs: 90000 });

  await runCheck('I', async ({ setStage }) => {
    setStage('collaborator invite Alex');
    const inviteRes = await postItinerary(state.session, { tripId: state.tripId, action: 'collaborator-invite', seats: [{ name: 'Invite Alex', email: INVITE_EMAIL }] });
    const iInviteRow = (await db`
      select id, trip_id, status, metadata from vacation_collaborator_invites
      where owner_customer_id=${state.customerId} and metadata->>'email'=${INVITE_EMAIL} order by created_at desc limit 1`)[0];
    const iOutboundAll = await db`
      select id, status, subject, to_email, html_body, text_body, metadata from outbound_emails
      where customer_id=${state.customerId} and to_email=${INVITE_EMAIL} order by created_at asc`;
    const ownerDisplay = (await db`select display_name, first_name from customers where id=${state.customerId} limit 1`)[0];
    const iAcceptPath = iInviteRow?.id ? `/accept/vacation-collaborator-${iInviteRow.id}` : '';
    const iHtml = String(iOutboundAll[0]?.html_body || iOutboundAll[0]?.text_body || '');
    const iLinkOk = iHtml.includes(iAcceptPath);
    out.checkI = {
      http: inviteRes.status,
      inviteId: iInviteRow?.id,
      outboundCount: iOutboundAll.length,
      outboundEmail: iOutboundAll[0],
      ownerDisplay,
      tripTitle: state.tripTitle,
      acceptLinkOk: iLinkOk,
      expectedAcceptPath: iAcceptPath,
    };
    const iOwnerOk = new RegExp(ownerDisplay?.display_name?.split(/\s+/)[0] || 'Shepherd', 'i').test(iOutboundAll[0]?.subject || '');
    const iTitleOk = state.tripTitle && (iOutboundAll[0]?.subject || '').includes(state.tripTitle);
    const pass = inviteRes.status === 200 && iOutboundAll.length === 1 && iOutboundAll[0]?.status === 'sent' && iLinkOk && iOwnerOk && iTitleOk;
    return { pass, http: inviteRes.status };
  }, { timeoutMs: 60000 });

  await runCheck('6', async ({ setStage }) => {
    setStage('taco search Kaanapali');
    const t6 = await postItineraryTimed(state.session, { tripId: state.tripId, text: 'recommend taco spots near Kaanapali Maui' }, 60000);
    const t6db = state.tripId ? await turnRow(db, state.tripId, 'recommend taco%') : null;
    state.ps6 = t6.json.placeSearch || t6db?.payload?.placeSearch;
    const brave6 = braveFromProviders(state.ps6);
    const taco6 = t6db?.request_id ? await braveTacos(db, state.tripId, t6db.request_id) : [];
    state.leak6 = (state.ps6?.survivingPriorDbTitles || []).includes(DECOY_TITLE);
    const st6 = t6.json.stageTimings || t6db?.payload?.stageTimings || null;
    const st6Keys = ['classifierMs', 'searchMs', 'judgeMs', 'replyMs', 'gateMs'];
    const st6Ok = st6 && st6Keys.every((k) => Number.isFinite(Number(st6[k])));
    out.check6 = {
      http: t6.status, elapsedMs: t6.elapsedMs, stageTimings: st6, brave: brave6, anchor: state.ps6?.anchor,
      searchCenter: state.ps6?.searchCenter, braveTacoRows: taco6, diag: fullDiag(t6db?.payload, state.ps6),
    };
    const pass = t6.status >= 200 && t6.status < 300 && t6.status !== 504 && t6.elapsedMs < 60000 && st6Ok
      && /taco/i.test(brave6?.query || '') && brave6?.status === 'ok' && taco6.length > 0 && !state.leak6;
    return { pass, http: t6.status };
  }, { timeoutMs: 60000 });

  await runCheck('H', async ({ setStage }) => {
    setStage('Hyatt lodging intake');
    state.hTurn = await postItinerary(state.session, { tripId: state.tripId, text: "We're staying at the Hyatt Regency Maui in Kaanapali." });
    const hotels = state.tripId ? await db`select id, title, category, source, location, description, metadata from trip_things where trip_id=${state.tripId} and category='hotel' order by created_at` : [];
    const hDb = state.tripId ? await customerTurnRow(db, state.tripId, '%Hyatt Regency Maui%') : null;
    const hyatt = hotels.find((h) => normalizePlaceName(h.title) === normalizePlaceName(HYATT_CANON)) || hotels.find((h) => /hyatt/i.test(h.title || '')) || hotels[0];
    state.hThing = thingReport(hyatt);
    state.hyLat = Number(state.hThing?.lat);
    const hBundle = lookupBundle(hDb?.payload);
    out.checkH = {
      http: state.hTurn.status,
      reply: state.hTurn.json.reply?.slice(0, 200),
      hotelThing: state.hThing,
      hotelCount: hotels.length,
      lodgingTurnPayload: hDb?.payload || null,
      intakeLodgingLookup: hDb?.payload?.intakeLodgingLookup || null,
      pickRanking: hBundle.pickRanking,
      rawResults: hBundle.rawResults,
      diag: fullDiag(hDb?.payload),
    };
    return { pass: state.hTurn.status >= 200 && state.hTurn.status < 300 && hyattThingPass(state.hThing, hyatt), http: state.hTurn.status };
  }, { timeoutMs: 60000 });

  await runCheck('MAP', async ({ setStage, registerBrowser }) => {
    setStage('shared site plan map');
    const tripMetaAfterH = state.tripId ? (await db`select metadata from trips where id=${state.tripId} limit 1`)[0]?.metadata : null;
    const publicUrlAfterH = tripMetaAfterH?.publicUrl || tripMetaAfterH?.public_url || '';
    const shareSlug = state.tripId ? intakeShareSlug(state.tripId) : '';
    let sharedApi = null;
    if (shareSlug) {
      const sr = await fetch(`${BASE}/api/shared/${shareSlug}`);
      sharedApi = { status: sr.status, json: await sr.json().catch((err) => ({ _jsonError: String(err?.message || err) })) };
    }
    const chromeMap = await puppeteer.launch(CHROME);
    registerBrowser(chromeMap);
    const mapPage = await chromeMap.newPage();
    const mapUrl = publicUrlAfterH || (shareSlug ? `${BASE}/shared/${shareSlug}/` : '');
    state.sharedSite = await runSharedSiteMapBudLogoChecks({
      page: mapPage,
      mapUrl,
      publicUrlAfterH,
      shareSlug,
      sharedApi,
      artifactPath,
    });
    await chromeMap.close();
    out.checkMAP = { ...state.sharedSite.checkMAP, sharedUiHits: inviteUiHits(state.sharedSite.sharedHtml) };
    out.checkBUD = state.sharedSite.checkBUD;
    out.checkLOGO = state.sharedSite.checkLOGO;
    return { pass: state.sharedSite.checks.MAP === 'PASS', http: 200 };
  }, { timeoutMs: 90000 });

  await runCheck('BUD', async () => ({
    pass: state.sharedSite?.checks.BUD === 'PASS',
    http: 200,
  }), { timeoutMs: 60000 });

  await runCheck('LOGO', async () => ({
    pass: state.sharedSite?.checks.LOGO === 'PASS',
    http: 200,
  }), { timeoutMs: 60000 });

  await runCheck('INV-UI', async () => {
    const pass = (out.checkINVUI?.chatHits || []).length === 0 && (out.checkMAP?.sharedUiHits || []).length === 0;
    return { pass, http: 200 };
  }, { timeoutMs: 60000 });

  await runCheck('6b', async ({ setStage }) => {
    setStage('tacos near hotel anchor');
    const t6b = await postItinerary(state.session, { tripId: state.tripId, text: 'best tacos near our hotel' });
    const t6bdb = state.tripId ? await turnRow(db, state.tripId, 'best tacos%') : null;
    state.ps6b = t6b.json.placeSearch || t6bdb?.payload?.placeSearch;
    const brave6b = braveFromProviders(state.ps6b);
    const anchor = state.ps6b?.anchor;
    const sc = state.ps6b?.searchCenter;
    out.check6b = { http: t6b.status, brave: brave6b, query: brave6b?.query, anchor, searchCenter: sc, diag: fullDiag(t6bdb?.payload, state.ps6b) };
    const t6bClassifierFail = t6bdb?.payload?.placeSearch?.error === 'turn_classifier_failed' || t6b.status === 502;
    const pass = t6b.status === 201 && !t6bClassifierFail && brave6b?.status === 'ok' && Number(brave6b?.resultCount) > 0 && anchorMatchesRealHyatt(anchor, sc);
    return { pass, http: t6b.status };
  }, { timeoutMs: 60000 });

  await runCheck('T', async ({ setStage }) => {
    setStage('tacos category turn');
    state.tTurn = await postItinerary(state.session, { tripId: state.tripId, text: 'tacos near our hotel' });
    const tDb = state.tripId ? await turnRow(db, state.tripId, 'tacos near our hotel%') : null;
    const tPs = state.tTurn.json.placeSearch || tDb?.payload?.placeSearch;
    const tClass = classifierSnapshot(tDb?.payload);
    const tBrave = braveFromProviders(tPs);
    const tSc = tPs?.searchCenter;
    const tNearLodging = tSc && Number.isFinite(state.hyLat) && Math.abs(Number(tSc.lat) - state.hyLat) < 0.2;
    const tReply = state.tTurn.json.reply || '';
    const tResults = tPs?.results || tDb?.payload?.placeSearch?.results || [];
    const tViolation = inTurnPlaceReplyViolation(tReply, tResults);
    const tMarchLeak = /\bMarch\b/i.test(tReply) && !/march\s+\d/i.test(tReply);
    const tPersist = persistedTurnClassifier(tDb?.payload);
    out.checkT = {
      http: state.tTurn.status,
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
    const pass = state.tTurn.status === 201 && tPersist.category === 'restaurant' && tClass.targetKind === 'category' && tNearLodging && tBrave?.status === 'ok' && !tViolation && !tMarchLeak;
    return { pass, http: state.tTurn.status };
  }, { timeoutMs: 60000 });

  await runCheck('CL', async ({ setStage }) => {
    setStage('invite Kim');
    const clTurn = await postItinerary(state.session, { tripId: state.tripId, text: `please invite Kim at ${CL_EMAIL}` });
    const clInvite = (await db`
      select id, trip_id, requested_for, status, metadata from vacation_collaborator_invites
      where owner_customer_id=${state.customerId} and metadata->>'email'=${CL_EMAIL} order by created_at desc limit 1`)[0];
    const clOut = (await db`select id, status, provider_message_id, to_email from outbound_emails where customer_id=${state.customerId} and to_email=${CL_EMAIL} order by created_at desc limit 1`)[0];
    state.clReply = clTurn.json.reply || '';
    const clBad = /welcome,\s*Kim/i.test(state.clReply) || /\bKim\b.*joining the trip/i.test(state.clReply);
    const clGood = /emailed|pending|accept|invite/i.test(state.clReply);
    const clInviteOk = clTurn.json.turnActionResults?.invite?.ok === true || clInvite?.id;
    out.checkCL = { http: clTurn.status, reply: state.clReply, inviteDb: clInvite, outboundEmail: clOut, turnActionResults: clTurn.json.turnActionResults };
    const pass = clTurn.status === 201 && clOut?.status === 'sent' && clInviteOk && clGood && !clBad;
    return { pass, http: clTurn.status };
  }, { timeoutMs: 60000 });

  await runCheck('7', async ({ setStage }) => {
    setStage('weather web search');
    const w7 = await postItinerary(state.session, { tripId: state.tripId, text: "what's the weather and any events that week" });
    const w7db = state.tripId ? await turnRow(db, state.tripId, '%weather%') : null;
    const ws = w7db?.payload?.webSearch || w7.json.webSearch;
    out.check7 = { webSearch: ws };
    return { pass: w7.status === 201 && ws?.status === 'ok' && (ws?.providers || []).includes('tavily'), http: w7.status };
  }, { timeoutMs: 60000 });

  await runCheck('8', async ({ setStage }) => {
    setStage('land time no things');
    const before8 = state.tripId ? (await db`select count(*)::int n from trip_things where trip_id=${state.tripId}`)[0].n : 0;
    const land = await postItinerary(state.session, { tripId: state.tripId, text: 'we land in Maui at 3pm' });
    const after8 = state.tripId ? (await db`select count(*)::int n from trip_things where trip_id=${state.tripId}`)[0].n : 0;
    const landDb = state.tripId ? await turnRow(db, state.tripId, 'we land%') : null;
    out.check8 = { http: land.status, status: land.json.status, thingsDelta: after8 - before8, diag: fullDiag(landDb?.payload, landDb?.payload?.placeSearch) };
    return { pass: land.status >= 200 && land.status < 300 && land.json.status !== 'turn_classifier_failed' && after8 - before8 === 0, http: land.status };
  }, { timeoutMs: 60000 });

  await runCheck('H2', async ({ setStage }) => {
    setStage('H2 Kihei Kai Nani intake');
    const h2Email = `shepherd-h2-${SHA7}-${RUN_TS}@resend.dev`;
    const H2_CREATE_TEXT = "Maui March 10-17 2027 with my wife — we're staying at Kihei Kai Nani in Kihei.";
    const h2Coupon = await fetch(`${BASE}/api/checkout-coupon`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'H2', lastName: 'Kihei', email: h2Email, couponCode: couponH2, orderBump: false, photoMemories: false }),
    });
    const h2Json = JSON.parse((await h2Coupon.text()).split('\nHTTP:')[0]);
    const h2Session = h2Json.session?.token;
    await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${h2Session}`)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acceptedByName: 'H2', checkboxConfirmed: true }),
    });
    await postItinerary(h2Session, { text: 'hi' });
    const h2Trip = await postItinerary(h2Session, { text: H2_CREATE_TEXT });
    const h2TripId = h2Trip.json.trip?.id;
    const h2Hotels = h2TripId ? await db`select id, title, source, location, description, metadata from trip_things where trip_id=${h2TripId} and category='hotel' order by created_at` : [];
    const h2Db = h2TripId ? await customerTurnRow(db, h2TripId, 'Maui March%') : null;
    const h2Bundle = lookupBundle(h2Db?.payload);
    const h2Raw = h2Hotels[0];
    const h2Thing = thingReport(h2Raw);
    const h2SiteRes = h2Session ? await fetch(`${BASE}/api/vacation-itinerary?session=${encodeURIComponent(h2Session)}`) : null;
    const h2Site = h2SiteRes ? await h2SiteRes.json().catch((err) => ({ _jsonError: String(err?.message || err) })) : {};
    const h2HotelThings = (h2Site.things || []).filter((t) => t.category === 'hotel');
    state.creationReply = String(h2Trip.json.reply || '');
    const creationMentionsKihei = /kihei\s+kai\s+nani/i.test(state.creationReply) || /kihei\s+kai\s+nani/i.test(h2Db?.body || '');
    const h2HotelsTabOk = h2HotelThings.some((t) => String(t.location?.address || t.description || '').includes('2495'));
    const h2AddrOk = h2Hotels.length === 1 && String(h2Thing?.address || '').includes('2495') && h2Thing?.providerId;
    const h2OneHotelAtShip = h2Hotels.length === 1;
    out.checkH2 = {
      http: h2Trip.status,
      tripId: h2TripId,
      creationReply: state.creationReply.slice(0, 400),
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
      h2OneHotelAtShip,
    };
    const pass = h2Trip.status >= 200 && h2Trip.status < 300 && h2Trip.status !== 502 && creationMentionsKihei && h2AddrOk && h2HotelsTabOk && h2OneHotelAtShip;
    return { pass, http: h2Trip.status };
  }, { timeoutMs: 60000 });

  await runCheck('M', async ({ setStage }) => {
    setStage('farmers market Kihei');
    const mTurn = await postItinerary(state.session, { tripId: state.tripId, text: 'farmers market near Kihei' });
    const mDb = state.tripId ? await turnRow(db, state.tripId, 'farmers market%') : null;
    state.mReply = mTurn.json.reply || mDb?.body || '';
    const mPs = mTurn.json.placeSearch || mDb?.payload?.placeSearch;
    const mThings = state.tripId ? await db`select title, category, metadata, source from trip_things where trip_id=${state.tripId} order by created_at desc limit 30` : [];
    const mMarketRows = mThings.filter((t) => /market|farm/i.test(String(t.metadata?.categoryName || t.category || '')) || /market/i.test(t.title || ''));
    const mGrocery = /grocery|supermarket|safeway|foodland/i.test(state.mReply) && !/farmers?\s+market/i.test(state.mReply);
    const mHonestNo = /no results|couldn't find|could not find|nothing specific/i.test(state.mReply);
    const mRealMarket = mMarketRows.length > 0 || /farmers?\s+market/i.test(state.mReply);
    out.checkM = { http: mTurn.status, reply: state.mReply.slice(0, 500), placeSearch: mPs, marketRows: mMarketRows.slice(0, 5), diag: fullDiag(mDb?.payload, mPs) };
    const pass = mTurn.status >= 200 && mTurn.status < 300 && !ERROR_REPLY_RE.test(state.mReply) && !mGrocery && (mRealMarket || mHonestNo);
    return { pass, http: mTurn.status };
  }, { timeoutMs: 60000 });

  await runCheck('R', async ({ setStage }) => {
    setStage('coffee shops Kihei');
    const rTurn = await postItinerary(state.session, { tripId: state.tripId, text: 'coffee shops near Kihei' });
    const rDb = state.tripId ? await turnRow(db, state.tripId, 'coffee shops near Kihei%') : null;
    const rPs = rTurn.json.placeSearch || rDb?.payload?.placeSearch;
    state.rReply = rTurn.json.reply || '';
    const rOffersOutside = OUTSIDE_KIHEI_RE.test(state.rReply);
    const rAnchorRejected = Number(rPs?.anchorRadiusRejected ?? rDb?.payload?.placeSearch?.anchorRadiusRejected ?? 0);
    const rPersist = persistedTurnClassifier(rDb?.payload);
    const rClass = classifierSnapshot(rDb?.payload);
    const rClassifierFail = rTurn.status === 502 || rClass.reason === 'turn_classifier_failed' || String(rPs?.error || '').includes('turn_classifier_failed') || String(rDb?.payload?.placeSearch?.error || '').includes('category unknown');
    const rResultRows = rPs?.results || rDb?.payload?.placeSearch?.results || [];
    const rCoffee = gradeCoffeeReplyRows(rResultRows);
    out.checkR = {
      http: rTurn.status,
      anchorRadiusRejected: rAnchorRejected,
      replySnippet: state.rReply.slice(0, 500),
      diag: fullDiag(rDb?.payload, rPs),
      persistedCategory: rPersist.category,
      classifier: rClass,
      coffeeRows: rCoffee.rows,
      coffeeFailures: rCoffee.failures,
    };
    const pass = rTurn.status >= 200 && rTurn.status < 300 && !rOffersOutside && !rClassifierFail && Boolean(rPersist.category) && rCoffee.pass;
    return { pass, http: rTurn.status };
  }, { timeoutMs: 60000 });

  await runCheck('K', async ({ setStage }) => {
    setStage('classify farmers market');
    const kClass = await classifyTripIntake({ text: 'farmers market near Kihei', env: process.env });
    out.checkK = { category: kClass?.category || kClass?.classification?.category, ok: kClass?.ok, turnKind: kClass?.turnKind };
    return { pass: String(kClass?.category || '').toLowerCase() === 'market', http: 200 };
  }, { timeoutMs: 60000 });

  await runCheck('O', async ({ setStage }) => {
    setStage('owner greeting turn');
    const oTurn = await postItinerary(state.session, { tripId: state.tripId, text: 'Hi Shepherd — quick question about our Maui trip' });
    const oDb = state.tripId ? await turnRow(db, state.tripId, '%quick question%') : null;
    const oReply = oTurn.json.reply || '';
    const oBlocked = oDb?.payload?.blockedReasons || oTurn.json.blockedReasons || [];
    const oFail = oDb?.payload?.replyFailure || oTurn.json.replyFailure || null;
    const oGreets = /Shepherd/i.test(oReply);
    out.checkO = { http: oTurn.status, reply: oReply.slice(0, 400), greetsOwner: oGreets, blockedReasons: oBlocked, replyFailure: oFail, diag: fullDiag(oDb?.payload) };
    const oUnsourced = /unsourced_place|reply cites place not from/i.test(String(oFail || ''));
    const pass = oTurn.status >= 200 && oTurn.status < 300 && oGreets && !oUnsourced
      && !String(oFail || '').includes('reply_action_claim') && !(oBlocked || []).some((r) => String(r).includes('reply_action_claim'));
    return { pass, http: oTurn.status };
  }, { timeoutMs: 60000 });
}
