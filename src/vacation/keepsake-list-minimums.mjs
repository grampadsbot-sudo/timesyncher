import { DEFAULT_FIRST_PASS_MINIMUMS } from '../../scripts/vacation-public-research-worker.mjs';

/** Print end-list counts. A short list stays short; nothing is invented to reach these. */
export const KEEPSAKE_LIST_MINIMUMS = {
  Restaurants: DEFAULT_FIRST_PASS_MINIMUMS.restaurant,
  Stores: DEFAULT_FIRST_PASS_MINIMUMS.store,
  'Shows, Tours and the Rest': DEFAULT_FIRST_PASS_MINIMUMS.rest,
};

/** Live shared-tab counts. Rows come from trip_things. */
export const LIVE_TAB_MINIMUMS = {
  restaurant: DEFAULT_FIRST_PASS_MINIMUMS.restaurant,
  store: DEFAULT_FIRST_PASS_MINIMUMS.store,
  rest: DEFAULT_FIRST_PASS_MINIMUMS.rest,
};
