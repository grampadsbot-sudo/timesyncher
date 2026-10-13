import { buildNycCraigKimDaybydayTripPositiveV1 } from './nyc-craig-kim-daybyday-positive-v1.mjs';

export { NYC_DAYBYDAY_SLUG as GATE_B_APPROVED_SHARED_SLUG } from './nyc-craig-kim-daybyday-trip.mjs';

export function buildGateBApprovedSharedTrip() {
  return buildNycCraigKimDaybydayTripPositiveV1();
}
