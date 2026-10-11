import { finalizeServedSharedTripPayload } from '../../src/vacation/shared-trip-served-page.mjs';
import {
  buildNycCraigKimDaybydayTrip,
  NYC_DAYBYDAY_SLUG,
} from './nyc-craig-kim-daybyday-trip.mjs';

/** Slug for the offline Gate B approved shared trip (see gate-b-approved-shared-trip.mjs). */
export const GATE_B_APPROVED_SHARED_SLUG = NYC_DAYBYDAY_SLUG;

export function buildGateBApprovedSharedTrip() {
  return finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
}
