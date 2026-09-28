import { DEFAULT_FIRST_PASS_MINIMUMS } from '../../scripts/vacation-public-research-worker.mjs';

/** Print end-list counts. A short list stays short; nothing is invented to reach these. */
export const KEEPSAKE_LIST_MINIMUMS = {
  Restaurants: DEFAULT_FIRST_PASS_MINIMUMS.restaurant,
  Stores: DEFAULT_FIRST_PASS_MINIMUMS.store,
  'Shows, Tours and the Rest': DEFAULT_FIRST_PASS_MINIMUMS.rest,
};

export const LIVE_TAB_MINIMUMS = {
  restaurant: DEFAULT_FIRST_PASS_MINIMUMS.restaurant,
  store: DEFAULT_FIRST_PASS_MINIMUMS.store,
  rest: DEFAULT_FIRST_PASS_MINIMUMS.rest,
};

/**
 * Shared-trip callers still invoke this. It does not add places, ids, or coordinates.
 * Another change reads trip_things and removes the call.
 */
export function padKeepsakeSharedPlaces(shared = {}) {
  return {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
  };
}
