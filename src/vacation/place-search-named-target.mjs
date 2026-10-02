import { intakeThingHasProperName } from './intake-thing-name.mjs';

function clean(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function namedPlaceSearchTarget(relevanceTarget = '', placeQueries = []) {
  const target = String(relevanceTarget || '').trim()
    || String(placeQueries?.[0]?.target || '').trim();
  return intakeThingHasProperName(target);
}

export function chatPlaceSearchGeocodeDestination({
  classification = null,
  planQueries = [],
  tripDestination = '',
  tripResolvedArea = '',
  planDestination = '',
} = {}) {
  const namedPlaceLookup = namedPlaceSearchTarget(clean(classification?.target, 240), planQueries);
  if (!namedPlaceLookup) return clean(planDestination, 180);
  return clean(tripDestination, 180) || clean(tripResolvedArea, 180) || clean(planDestination, 180);
}
