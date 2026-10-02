import { normalizePlaceSearchCategory } from './place-search-category-keys.mjs';
import { resolvePlaceSearchDestination } from './place-search-anchor.mjs';
import { intakeLodgingLookupQuery } from './intake-lodging-lookup.mjs';
import { intakeThingHasProperName } from './intake-thing-name.mjs';

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function queriesFromPlaceClassification(classification, tripDestination = '', lodgingText = '', tripResolvedArea = '', tripStatedLodgingArea = '') {
  const lodgingArea = resolvePlaceSearchDestination({
    classification,
    lodgingText,
    tripStatedLodgingArea,
    tripDestination,
    tripResolvedArea,
  });
  const tripDest = clean(tripDestination, 180) || clean(tripResolvedArea, 180);
  const target = clean(classification?.target, 240);
  const destination = intakeThingHasProperName(target) ? (tripDest || lodgingArea) : lodgingArea;
  const category = normalizePlaceSearchCategory(classification?.category);
  const q = target
    ? (intakeThingHasProperName(target)
      ? intakeLodgingLookupQuery(target, destination)
      : `${target}${destination ? ` near ${destination}` : ''}`.trim())
      .slice(0, 240)
    : destination.slice(0, 240);
  return {
    destination,
    queries: [{
      category,
      q,
      limit: 5,
      place: true,
      ...(target ? { target } : {}),
    }],
  };
}
