/** Search config. One copy of the first-pass counts, the search radius, and the thin-result count. */

export const DEFAULT_FIRST_PASS_MINIMUMS = {
  restaurant: 15,
  store: 10,
  rest: 15,
};

export const SEARCH_RADIUS_METERS = 20000;

export const POI_RADIUS_METERS = {
  grocery: 8000,
  restaurant: 10000,
  store: 10000,
  garden: 40000,
  activity: 40000,
};

export const THIN_POI_COUNT = 3;

/** Jev relevance is 1–5. Trip intake drops a result when its score is below this. */
export const JEV_RELEVANCE_MINIMUM = 3;

export function jevRelevanceMinimum(env = process.env) {
  const raw = env?.JEV_RELEVANCE_MINIMUM;
  if (raw === undefined || raw === null || String(raw).trim() === '') return JEV_RELEVANCE_MINIMUM;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : JEV_RELEVANCE_MINIMUM;
}

export function firstPassSearchLimit(category) {
  if (category === 'restaurant') return DEFAULT_FIRST_PASS_MINIMUMS.restaurant;
  if (category === 'store') return DEFAULT_FIRST_PASS_MINIMUMS.store;
  return DEFAULT_FIRST_PASS_MINIMUMS.rest;
}

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
