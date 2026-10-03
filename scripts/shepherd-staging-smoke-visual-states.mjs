import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import { mintCheckoutCoupons } from './mint-checkout-coupons.mjs';
import { getApp, postItinerary } from './shepherd-staging-smoke-helpers.mjs';
import { seedVisualSmokeTripContent } from './shepherd-staging-smoke-visual-seed.mjs';

async function acceptEula(BASE, session, name) {
  await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${session}`)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acceptedByName: name, checkboxConfirmed: true }),
  });
}

async function checkoutCustomer(BASE, couponCode, tag) {
  const email = `smoke-${tag}-${Date.now()}@resend.dev`;
  const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Sarah', lastName: 'Rivera', email, couponCode, orderBump: false, photoMemories: false,
    }),
  });
  const couponJson = await couponRes.json();
  return { session: couponJson.session?.token, email, status: couponRes.status };
}

/** Fresh customers per VISUAL state; never touches TS-2TZD3CGMA_J7. */
export async function mintVisualStateCustomers({ db, BASE, SHA7, setStage }) {
  const coupons = await mintCheckoutCoupons(db, { count: 4, max: 4, label: `layout-${SHA7}` });
  const states = {};

  setStage?.('visual state v0 mint');
  const v0 = await checkoutCustomer(BASE, coupons[0], `${SHA7}-v0`);
  await acceptEula(BASE, v0.session, 'Sarah Rivera');
  await getApp(v0.session);
  await postItinerary(v0.session, { text: 'hi' });
  states.v0 = {
    id: 'v0',
    label: '0 vacations',
    session: v0.session,
    tripId: null,
    sharedUrl: '',
    chatUrl: `${BASE}/vacation-app.html?session=${encodeURIComponent(v0.session)}`,
  };

  setStage?.('visual state v1 mint');
  const v1 = await checkoutCustomer(BASE, coupons[1], `${SHA7}-v1`);
  await acceptEula(BASE, v1.session, 'Sarah Rivera');
  await getApp(v1.session);
  await postItinerary(v1.session, { text: 'hi' });
  const v1Trip = await postItinerary(v1.session, { text: 'Maui March 10-17 2027 with my wife Sarah' });
  states.v1 = {
    id: 'v1',
    label: '1 vacation no site',
    session: v1.session,
    tripId: v1Trip.json.trip?.id || null,
    sharedUrl: '',
    chatUrl: `${BASE}/vacation-app.html?session=${encodeURIComponent(v1.session)}`,
  };

  setStage?.('visual state v1site mint');
  const v1s = await checkoutCustomer(BASE, coupons[2], `${SHA7}-v1site`);
  await acceptEula(BASE, v1s.session, 'Sarah Rivera');
  await getApp(v1s.session);
  await postItinerary(v1s.session, { text: 'hi' });
  const siteTrip = await postItinerary(v1s.session, { text: 'Maui March 10-17 2027 with Sarah — title Maui with Sarah' });
  const siteTripId = siteTrip.json.trip?.id || null;
  await seedVisualSmokeTripContent(v1s.session, siteTripId, { setStage });
  const shareSlug = siteTripId ? intakeShareSlug(siteTripId) : '';
  states.v1site = {
    id: 'v1site',
    label: '1 vacation with site content',
    session: v1s.session,
    tripId: siteTripId,
    sharedUrl: shareSlug ? `${BASE}/shared/${shareSlug}/` : '',
    chatUrl: `${BASE}/vacation-app.html?session=${encodeURIComponent(v1s.session)}`,
  };

  setStage?.('visual state v2 mint');
  const v2 = await checkoutCustomer(BASE, coupons[3], `${SHA7}-v2`);
  await acceptEula(BASE, v2.session, 'Sarah Rivera');
  await getApp(v2.session);
  await postItinerary(v2.session, { text: 'hi' });
  await postItinerary(v2.session, { text: 'Maui March 10-17 2027 with Sarah' });
  await postItinerary(v2.session, { text: 'Las Vegas April 3-10 2028 with friends' });
  states.v2 = {
    id: 'v2',
    label: '2+ vacations',
    session: v2.session,
    tripId: null,
    sharedUrl: '',
    chatUrl: `${BASE}/vacation-app.html?session=${encodeURIComponent(v2.session)}`,
  };

  return states;
}
