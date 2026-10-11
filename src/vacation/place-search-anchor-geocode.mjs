import { tryGeocodeLabel } from './place-search-geocode.mjs';

export async function resolveSearchAnchorGeocode({
  fetchImpl,
  anchorText = '',
  namedPlaceLookup = false,
  providerLog,
  readJson,
  env = process.env,
} = {}) {
  const anchor = String(anchorText || '').trim();
  if (!anchor || namedPlaceLookup) return null;
  return tryGeocodeLabel(fetchImpl, anchor, providerLog, readJson, { env });
}
