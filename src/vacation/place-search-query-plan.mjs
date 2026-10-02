import { resolvePlaceSearchDestination } from './place-search-anchor.mjs';

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function inferSearchCategory(text = '') {
  const lower = String(text).toLowerCase();
  if (/\b(taco|restaurant|seafood|dinner|lunch|breakfast|brunch|coffee|cafe|food|dining|splurge|kid-?friendly)\b/.test(lower)) return 'restaurant';
  if (/\b(toy|book\s*store|bookstore|shop|store|shopping|boutique)\b/.test(lower)) return 'store';
  return 'activity';
}

export function queriesFromPlaceClassification(classification, tripDestination = '', lodgingText = '', tripResolvedArea = '') {
  const destination = resolvePlaceSearchDestination({
    classification,
    lodgingText,
    tripDestination,
    tripResolvedArea,
  });
  const target = clean(classification?.target, 240);
  const category = inferSearchCategory(target || destination);
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
