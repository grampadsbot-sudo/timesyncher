import { nominatimLabelGeocodeCacheKey } from './nominatim-store.mjs';
import { tryGeocodeLabel } from './place-search-geocode.mjs';

export function nominatimLabelsEquivalent(left = '', right = '') {
  const a = nominatimLabelGeocodeCacheKey(left);
  const b = nominatimLabelGeocodeCacheKey(right);
  return Boolean(a && b && a === b);
}

function centerGeocodeIdentity(center = null) {
  return String(center?.geocodeIdentity || '').trim();
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
  const identity = centerGeocodeIdentity(context?.center);
  if (context?.center && identity && nominatimLabelsEquivalent(anchor, identity)) {
    providerLog.push({
      provider: 'nominatim',
      status: 'skipped',
      reason: 'anchor_matches_search_center',
      resultCount: 0,
    });
    return {
      lat: context.center.lat,
      lng: context.center.lng,
      label: String(context.center.label || identity || anchor).trim() || anchor,
    };
  }
  return tryGeocodeLabel(fetchImpl, anchor, providerLog, readJson, { env });
}
