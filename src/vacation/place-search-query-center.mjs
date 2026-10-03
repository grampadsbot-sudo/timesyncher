import { anchorRadiusCenter } from './place-search-radius-filter.mjs';

function isLodgingSearchCenter(center = null) {
  const geocoded = String(center?.geocoded || '').trim();
  return geocoded === 'lodging';
}

/** Precedence: named anchor geocode, then lodging center, then trip/stored destination center. */
export function resolvePlaceSearchQueryCenter({ namedPlaceLookup, anchorGeocode, context }) {
  if (namedPlaceLookup) {
    return anchorRadiusCenter(null, context?.center);
  }
  if (anchorGeocode) {
    return anchorRadiusCenter(anchorGeocode, null);
  }
  if (isLodgingSearchCenter(context?.center)) {
    return anchorRadiusCenter(null, context.center);
  }
  return anchorRadiusCenter(null, context?.center);
}

export function resolveBraveCompactLocality({
  namedPlaceLookup,
  searchAnchor,
  context,
  relevanceContext,
  dest,
}) {
  if (namedPlaceLookup) {
    const fromContext = String(context?.compactLocality || context?.center?.compactLocality || '').trim();
    if (fromContext) return fromContext;
    const fromRelevance = String(relevanceContext?.area || '').trim();
    if (fromRelevance && !fromRelevance.includes(',')) return fromRelevance;
    const tripDest = String(dest || '').trim();
    if (tripDest && !tripDest.includes(',')) return tripDest;
    return fromRelevance || tripDest;
  }
  const anchor = String(searchAnchor?.text || '').trim();
  if (anchor) return anchor;
  const fromContext = String(context?.compactLocality || context?.center?.compactLocality || '').trim();
  if (fromContext) return fromContext;
  const fromRelevance = String(relevanceContext?.area || '').trim();
  if (fromRelevance && !fromRelevance.includes(',')) return fromRelevance;
  const tripDest = String(dest || '').trim();
  if (tripDest && !tripDest.includes(',')) return tripDest;
  return fromRelevance || tripDest;
}
