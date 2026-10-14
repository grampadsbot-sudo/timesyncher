

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

export function sectionVisibilityMap(trip) {
  const raw = trip?.thingOverrides?.__sectionVisibility;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

export function isConfigSectionVisible(trip, key) {
  const map = sectionVisibilityMap(trip);
  return map[key] !== false;
}

export function visibleTabsForTrip(trip, permissions) {

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

export function isTabId(value) {
  return typeof value === 'string' && TAB_ORDER.some((tab) => tab === value);
}

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

export function tabLocationHash(tab) {
  return tab === 'day-by-day' ? '' : `#tab=${encodeURIComponent(tab)}`;
}

export function writeTabToLocation(tab, location) {
  const nextHash = tabLocationHash(tab);
  const params = new URLSearchParams(
    location.search.startsWith('?') ? location.search.slice(1) : location.search,
  );
  if (params.has('tab')) params.delete('tab');
  const search = params.toString();
  const nextSearch = search ? `?${search}` : '';
  const url = `${location.pathname}${nextSearch}${nextHash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== url) {
    history.replaceState(null, '', url);
  }
}
