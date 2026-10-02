import { writeFileSync } from 'node:fs';
import { couponHash } from '../src/vacation/coupons.mjs';
import { createWebEditorInvite } from '../src/vacation/web-access.mjs';
import {
  isoDateFromStartsAt,
  attributeDThingRows,
  gradeDExtraRows,
  matchCollaboratorWelcome,
  a2WelcomePass,
  welcomeTranscriptTurnsForClaims,
} from './shepherd-staging-smoke-lib.mjs';
import {
  postItinerary,
  getApp,
  collabAcceptFlow,
  customerTurnRow,
  persistedTurnClassifier,
  customerVisibleReplies,
  scanErrorText,
} from './shepherd-staging-smoke-helpers.mjs';

export async function runShepherdSmokeTail(ctx) {
  const {
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
  } = ctx;

  async function freshOwnerSession(couponCode, tag, firstName = tag, lastName = SHA7) {
    const email = `shepherd-${tag}-${SHA7}-${RUN_TS}@resend.dev`;
    const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, couponCode, orderBump: false, photoMemories: false }),
    });
    const couponJson = JSON.parse((await couponRes.text()).split('\nHTTP:')[0]);
    const tok = couponJson.session?.token;
    const cid = couponJson.redemption?.customer_id;
    await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${tok}`)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acceptedByName: tag, checkboxConfirmed: true }),
    });
    return { session: tok, customerId: cid, email };
  }

  const a1Owner = await freshOwnerSession(couponA1, 'a1');
  await postItinerary(a1Owner.session, { text: 'hi' });
  await postItinerary(a1Owner.session, { text: 'Owner planning note' });
  const a1InviteRes = await postItinerary(a1Owner.session, { action: 'collaborator-invite', seats: [{ name: 'A1 Collab', email: A1_EMAIL }] });
  const a1InviteRow = (await db`
    select id, trip_id, status, metadata from vacation_collaborator_invites
    where owner_customer_id=${a1Owner.customerId} and metadata->>'email'=${A1_EMAIL} order by created_at desc limit 1`)[0];
  const a1OwnerRow = (await db`select display_name, first_name from customers where id=${a1Owner.customerId} limit 1`)[0];
  const a1OwnerFirst = String(a1OwnerRow?.first_name || a1OwnerRow?.display_name || 'a1').split(/\s+/)[0];
  const a1Flow = a1InviteRow?.id ? await collabAcceptFlow({
    inviteId: a1InviteRow.id, acceptedByName: 'A1 Collab', ownerFirstName: a1OwnerFirst, tripTitleForWelcome: 'this vacation', audience: 'collaborator_no_site',
  }) : null;
  const a1ExpectedOwnerLabel = String(a1OwnerRow?.display_name || `${a1OwnerFirst} ${SHA7}`).trim();
  const a1OwnerLabelOk = (a1Flow?.labeledOwnerSample || []).every((t) => String(t.authorLabel || '').trim() === a1ExpectedOwnerLabel);
  out.checkA1 = { inviteHttp: a1InviteRes.status, inviteDb: a1InviteRow, ownerRow: a1OwnerRow, flow: a1Flow, ownerLabelOk: a1OwnerLabelOk };
  out.http.A1 = a1Flow?.appGetStatus || a1InviteRes.status;
  let a1WelcomeDb = [];
  let a1WelcomeTurnsDb = [];
  if (a1Flow?.collabToken) {
    const a1Onboard = (await db`select id, customer_id from onboarding_sessions where token=${a1Flow.collabToken} limit 1`)[0];
    if (a1Onboard?.id) {
      a1WelcomeDb = await db`select id, welcome_for, trip_id from vacation_onboarding_welcomes where onboarding_session_id=${a1Onboard.id}`;
      const a1TranscriptPool = await db`
        select id, body, payload, speaker from transcript_turns
        where customer_id=${a1Onboard.customer_id}
          and channel in ('vacation-app', 'vacation_app')
          and speaker='app'
        order by created_at asc`;
      a1WelcomeTurnsDb = welcomeTranscriptTurnsForClaims({ welcomeRows: a1WelcomeDb, transcriptTurns: a1TranscriptPool });
    }
  }
  out.checkA1.welcomeDb = a1WelcomeDb;
  out.checkA1.welcomeTurnsDb = a1WelcomeTurnsDb.map((t) => ({ id: t.id, welcomeFor: t.payload?.welcomeFor }));
  out.checks.A1 = a1InviteRes.status === 200 && a1Flow?.acceptPageStatus === 200 && a1Flow?.termsCount === 1
    && a1Flow?.acceptPostStatus === 201 && a1WelcomeDb.length === 1 && a1WelcomeTurnsDb.length === 1
    && !/https?:\/\//i.test(a1WelcomeTurnsDb[0]?.body || '')
    && a1Flow?.missingAuthorLabelCount === 0 && a1OwnerLabelOk ? 'PASS' : 'FAIL';

  const a2Owner = await freshOwnerSession(couponA2, 'a2', A2_OWNER_FIRST, A2_OWNER_LAST);
  await postItinerary(a2Owner.session, { text: 'hi' });
  const a2TripMsg = await postItinerary(a2Owner.session, { text: 'Maui March 10-17 2027 with my wife' });
  const a2TripId = a2TripMsg.json.trip?.id;
  const a2TripTitle = a2TripId ? (await db`select title, metadata from trips where id=${a2TripId} limit 1`)[0]?.title : '';
  await postItinerary(a2Owner.session, { tripId: a2TripId, text: "We're staying at Hyatt Regency Maui in Kaanapali." });
  const a2OwnerApp = await getApp(a2Owner.session);
  const a2SiteUrl = a2OwnerApp.json?.trip?.publicUrl || a2OwnerApp.json?.trip?.siteUrl || a2OwnerApp.json?.publicUrl || '';
  const a2PublicOk = Boolean(String(a2SiteUrl || '').trim());
  const a2InviteRes = await postItinerary(a2Owner.session, { tripId: a2TripId, action: 'collaborator-invite', seats: [{ name: A2_COLLAB_NAME, email: A2_EMAIL }] });
  const a2InviteRow = (await db`
    select id, trip_id, status, metadata from vacation_collaborator_invites
    where owner_customer_id=${a2Owner.customerId} and metadata->>'email'=${A2_EMAIL} order by created_at desc limit 1`)[0];
  const a2OwnerRow = (await db`select display_name, first_name, last_name from customers where id=${a2Owner.customerId} limit 1`)[0];
  const a2OwnerFirst = String(a2OwnerRow?.first_name || A2_OWNER_FIRST).split(/\s+/)[0];
  let a2WebRedirect = null;
  let legacyGrant = null;
  if (a2InviteRow?.id && a2TripId) {
    legacyGrant = await createWebEditorInvite(db, {
      ownerCustomerId: a2Owner.customerId,
      tripId: a2TripId,
      email: A2_EMAIL,
      displayName: A2_COLLAB_NAME,
      metadata: { collaboratorInviteId: a2InviteRow.id, payer: 'owner', channel: 'email-invite' },
    });
    const redir = await fetch(legacyGrant.acceptUrl, { redirect: 'manual' });
    a2WebRedirect = { status: redir.status, location: redir.headers.get('location') };
  }
  const a2Flow = a2InviteRow?.id ? await collabAcceptFlow({
    inviteId: a2InviteRow.id, acceptedByName: A2_COLLAB_NAME, ownerFirstName: a2OwnerFirst, tripTitleForWelcome: a2TripTitle || 'this vacation',
    audience: 'collaborator', tripSiteUrl: a2SiteUrl || 'https://vacation-staging.timesyncher.com/',
  }) : null;
  let a2WelcomeDb = [];
  let a2WelcomeTurnsDb = [];
  let a2CollabCustomerId = null;
  if (a2Flow?.collabToken) {
    const collabOnboard = (await db`select id, customer_id from onboarding_sessions where token=${a2Flow.collabToken} limit 1`)[0];
    a2CollabCustomerId = collabOnboard?.customer_id || null;
    if (collabOnboard?.id) {
      a2WelcomeDb = await db`select id, welcome_for, trip_id, created_at from vacation_onboarding_welcomes where onboarding_session_id=${collabOnboard.id} order by created_at`;
      const a2TranscriptPool = await db`
        select id, body, payload, speaker from transcript_turns
        where customer_id=${collabOnboard.customer_id}
          and channel in ('vacation-app', 'vacation_app')
          and speaker='app'
        order by created_at asc`;
      a2WelcomeTurnsDb = welcomeTranscriptTurnsForClaims({ welcomeRows: a2WelcomeDb, transcriptTurns: a2TranscriptPool });
    }
  }
  const a2WelcomeMatch = matchCollaboratorWelcome({
    welcomeRows: a2WelcomeDb,
    transcriptTurns: a2WelcomeTurnsDb,
    welcomeForCustomerId: a2CollabCustomerId,
    inviteeDisplayName: A2_COLLAB_NAME,
  });
  const pHits = [...(a2Flow?.commerce?.acceptPage || []), ...(a2Flow?.commerce?.eula || []), ...(a2Flow?.commerce?.chat || [])];
  const a2RedirectOk = a2WebRedirect?.status === 302 && /\/accept\/vacation-collaborator-/.test(String(a2WebRedirect?.location || ''));
  out.checkA2 = {
    inviteHttp: a2InviteRes.status,
    inviteDb: a2InviteRow,
    flow: a2Flow,
    legacyGrantMinted: Boolean(legacyGrant?.token),
    webAccessRedirect: a2WebRedirect,
    tripSiteUrl: a2SiteUrl,
    publicUrlOk: a2PublicOk,
    welcomeDb: a2WelcomeDb,
    welcomeTurnsDb: a2WelcomeTurnsDb.map((t) => ({
      id: t.id,
      welcomeFor: t.payload?.welcomeFor,
      bodySnippet: String(t.body || '').slice(0, 160),
    })),
    welcomeMatch: a2WelcomeMatch,
    collabCustomerId: a2CollabCustomerId,
  };
  out.checkP = { commerceHits: pHits, surfaces: a2Flow?.commerce };
  out.http.A2 = a2Flow?.appGetStatus || a2InviteRes.status;
  out.http.P = 200;
  out.checks.A2 = a2InviteRes.status === 200 && a2WelcomePass(a2WelcomeMatch, { redirectOk: a2RedirectOk, publicUrlOk: a2PublicOk }) ? 'PASS' : 'FAIL';
  out.checks.P = pHits.length === 0 ? 'PASS' : 'FAIL';

  const allAppTurns = await db`select speaker, body from transcript_turns where customer_id=${customerId} and channel='vacation-app' order by created_at`;
  const errorHits = scanErrorText(customerVisibleReplies(allAppTurns, [
    mReply, rReply, hTurn.json?.reply, clReply, hi.json?.reply, tripMsg.json?.reply, creationReply, tTurn.json?.reply,
  ]));
  out.checkE = { errorHits };
  out.http.E = 200;
  out.checks.E = errorHits.length === 0 ? 'PASS' : 'FAIL';

  const savedTitles = tripId ? (await db`select title from trip_things where trip_id=${tripId}`).map((r) => r.title) : [];
  const priorLeak = leak6 || (ps6b?.survivingPriorDbTitles || []).includes(DECOY_TITLE) || savedTitles.includes(DECOY_TITLE);
  out.checkPriorDb = { decoyTitle: DECOY_TITLE, surviving6: ps6?.survivingPriorDbTitles, surviving6b: ps6b?.survivingPriorDbTitles, savedTitlesMatch: savedTitles.filter((t) => t.includes('PRIOR_DB_LEAK')) };
  out.checks.prior_db = !priorLeak ? 'PASS' : 'FAIL';

  const dOwner = await freshOwnerSession(couponDTrip, 'd', 'D', 'Trip');
  await postItinerary(dOwner.session, { text: 'hi' });
  const dTripMsg = await postItinerary(dOwner.session, { text: 'Maui March 10-17 2027 with my wife' });
  const dTripId = dTripMsg.json.trip?.id;
  const d1 = await postItinerary(dOwner.session, { tripId: dTripId, text: "add Mama's Fish House for Saturday" });
  const d1Db = dTripId ? await customerTurnRow(db, dTripId, "%Mama%Fish House%") : null;
  const d1ThingId = d1.json?.thingId || d1.json?.savedThings?.[0]?.thingId || null;
  const d1SharedDayIds = d1.json?.sharedDayIds || d1.json?.savedThings?.[0]?.sharedDayIds || [];
  let d1Thing = d1ThingId ? (await db`select id, title, metadata, starts_at, source from trip_things where id=${d1ThingId} limit 1`)[0] : null;
  const d1StartsIso = isoDateFromStartsAt(d1Thing?.starts_at);
  const d2 = await postItinerary(dOwner.session, { tripId: dTripId, text: 'save Paia Fish Market' });
  const d2Db = dTripId ? await customerTurnRow(db, dTripId, '%Paia Fish Market%') : null;
  const d2Reply = d2.json.reply || '';
  const d2Unsched = /not on a day|isn't on a day|not scheduled|unscheduled/i.test(d2Reply);
  const d2Persist = persistedTurnClassifier(d2Db?.payload);
  const dAllThings = dTripId ? await db`
    select id, title, source, starts_at, metadata, created_at, source_request_id
    from trip_things where trip_id=${dTripId} order by created_at asc` : [];
  const dTurns = dTripId ? await db`
    select id, body, speaker, payload, created_at, request_id
    from transcript_turns where trip_id=${dTripId} and speaker='customer' order by created_at asc` : [];
  const dCustomerTurnIds = dTurns.map((t) => t.id);
  const dExtraRows = attributeDThingRows({
    things: dAllThings,
    customerTurns: dTurns,
    turnResponses: [
      { turnId: d1Db?.id, json: d1.json },
      { turnId: d2Db?.id, json: d2.json },
    ].filter((r) => r.turnId),
  });
  const dExtraFailures = gradeDExtraRows(dExtraRows);
  out.checkD = {
    dTripId,
    dCustomerTurnIds,
    d1: {
      http: d1.status,
      thingId: d1ThingId,
      sharedDayIds: d1SharedDayIds,
      thing: d1Thing,
      startsAtIso: d1StartsIso,
      turnResponse: { thingId: d1.json?.thingId, sharedDayIds: d1.json?.sharedDayIds },
      customerTurnId: d1Db?.id || null,
    },
    d2: {
      http: d2.status,
      reply: d2Reply.slice(0, 300),
      unschedReply: d2Unsched,
      targetKind: d2Persist.targetKind,
      customerTurnId: d2Db?.id || null,
      requestId: d2Db?.request_id || null,
      turnResponse: d2.json,
    },
    dExtra: { rows: dExtraRows, failures: dExtraFailures },
  };
  out.http.D = d2.status;
  out.checks.D = d1.status >= 200 && d1.status < 300 && d1ThingId && d1StartsIso === D1_EXPECT_START && d1SharedDayIds.length > 0
    && d2.status >= 200 && d2.status < 300 && d2Unsched && dExtraFailures.length === 0 ? 'PASS' : 'FAIL';

  const invOwner = await freshOwnerSession(couponInvClaim, 'inv', 'Inv', 'Claim');
  const invTrip = await postItinerary(invOwner.session, { text: 'Maui March 10-17 2027 with my wife' });
  const invReply = invTrip.json.reply || '';
  const invQuestions = (invReply.match(/\?/g) || []).length;
  const invBad = /\b(I'?ve added|I'll invite|I will invite|add your wife as a collaborator|will be added|joining the trip)\b/i.test(invReply);
  const invAsksContact = /(name|email).*(name|email)|email.*name/i.test(invReply);
  out.checkINVCLAIM = { http: invTrip.status, reply: invReply.slice(0, 500), questionCount: invQuestions, invBad, invAsksContact };
  out.http['INV-CLAIM'] = invTrip.status;
  out.checks['INV-CLAIM'] = invTrip.status >= 200 && invTrip.status < 300 && invTrip.status !== 502 && invQuestions === 1 && invAsksContact && !invBad ? 'PASS' : 'FAIL';

  const sctHash = couponHash(SCT_CODE, process.env);
  const sct = (await db`select redemption_count, status from checkout_coupons where code_hash = ${sctHash} limit 1`)[0];
  out.sctReserve = { code: SCT_CODE, redemption_count: sct?.redemption_count, status: sct?.status };

  out.couponMain = couponMain;
  out.couponH2 = couponH2;
  out.session = session;
  out.tripId = tripId;
  out.smokeEmail = smokeEmail;
  out.deployId = 'dpl_7BSwCuKQTvQM7ikkVWPCRiHaeooB';
  out.runTs = RUN_TS;
  out.couponA1 = couponA1;
  out.couponA2 = couponA2;

  writeFileSync(`/tmp/shepherd-${SHA7}-out.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
