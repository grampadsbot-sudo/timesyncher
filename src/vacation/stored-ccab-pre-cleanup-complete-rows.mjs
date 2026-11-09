const GATE_B_NYC_TRIP_ID = '99';

const PRE_CLEANUP_COMPLETE_ROW_IDS = new Set([
  601, 612, 613, 614, 615, 616,
  642, 643, 645, 647, 648, 649,
  651, 652, 658, 659,
]);

export function isPreCleanupCompleteStoredRow(place = {}) {
  return String(place.trip_id ?? place.tripId ?? '') === GATE_B_NYC_TRIP_ID
    && PRE_CLEANUP_COMPLETE_ROW_IDS.has(place.id);
}
