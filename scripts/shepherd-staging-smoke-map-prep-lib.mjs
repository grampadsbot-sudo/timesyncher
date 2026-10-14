import { gradeSharedTabLogoUrlRecords } from './shepherd-staging-smoke-grader-lib.mjs';

export const THING_CARD_SORT_MIN_TAB_ROWS = 2;

const THING_CARD_SORT_TAB_CANDIDATES = ['cars', 'hotels', 'restaurants', 'stores'];

export function sharedTabPlaceCount(sharedJson = {}, tabKeyword = '') {
  return gradeSharedTabLogoUrlRecords(sharedJson, tabKeyword).placeCount || 0;
}

export function thingCardSortTabsReady(sharedJson = {}) {
  return THING_CARD_SORT_TAB_CANDIDATES.some(
    (tab) => sharedTabPlaceCount(sharedJson, tab) >= THING_CARD_SORT_MIN_TAB_ROWS,
  );
}

export function mapLogoShareReady(sharedJson = {}) {
  return (Array.isArray(sharedJson?.places) ? sharedJson.places : []).length >= 1;
}

export function mapLogoSharePollSatisfied(sharedJson = {}) {
  return mapLogoShareReady(sharedJson) && thingCardSortTabsReady(sharedJson);
}
