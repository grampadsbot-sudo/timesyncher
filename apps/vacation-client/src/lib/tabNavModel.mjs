/** @typedef {'day-by-day'|'flights'|'hotels'|'cars'|'restaurants'|'stores'|'events'|'budget'} TabId */

/** @type {TabId[]} */
export const TAB_ORDER = [
  'day-by-day',
  'flights',
  'hotels',
  'cars',
  'restaurants',
  'stores',
  'events',
  'budget',
];

/** @type {Record<TabId, string>} */
export const TAB_LABELS = {
  'day-by-day': 'Day-by-Day',
  flights: 'Flights',
  hotels: 'Hotels',
  cars: 'Cars',
  restaurants: 'Restaurants',
  stores: 'Stores',
  events: 'The Rest',
  budget: 'Budget',
};

/** @type {Record<TabId, string>} */
export const TAB_ICONS = {
  'day-by-day': '📅',
  flights: '✈️',
  hotels: '🏨',
  cars: '🚗',
  restaurants: '🍽️',
  stores: '🛍️',
  events: '🎭',
  budget: '💰',
};

/** @param {unknown} value @returns {value is TabId} */
export function isTabId(value) {
  return typeof value === 'string' && TAB_ORDER.includes(/** @type {TabId} */ (value));
}

/** @param {string} hash @param {string} search @returns {TabId} */
export function readTabFromLocation(hash, search) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fromQuery = params.get('tab');
  if (isTabId(fromQuery)) return fromQuery;

  const trimmed = String(hash || '').replace(/^#/, '');
  if (!trimmed) return 'day-by-day';
  if (isTabId(trimmed)) return trimmed;
  const hashParams = new URLSearchParams(trimmed.includes('=') ? trimmed : `tab=${trimmed}`);
  const fromHash = hashParams.get('tab');
  if (isTabId(fromHash)) return fromHash;
  return 'day-by-day';
}

/** @param {TabId} tab @returns {string} */
export function tabLocationHash(tab) {
  return tab === 'day-by-day' ? '' : `#tab=${encodeURIComponent(tab)}`;
}

/** @param {TabId} tab @param {Location} location */
export function writeTabToLocation(tab, location) {
  const nextHash = tabLocationHash(tab);
  const url = `${location.pathname}${location.search}${nextHash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== url) {
    history.replaceState(null, '', url);
  }
}
