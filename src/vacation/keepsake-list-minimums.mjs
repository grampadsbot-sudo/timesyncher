

export const DEFAULT_FIRST_PASS_MINIMUMS = {
  restaurant: 15,
  store: 10,
  rest: 15,
};

export const POI_RADIUS_METERS = {
  grocery: 8000,
  market: 8000,
  restaurant: 10000,
  store: 10000,
  garden: 40000,
  activity: 40000,
};

export const DEFAULT_CATEGORY_RADIUS_KEY = 'activity';

const CATEGORY_RADIUS_ALIASES = {
  groceries: 'grocery',
  farmers_market: 'market',
  market: 'market',
  restaurants: 'restaurant',
  stores: 'store',
  gardens: 'garden',
  activities: 'activity',
  food: 'restaurant',
  dining: 'restaurant',
  shop: 'store',
  shopping: 'store',
  attraction: 'activity',
  tourism: 'activity',
  event: 'activity',
};

export function categoryRadiusMeters(category) {
  const raw = String(category || '').trim().toLowerCase();
  const key = CATEGORY_RADIUS_ALIASES[raw] || raw;
  if (Object.hasOwn(POI_RADIUS_METERS, key)) return POI_RADIUS_METERS[key];
  return POI_RADIUS_METERS[DEFAULT_CATEGORY_RADIUS_KEY];
}

export const THIN_POI_COUNT = 3;

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
