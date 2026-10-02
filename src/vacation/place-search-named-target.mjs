import { intakeThingHasProperName } from './intake-thing-name.mjs';

export function namedPlaceSearchTarget(relevanceTarget = '', placeQueries = []) {
  const target = String(relevanceTarget || '').trim()
    || String(placeQueries?.[0]?.target || '').trim();
  return intakeThingHasProperName(target);
}
