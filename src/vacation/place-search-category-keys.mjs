/** OSM Overpass category keys in `place-search.mjs` OSM_CATEGORIES. */
export const PLACE_SEARCH_CATEGORY_KEYS = Object.freeze([
  'grocery',
  'restaurant',
  'store',
  'garden',
  'activity',
]);

const KEY_SET = new Set(PLACE_SEARCH_CATEGORY_KEYS);

export function normalizePlaceSearchCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  return KEY_SET.has(category) ? category : '';
}

export function intakePlaceSearchCategoryError(extractedFields = {}) {
  if (String(extractedFields.turnKind || '').trim().toLowerCase() !== 'place_search') return '';
  const raw = String(extractedFields.category ?? '').trim();
  if (!raw) return 'trip intake place_search extraction category required';
  if (!normalizePlaceSearchCategory(raw)) return 'trip intake place_search extraction category unknown';
  return '';
}
