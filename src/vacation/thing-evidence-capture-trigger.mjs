import { fetchXaiPlaceRatings } from './xai-grok-place-ratings.mjs';
import { loadThingEvidenceDossier, thingEvidenceDossierKey } from './thing-evidence-dossier-store.mjs';

const inFlight = new Set();

function captureKey(place = {}) {
  return thingEvidenceDossierKey(place);
}

export function thingWantsEvidenceCapture(thing = {}) {
  const cat = String(thing.category || thing.categoryName || '').toLowerCase();
  if (['decision', 'note'].includes(cat)) return false;
  return Boolean(String(thing.title || thing.name || '').trim());
}

export function scheduleThingEvidenceCapture(place = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  destination = '',
  storeImpl,
} = {}) {
  if (!String(env.XAI_API_KEY || '').trim()) return { scheduled: false, reason: 'missing_xai_api_key' };
  if (!thingWantsEvidenceCapture(place)) return { scheduled: false, reason: 'exempt_category' };
  const key = captureKey({ ...place, trip_id: place.trip_id ?? place.tripId, id: place.id ?? place.placeId });
  if (!key) return { scheduled: false, reason: 'missing_key' };
  if (inFlight.has(key)) return { scheduled: false, reason: 'in_flight' };
  inFlight.add(key);
  void (async () => {
    try {
      const existing = await loadThingEvidenceDossier(key, { env, storeImpl });
      if (existing?.pages?.length) return;
      await fetchXaiPlaceRatings(place, {
        env,
        fetchImpl,
        destination,
        dossierKey: key,
        storeImpl,
      });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'thing_evidence_capture_failed',
        dossierKey: key,
        error: String(error?.message || error || ''),
      }));
    } finally {
      inFlight.delete(key);
    }
  })();
  return { scheduled: true, dossierKey: key };
}

export async function scheduleMissingEvidenceCapturesForTrip({
  trip = {},
  things = [],
  env = process.env,
  fetchImpl = globalThis.fetch,
  storeImpl,
} = {}) {
  const destination = String(trip.destination || '').trim();
  const tripId = trip.id ?? trip.trip_id;
  const scheduled = [];
  for (const thing of Array.isArray(things) ? things : []) {
    const place = {
      id: thing.id,
      trip_id: tripId,
      tripId,
      title: thing.title || thing.name,
      category: thing.category,
      description: thing.description,
      metadata: thing.metadata,
      sourceRecord: thing.sourceRecord,
      lat: thing.lat,
      lng: thing.lng,
      address: thing.address,
    };
    if (!thingWantsEvidenceCapture(place)) continue;
    const key = captureKey(place);
    if (!key) continue;
    const existing = await loadThingEvidenceDossier(key, { env, storeImpl });
    if (existing?.pages?.length) continue;
    const result = scheduleThingEvidenceCapture(place, { env, fetchImpl, destination, storeImpl });
    if (result.scheduled) scheduled.push({ placeId: place.id, dossierKey: key });
  }
  return scheduled;
}
