import { finalizeServedSharedTripPayload } from '../../src/vacation/shared-trip-served-page.mjs';
import { applyStoredDossiersToSharedTripSync } from '../../src/vacation/shared-trip-dossier-overlay.mjs';
import { loadNycDaybydayDossiersFromDisk } from '../../src/vacation/thing-evidence-dossier-store.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './nyc-craig-kim-daybyday-trip.mjs';

export const GATE_B_APPROVED_SHARED_SLUG = NYC_DAYBYDAY_SLUG;

export function buildGateBApprovedSharedTrip() {
  const trip = buildNycCraigKimDaybydayTrip();
  const placeIds = (trip.places || []).map((place) => place.id);
  const dossiers = loadNycDaybydayDossiersFromDisk(placeIds);
  return finalizeServedSharedTripPayload(applyStoredDossiersToSharedTripSync(trip, dossiers));
}
