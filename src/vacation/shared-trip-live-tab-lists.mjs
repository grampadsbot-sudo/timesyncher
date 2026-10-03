import { applyProductKeepsakeOverrides, productThingCategory } from './keepsake-product-overrides.mjs';
import { printThingIconHtml, thingLogoUrl } from './timeline-icons.mjs';

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

export function renderSharedLiveTabListHtml(shared = {}, tabKeyword = '') {
  const tab = text(tabKeyword).toLowerCase();
  const rows = sharedLiveTabRows(shared, tab);
  if (!rows.length) {
    throw new Error(`shared_live_tab_empty:${tab || 'unknown'}`);
  }
  const items = rows.map(({ place, override }) => {
    const logoUrl = thingLogoUrl(place, override);
    if (!logoUrl) {
      throw new Error(`shared_live_tab_missing_logo:${text(place.name || place.title)}`);
    }
    const icon = printThingIconHtml(place, { ...override, logoUrl });
    if (!icon.includes('tiny-logo')) {
      throw new Error(`shared_live_tab_missing_tiny_logo:${text(place.name || place.title)}`);
    }
    const name = escapeHtml(place.name || place.title || 'Place');
    return `<li data-list-row="1" data-has-logo="1" data-logo-src="${escapeHtml(logoUrl)}" data-shared-tab="${escapeHtml(tab)}">${icon}<span><strong>${name}</strong></span></li>`;
  });
  return `<ul data-shared-live-tab="${escapeHtml(tab)}">${items.join('')}</ul>`;
}
