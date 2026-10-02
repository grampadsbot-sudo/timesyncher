import { normalizePlaceSearchCategory } from './place-search-category-keys.mjs';
import { resolvePlaceSearchDestination } from './place-search-anchor.mjs';

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function queriesFromPlaceClassification(classification, tripDestination = '', lodgingText = '', tripResolvedArea = '') {
  const destination = resolvePlaceSearchDestination({
    classification,
    lodgingText,
    tripDestination,
    tripResolvedArea,
  });
  const target = clean(classification?.target, 240);
  const category = normalizePlaceSearchCategory(classification?.category);
  const q = target
    ? `${target}${destination ? ` near ${destination}` : ''}`.trim().slice(0, 240)
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
