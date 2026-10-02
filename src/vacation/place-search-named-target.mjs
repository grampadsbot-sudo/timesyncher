import { namedPlaceLookupFromTargetKind } from './place-search-target-kind.mjs';

function clean(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function namedPlaceLookupFromQueries(placeQueries = []) {
  return namedPlaceLookupFromTargetKind(placeQueries?.[0]?.targetKind);
}

export function chatPlaceSearchGeocodeDestination({
  planQueries = [],
  tripDestination = '',
  tripResolvedArea = '',
  planDestination = '',
} = {}) {
  const namedPlaceLookup = namedPlaceLookupFromQueries(planQueries);
  if (!namedPlaceLookup) return clean(planDestination, 180);
  return clean(tripDestination, 180) || clean(tripResolvedArea, 180) || clean(planDestination, 180);
}
