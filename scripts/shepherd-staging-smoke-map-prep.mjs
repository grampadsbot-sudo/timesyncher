import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import {
  mapLogoSharePollSatisfied,
  sharedTabPlaceCount,
  thingCardSortTabsReady,
  THING_CARD_SORT_MIN_TAB_ROWS,
} from './shepherd-staging-smoke-map-prep-lib.mjs';
import { itineraryPostOk, postItinerary } from './shepherd-staging-smoke-helpers.mjs';

export {
  mapLogoSharePollSatisfied,
  mapLogoShareReady,
  sharedTabPlaceCount,
  thingCardSortTabsReady,
  THING_CARD_SORT_MIN_TAB_ROWS,
} from './shepherd-staging-smoke-map-prep-lib.mjs';

const CAR_SORT_SEED_LINES = [
  'Hertz rental car at OGG $45 per day and Alamo rental car at OGG $55 per day',
  'Alamo rental car at OGG $55 per day',
  'Enterprise rental car at Kahului OGG $65 per day',
  'Avis rental car at OGG airport $75 per day',
];

async function postSeedLine(session, tripId, label, text, http) {
  const res = await postItinerary(session, { tripId, text });
  http.push({ label, status: res.status, ok: itineraryPostOk(res) });
  return res;
}

async function seedMapLogoTripContent(session, tripId) {
  const http = [];
  await postSeedLine(session, tripId, 'seed westin lodging', "We're staying at the Westin Maui in Kaanapali.", http);
  await postSeedLine(session, tripId, 'seed priced car rentals', CAR_SORT_SEED_LINES[0], http);
  return http;
}

export async function prepareMapLogoIntakeShare(ctx) {
  const { state, BASE, db } = ctx;
  const seedHttp = await seedMapLogoTripContent(state.session, state.tripId);
  let carFallbackIdx = 1;
  const shareSlug = state.tripId ? intakeShareSlug(state.tripId) : '';
  let sharedApi = null;
  let sharedApiFirst200Ms = null;
  if (shareSlug) {
    for (let i = 0; i < 25; i += 1) {
      const sr = await fetch(`${BASE}/api/shared/${shareSlug}`);
      sharedApi = { status: sr.status, json: await sr.json().catch((err) => ({ _jsonError: String(err?.message || err) })) };
      if (sr.status === 200 && sharedApiFirst200Ms == null) sharedApiFirst200Ms = Date.now();
      const carPlaces = sharedTabPlaceCount(sharedApi.json, 'cars');
      if (mapLogoSharePollSatisfied(sharedApi.json)) break;
      const retryAt = i === 4 || i === 9 || i === 14;
      if (retryAt && carPlaces < THING_CARD_SORT_MIN_TAB_ROWS && carFallbackIdx < CAR_SORT_SEED_LINES.length) {
        await postSeedLine(
          state.session,
          state.tripId,
          `seed car fallback ${carFallbackIdx}`,
          CAR_SORT_SEED_LINES[carFallbackIdx],
          seedHttp,
        );
        carFallbackIdx += 1;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const tripMetaAfterH = state.tripId ? (await db`select metadata from trips where id=${state.tripId} limit 1`)[0]?.metadata : null;
  const publicUrlAfterH = tripMetaAfterH?.publicUrl || tripMetaAfterH?.public_url || '';
  const sharedJson = sharedApi?.json || {};
  return {
    shareSlug,
    sharedApi,
    sharedApiFirst200Ms,
    publicUrlAfterH,
    intakeShareUrl: shareSlug ? `${BASE}/shared/${shareSlug}/` : '',
    thingCardSortSeed: {
      carPlaceCount: sharedTabPlaceCount(sharedJson, 'cars'),
      hotelPlaceCount: sharedTabPlaceCount(sharedJson, 'hotels'),
      sortTabsReady: thingCardSortTabsReady(sharedJson),
      seedHttp,
    },
  };
}
