import { thingEvidenceDossierKey } from './thing-evidence-dossier-store.mjs';

export const NYC_GATE_B_TRIP_ID = 99;

function isGateBFixturePlaceId(placeId) {
  const id = Number(placeId);
  return Number.isInteger(id) && id >= 601 && id <= 699;
}

export function sharedTripDossierKeyForPlace(place = {}, shared = {}) {
  const placeId = place.id ?? place.placeId;
  const tripId = place.trip_id ?? place.tripId ?? shared.trip_id ?? shared.tripId
    ?? (isGateBFixturePlaceId(placeId) ? NYC_GATE_B_TRIP_ID : null);
  if (tripId != null && placeId != null) {
    return thingEvidenceDossierKey({ trip_id: tripId, id: placeId });
  }
  return thingEvidenceDossierKey(place);
}
