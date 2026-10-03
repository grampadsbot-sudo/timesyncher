import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/workspace/node_modules/puppeteer-core');
import { normalizePlaceName } from '/workspace/src/vacation/intake-lodging-candidate.mjs';
import {
  postItinerary,
  getApp,
  customerTurnRow,
  thingReport,
  hyattThingPass,
  lookupBundle,
  fullDiag,
  persistedTurnClassifier,
  itineraryPostOk,
  measureCheckoutIndexFetchMs,
  classifySmokeServerTiming,
} from './shepherd-staging-smoke-helpers.mjs';
import {
  withBrowserPageSlot,
  waitForSelector,
} from './shepherd-staging-smoke-browser-pool.mjs';

async function freshClassifierSession(ctx) {
  const { BASE, SHA7, RUN_TS, couponK } = ctx;
  const email = `shepherd-k-${SHA7}-${RUN_TS}@resend.dev`;
  const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firstName: 'K', lastName: SHA7, email, couponCode: couponK, orderBump: false, photoMemories: false }),
  });
  const couponJson = JSON.parse((await couponRes.text()).split('\nHTTP:')[0]);
  const session = couponJson.session?.token;
  const customerId = couponJson.redemption?.customer_id;
  await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${session}`)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acceptedByName: 'K', checkboxConfirmed: true }),
  });
  return { session, customerId, couponHttp: couponRes.status };
}

/** Independent checks C, H2, K (parallel pool after bootstrap). */
export function buildMainIndependentParallelChecks(ctx) {
  const {
    db, out, BASE, SHA7, RUN_TS, couponMain, couponH2, artifactPath, CHROME, sharedBrowser,
  } = ctx;

  return [
    {
      name: 'C',
      timeoutMs: 90000,
      run: async ({ setStage }) => {
        setStage('checkout index fetch timing');
        const indexFetch = await measureCheckoutIndexFetchMs(BASE);
        const checkoutPageTiming = classifySmokeServerTiming(
          { latencyMs: indexFetch.clientRttMs, sessionE2eMs: indexFetch.clientRttMs },
        );
        if (checkoutPageTiming.appFail) {
          out.checkC = {
            ...indexFetch,
            serverTiming: checkoutPageTiming,
            appFailSlowCheckoutPage: true,
          };
          return { pass: false, http: indexFetch.http, harnessError: true, harnessMessage: 'APP FAIL: checkout index.html server/client fetch > 10s' };
        }
        setStage('checkout zero UI');
        const browser = sharedBrowser || await puppeteer.launch(CHROME);
        return withBrowserPageSlot(browser, async (cPage) => {
          await cPage.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
          await waitForSelector(cPage, '#singlePrice', 120000);
          await cPage.type('input[name="firstName"]', 'C');
          await cPage.type('input[name="lastName"]', 'Check');
          await cPage.type('input[name="email"]', `c-check-${Date.now()}@resend.dev`);
          await cPage.click('#continueBtn');
          await waitForSelector(cPage, '#couponCode', 60000);
          await cPage.type('#couponCode', couponMain);
          await cPage.evaluate(() => document.querySelector('#couponCode')?.dispatchEvent(new Event('input', { bubbles: true })));
          await waitForSelector(cPage, '#total', 60000);
          const checkC = await cPage.evaluate(() => ({
            total: document.getElementById('total')?.textContent?.trim(),
            redeemVisible: !document.getElementById('couponPayBtn')?.hidden,
            redeemText: document.getElementById('couponPayBtn')?.textContent?.trim(),
          }));
          const cShot = artifactPath('checkout-zero.png');
          await cPage.screenshot({ path: cShot, fullPage: true });
          out.checkC = {
            ...checkC,
            screenshot: cShot,
            indexFetch,
            serverTiming: checkoutPageTiming,
          };
          return { pass: /\$0/.test(checkC.total || '') && checkC.redeemVisible, http: 200 };
        }).finally(async () => {
          if (!sharedBrowser) await browser.close().catch((err) => {
            out.browserCloseErrors = out.browserCloseErrors || [];
            out.browserCloseErrors.push(String(err?.message || err));
          });
        });
      },
    },
    {
      name: 'H2',
      timeoutMs: 60000,
      run: async ({ setStage }) => {
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
        const creationReply = String(h2Trip.json.reply || '');
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
        ctx.state.creationReply = creationReply;
        const pass = h2Trip.status >= 200 && h2Trip.status < 300 && h2Trip.status !== 502 && creationMentionsKihei && h2AddrOk && h2HotelsTabOk && h2OneHotelAtShip;
        return { pass, http: h2Trip.status };
      },
    },
    {
      name: 'K',
      timeoutMs: 60000,
      run: async ({ setStage }) => {
        setStage('K persisted turnClassifier market');
        const kSession = await freshClassifierSession(ctx);
        await getApp(kSession.session);
        const kHi = await postItinerary(kSession.session, { text: 'hi' });
        const kTrip = await postItinerary(kSession.session, { text: 'Maui March 10-17 2027 with my wife' });
        const kTripId = kTrip.json.trip?.id;
        setStage('K farmers market turn');
        const kTurn = await postItinerary(kSession.session, { tripId: kTripId, text: 'farmers market near Kihei' });
        const kDb = kTripId ? await customerTurnRow(db, kTripId, 'farmers market%') : null;
        const kPersist = persistedTurnClassifier(kDb?.payload);
        const kFromResponse = kTurn.json?.turnClassifier || kTurn.json?.category || null;
        out.checkK = {
          http: kTurn.status,
          hiHttp: kHi.status,
          tripHttp: kTrip.status,
          persistedCategory: kPersist.category,
          persistedTargetKind: kPersist.targetKind,
          responseCategory: kFromResponse?.category || kTurn.json?.category || null,
          customerTurnId: kDb?.id || null,
          postsOk: itineraryPostOk(kHi) && itineraryPostOk(kTrip) && itineraryPostOk(kTurn),
        };
        const category = String(kPersist.category || kFromResponse?.category || '').toLowerCase();
        const postsOk = itineraryPostOk(kHi) && itineraryPostOk(kTrip) && itineraryPostOk(kTurn);
        return {
          pass: postsOk && kTurn.status >= 200 && kTurn.status < 300 && Boolean(kDb?.id) && category === 'market',
          http: kTurn.status,
        };
      },
    },
  ];
}
