import { finalizeServedSharedTripPayload } from '../../src/vacation/shared-trip-served-page.mjs';
import { applyStoredDossiersToSharedTripSync } from '../../src/vacation/shared-trip-dossier-overlay.mjs';
import {
  loadTripPlaceDossiersFromDisk,
  loadTripPlaceDossiersFromStore,
} from '../../src/vacation/thing-evidence-dossier-store.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './nyc-craig-kim-daybyday-trip.mjs';

export const GATE_B_APPROVED_SHARED_SLUG = NYC_DAYBYDAY_SLUG;

export function buildGateBApprovedSharedTripBase() {
  return buildNycCraigKimDaybydayTrip();
}

export function buildGateBApprovedSharedTrip() {
  const trip = buildGateBApprovedSharedTripBase();
  const placeIds = (trip.places || []).map((place) => place.id);
  const dossiers = loadTripPlaceDossiersFromDisk(placeIds);
  return finalizeServedSharedTripPayload(applyStoredDossiersToSharedTripSync(trip, dossiers));
}

export async function buildGateBApprovedSharedTripWithStore({ env = process.env, storeImpl } = {}) {
  const trip = buildGateBApprovedSharedTripBase();
  const placeIds = (trip.places || []).map((place) => place.id);
  const dossiers = await loadTripPlaceDossiersFromStore(placeIds, { env, storeImpl });
  return finalizeServedSharedTripPayload(applyStoredDossiersToSharedTripSync(trip, dossiers));
}
