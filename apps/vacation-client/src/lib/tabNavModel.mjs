/** @typedef {'day-by-day'|'flights'|'hotels'|'cars'|'restaurants'|'stores'|'events'|'packing'|'chat'|'budget'} TabId */

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
  packing: 'Packing',
  chat: 'Chat',
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
  packing: '🧳',
  chat: '💬',
  budget: '💰',
};

/** @param {import('../types/sharedTrip.ts').SharedTripPayload | undefined} trip */
export function sectionVisibilityMap(trip) {
  const raw = trip?.thingOverrides?.__sectionVisibility;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

/** @param {import('../types/sharedTrip.ts').SharedTripPayload | undefined} trip @param {'flights'|'hotels'|'cars'} key */
export function isConfigSectionVisible(trip, key) {
  const map = sectionVisibilityMap(trip);
  return map[key] !== false;
}

/**
 * @param {import('../types/sharedTrip.ts').SharedTripPayload | undefined} trip
 * @param {Record<string, boolean> | undefined} permissions
 * @returns {TabId[]}
 */
export function visibleTabsForTrip(trip, permissions) {
  /** @type {TabId[]} */
  const tabs = [];
  for (const tab of TAB_ORDER) {
    if (tab === 'flights' || tab === 'hotels' || tab === 'cars') {
      if (!isConfigSectionVisible(trip, tab)) continue;
    }
    if (tab === 'budget') {
      if (!permissions?.share_budget) continue;
    }
    tabs.push(tab);
  }
  if (permissions?.share_packing) {
    const budgetIdx = tabs.indexOf('budget');
    if (budgetIdx >= 0) tabs.splice(budgetIdx, 0, 'packing');
    else tabs.push('packing');
  }
  if (permissions?.share_collab) {
    const budgetIdx = tabs.indexOf('budget');
    if (budgetIdx >= 0) tabs.splice(budgetIdx, 0, 'chat');
    else tabs.push('chat');
  }
  return tabs;
}

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
