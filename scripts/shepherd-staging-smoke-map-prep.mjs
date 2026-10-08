import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import { postItinerary } from './shepherd-staging-smoke-helpers.mjs';

export async function prepareMapLogoIntakeShare(ctx) {
  const { state, BASE, db } = ctx;
  await postItinerary(state.session, { tripId: state.tripId, text: "We're staying at the Westin Maui in Kaanapali." });
  await postItinerary(state.session, { tripId: state.tripId, text: 'Hertz rental car at OGG $45 per day' });
  await postItinerary(state.session, { tripId: state.tripId, text: 'Alamo rental car at OGG $55 per day' });
  const shareSlug = state.tripId ? intakeShareSlug(state.tripId) : '';
  let sharedApi = null;
  let sharedApiFirst200Ms = null;
  if (shareSlug) {
    for (let i = 0; i < 25; i += 1) {
      const sr = await fetch(`${BASE}/api/shared/${shareSlug}`);
      sharedApi = { status: sr.status, json: await sr.json().catch((err) => ({ _jsonError: String(err?.message || err) })) };
      if (sr.status === 200 && sharedApiFirst200Ms == null) sharedApiFirst200Ms = Date.now();
      if ((sharedApi.json?.places || []).length >= 1) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const tripMetaAfterH = state.tripId ? (await db`select metadata from trips where id=${state.tripId} limit 1`)[0]?.metadata : null;
  const publicUrlAfterH = tripMetaAfterH?.publicUrl || tripMetaAfterH?.public_url || '';
  return {
    shareSlug,
    sharedApi,
    sharedApiFirst200Ms,
    publicUrlAfterH,
    intakeShareUrl: shareSlug ? `${BASE}/shared/${shareSlug}/` : '',
  };
}
