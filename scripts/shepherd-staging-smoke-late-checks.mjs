import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';
import { gradeCoffeeReplyRows } from './shepherd-staging-smoke-lib.mjs';

export async function runShepherdSmokeLateChecks({
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
  state,
}) {
  let { mReply, rReply, creationReply } = state;

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
    creationReply = String(h2Trip.json.reply || '');
    const creationMentionsKihei = /kihei\s+kai\s+nani/i.test(creationReply) || /kihei\s+kai\s+nani/i.test(h2Db?.body || '');
    const h2HotelsTabOk = h2HotelThings.some((t) => String(t.location?.address || t.description || '').includes('2495'));
    const h2AddrOk = h2Hotels.length === 1 && String(h2Thing?.address || '').includes('2495') && h2Thing?.providerId;
    const h2OneHotelAtShip = h2Hotels.length === 1;
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
      h2OneHotelAtShip,
    };
    const pass = h2Trip.status >= 200 && h2Trip.status < 300 && h2Trip.status !== 502 && creationMentionsKihei && h2AddrOk && h2HotelsTabOk && h2OneHotelAtShip;
    return { pass, http: h2Trip.status };
  }, { timeoutMs: 60000 });

  await runCheck('M', async ({ setStage }) => {
    setStage('farmers market Kihei');
    const mTurn = await postItinerary(session, { tripId, text: 'farmers market near Kihei' });
    const mDb = tripId ? await turnRow(db, tripId, 'farmers market%') : null;
    mReply = mTurn.json.reply || mDb?.body || '';
    const mPs = mTurn.json.placeSearch || mDb?.payload?.placeSearch;
    const mThings = tripId ? await db`select title, category, metadata, source from trip_things where trip_id=${tripId} order by created_at desc limit 30` : [];
    const mMarketRows = mThings.filter((t) => /market|farm/i.test(String(t.metadata?.categoryName || t.category || '')) || /market/i.test(t.title || ''));
    const mGrocery = /grocery|supermarket|safeway|foodland/i.test(mReply) && !/farmers?\s+market/i.test(mReply);
    const mHonestNo = /no results|couldn't find|could not find|nothing specific/i.test(mReply);
    const mRealMarket = mMarketRows.length > 0 || /farmers?\s+market/i.test(mReply);
    out.checkM = { http: mTurn.status, reply: mReply.slice(0, 500), placeSearch: mPs, marketRows: mMarketRows.slice(0, 5), diag: fullDiag(mDb?.payload, mPs) };
    const pass = mTurn.status >= 200 && mTurn.status < 300 && !ERROR_REPLY_RE.test(mReply) && !mGrocery && (mRealMarket || mHonestNo);
    return { pass, http: mTurn.status };
  }, { timeoutMs: 60000 });

  await runCheck('R', async ({ setStage }) => {
    setStage('coffee shops Kihei');
    const rTurn = await postItinerary(session, { tripId, text: 'coffee shops near Kihei' });
    const rDb = tripId ? await turnRow(db, tripId, 'coffee shops near Kihei%') : null;
    const rPs = rTurn.json.placeSearch || rDb?.payload?.placeSearch;
    rReply = rTurn.json.reply || '';
    const rOffersOutside = OUTSIDE_KIHEI_RE.test(rReply);
    const rAnchorRejected = Number(rPs?.anchorRadiusRejected ?? rDb?.payload?.placeSearch?.anchorRadiusRejected ?? 0);
    const rPersist = persistedTurnClassifier(rDb?.payload);
    const rClass = classifierSnapshot(rDb?.payload);
    const rClassifierFail = rTurn.status === 502 || rClass.reason === 'turn_classifier_failed' || String(rPs?.error || '').includes('turn_classifier_failed') || String(rDb?.payload?.placeSearch?.error || '').includes('category unknown');
    const rResultRows = rPs?.results || rDb?.payload?.placeSearch?.results || [];
    const rCoffee = gradeCoffeeReplyRows(rResultRows);
    out.checkR = {
      http: rTurn.status,
      anchorRadiusRejected: rAnchorRejected,
      replySnippet: rReply.slice(0, 500),
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
    const oTurn = await postItinerary(session, { tripId, text: 'Hi Shepherd — quick question about our Maui trip' });
    const oDb = tripId ? await turnRow(db, tripId, '%quick question%') : null;
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

  state.mReply = mReply;
  state.rReply = rReply;
  state.creationReply = creationReply;
}
