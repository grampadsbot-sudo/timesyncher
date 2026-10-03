import { applyProductKeepsakeOverrides, productThingCategory } from './keepsake-product-overrides.mjs';
import { thingLogoUrl } from './timeline-icons.mjs';

function text(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function prepareSharedTripForLiveApp(shared = {}) {
  return applyProductKeepsakeOverrides(shared);
}

export function sharedLiveTabRows(shared = {}, tabKeyword = '') {
  const prepared = prepareSharedTripForLiveApp(shared);
  const tab = text(tabKeyword).toLowerCase();
  const rows = [];
  for (const place of prepared.places || []) {
    const override = prepared.thingOverrides?.[`place:${place.id}`] || {};
    const category = productThingCategory(place, override);
    if (tab === 'hotels' && category === 'hotel') rows.push({ place, override, category });
    if (tab === 'cars' && category === 'car') rows.push({ place, override, category });
  }
  return rows;
}

function listRowHtml({ place, override, tab }) {
  const logoUrl = thingLogoUrl(place, override);
  if (!logoUrl) {
    throw new Error(`shared_live_tab_missing_logo:${text(place.name || place.title)}`);
  }
  const name = escapeHtml(place.name || place.title || 'Place');
  const src = escapeHtml(logoUrl);
  const chip = `<span data-ts-logo-chip="1" aria-hidden="true" style="width:22px;height:22px;min-width:22px;display:inline-grid;place-items:center;box-sizing:border-box;border-radius:6px;background:#f8fafc;border:1px solid #e5e7eb"><img class="tiny-logo" src="${src}" alt="" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center center;display:block" /></span>`;
  return `<li data-list-row="1" data-has-logo="1" data-logo-src="${src}" data-shared-tab="${escapeHtml(tab)}" style="display:flex;align-items:center;gap:8px">${chip}<span><strong>${name}</strong></span></li>`;
}

export function renderSharedLiveTabListHtml(shared = {}, tabKeyword = '') {
  const tab = text(tabKeyword).toLowerCase();
  const rows = sharedLiveTabRows(shared, tab);
  if (!rows.length) {
    throw new Error(`shared_live_tab_empty:${tab || 'unknown'}`);
  }
  const items = rows.map((row) => listRowHtml({ ...row, tab }));
  return `<ul data-shared-live-tab="${escapeHtml(tab)}">${items.join('')}</ul>`;
}

export function buildSharedLiveTabLists(shared = {}) {
  const prepared = prepareSharedTripForLiveApp(shared);
  const hotels = sharedLiveTabRows(prepared, 'hotels');
  const cars = sharedLiveTabRows(prepared, 'cars');
  const liveTabLists = {};
  if (hotels.length) {
    liveTabLists.hotels = renderSharedLiveTabListHtml(prepared, 'hotels');
  }
  if (cars.length) {
    liveTabLists.cars = renderSharedLiveTabListHtml(prepared, 'cars');
  }
  return liveTabLists;
}
