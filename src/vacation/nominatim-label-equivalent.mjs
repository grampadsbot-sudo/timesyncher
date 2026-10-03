import { nominatimLabelGeocodeCacheKey } from './nominatim-store.mjs';

export function nominatimLabelsEquivalent(left = '', right = '') {
  const a = nominatimLabelGeocodeCacheKey(left);
  const b = nominatimLabelGeocodeCacheKey(right);
  return Boolean(a && b && a === b);
}
