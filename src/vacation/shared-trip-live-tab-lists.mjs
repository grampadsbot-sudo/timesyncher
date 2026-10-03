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

function placeSourceUrl(place = {}) {
  const sourceRecord = place.sourceRecord || place.metadata?.sourceRecord || place.source_record || {};
  return text(sourceRecord.url || place.url || '');
}

function placeSourceName(place = {}) {
  const sourceRecord = place.sourceRecord || place.metadata?.sourceRecord || place.source_record || {};
  const raw = place.source;
  if (typeof raw === 'string') return text(raw);
  if (raw && typeof raw === 'object' && typeof raw.source === 'string') return text(raw.source);
  return text(sourceRecord.source || '');
}

function logSharedLiveTabLogoMissing(place = {}, log = console.error) {
  const row = {
    event: 'logo_missing',
    placeId: text(place.id),
    placeName: text(place.name || place.title),
    source: placeSourceName(place),
    sourceUrl: placeSourceUrl(place),
  };
  log(JSON.stringify(row));
}

function sharedLiveTabRows(shared = {}, tabKeyword = '') {
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

function listRowHtml({ place, override, tab, onLogoMissing }) {
  const logoUrl = thingLogoUrl(place, override);
  const name = escapeHtml(place.name || place.title || 'Place');
  const tabAttr = escapeHtml(tab);
  if (!logoUrl) {
    onLogoMissing?.(place);
    return `<li data-list-row="1" data-has-logo="0" data-shared-tab="${tabAttr}" style="display:flex;align-items:center;gap:8px"><span><strong>${name}</strong></span></li>`;
  }
  const src = escapeHtml(logoUrl);
  const chip = `<span data-ts-logo-chip="1" aria-hidden="true" style="width:22px;height:22px;min-width:22px;display:inline-grid;place-items:center;box-sizing:border-box;border-radius:6px;background:#f8fafc;border:1px solid #e5e7eb"><img class="tiny-logo" src="${src}" alt="" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center center;display:block" /></span>`;
  return `<li data-list-row="1" data-has-logo="1" data-logo-src="${src}" data-shared-tab="${tabAttr}" style="display:flex;align-items:center;gap:8px">${chip}<span><strong>${name}</strong></span></li>`;
}

function sharedLiveTabRowHtmlFragments(shared = {}, tabKeyword = '', options = {}) {
  const tab = text(tabKeyword).toLowerCase();
  const onLogoMissing = options.onLogoMissing || logSharedLiveTabLogoMissing;
  const rows = sharedLiveTabRows(shared, tab);
  return rows.map((row) => listRowHtml({ ...row, tab, onLogoMissing }));
}

export function renderSharedLiveTabListHtml(shared = {}, tabKeyword = '', options = {}) {
  const tab = text(tabKeyword).toLowerCase();
  const items = sharedLiveTabRowHtmlFragments(shared, tab, options);
  return `<ul data-shared-live-tab="${escapeHtml(tab)}">${items.join('')}</ul>`;
}

export function buildSharedLiveTabLists(shared = {}, options = {}) {
  const prepared = prepareSharedTripForLiveApp(shared);
  const onLogoMissing = options.onLogoMissing || logSharedLiveTabLogoMissing;
  return {
    hotels: sharedLiveTabRowHtmlFragments(prepared, 'hotels', { onLogoMissing }),
    cars: sharedLiveTabRowHtmlFragments(prepared, 'cars', { onLogoMissing }),
  };
}
