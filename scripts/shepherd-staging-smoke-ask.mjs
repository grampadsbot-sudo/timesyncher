import { gradeAskLodging } from './shepherd-staging-smoke-lib.mjs';
import { postItinerary, customerTurnRow, getApp, itineraryPostOk } from './shepherd-staging-smoke-helpers.mjs';

async function freshAskLodgingSession(ctx) {
  const { BASE, SHA7, RUN_TS, couponAskLodging } = ctx;
  const email = `shepherd-ask-lodging-${SHA7}-${RUN_TS}@resend.dev`;
  const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firstName: 'Ask', lastName: 'Lodging', email, couponCode: couponAskLodging, orderBump: false, photoMemories: false }),
  });
  const couponJson = JSON.parse((await couponRes.text()).split('\nHTTP:')[0]);
  const session = couponJson.session?.token;
  await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${session}`)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acceptedByName: 'Ask', checkboxConfirmed: true }),
  });
  return { session, couponHttp: couponRes.status };
}

/** @returns {Array<{ name: string, timeoutMs: number, run: Function }>} */
export function buildAskLodgingParallelCheck(ctx) {
  const { db, out } = ctx;
  return [
    {
      name: 'ASK-lodging',
      timeoutMs: 60000,
      run: async ({ setStage }) => {
        setStage('ask-lodging fresh session');
        const owner = await freshAskLodgingSession(ctx);
        await getApp(owner.session);
        const hi = await postItinerary(owner.session, { text: 'hi' });
        setStage('ask-lodging maui trip no lodging');
        const tripMsg = await postItinerary(owner.session, { text: 'Maui March 10-17 2027 with my wife' });
        const postsOk = itineraryPostOk(hi) && itineraryPostOk(tripMsg);
        const tripId = tripMsg.json.trip?.id;
        const hotelCount = tripId
          ? (await db`select count(*)::int n from trip_things where trip_id=${tripId} and category='hotel'`)[0].n
          : 0;
        const customerDb = tripId ? await customerTurnRow(db, tripId, 'Maui March%') : null;
        const replyText = tripMsg.json.reply || '';
        const grade = await gradeAskLodging({
          replyText,
          payload: customerDb?.payload,
          turnJson: tripMsg.json,
          hotelCount,
          customerTurn: 'Maui March 10-17 2027 with my wife',
        });
        out.checkASKLODGING = {
          http: tripMsg.status,
          hiHttp: hi.status,
          postsOk,
          tripId,
          customerTurnId: customerDb?.id || null,
          jev: grade.jev,
          ...grade.evidence,
        };
        const pass = postsOk && tripMsg.status >= 200 && tripMsg.status < 300 && Boolean(customerDb?.id) && grade.pass;
        return { pass, http: tripMsg.status };
      },
    },
  ];
}
