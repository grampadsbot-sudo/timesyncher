import { nominatimLabelGeocodeCacheKey } from './nominatim-store.mjs';
import { tryGeocodeLabel } from './place-search-geocode.mjs';

function nominatimLabelsEquivalent(left = '', right = '') {
  const a = nominatimLabelGeocodeCacheKey(left);
  const b = nominatimLabelGeocodeCacheKey(right);
  return Boolean(a && b && a === b);
}

export async function resolveSearchAnchorGeocode({
  fetchImpl,
  anchorText = '',
  namedPlaceLookup = false,
  context = null,
  dest = '',
  providerLog,
  readJson,
  env = process.env,
} = {}) {
  const anchor = String(anchorText || '').trim();
  if (!anchor || namedPlaceLookup) return null;
  const centerLabel = String(context?.center?.label || context?.locationText || dest || '').trim();
  if (context?.center && nominatimLabelsEquivalent(anchor, centerLabel)) {
    providerLog.push({
      provider: 'nominatim',
      status: 'skipped',
      reason: 'anchor_matches_search_center',
      resultCount: 0,
    });
    return {
      lat: context.center.lat,
      lng: context.center.lng,
      label: centerLabel || anchor,
    };
  }
  return tryGeocodeLabel(fetchImpl, anchor, providerLog, readJson, { env });
}
