import { productThingCategory } from './keepsake-product-overrides.mjs';

function placeOverride(shared = {}, place = {}) {
  return shared?.thingOverrides?.[`place:${place.id}`] || {};
}

/** True when any place override carries an explicit `timeline` flag (live app itinerary picks). */
export function tripHasExplicitTimelineBudgetMembership(shared = {}) {
  const overrides = shared?.thingOverrides && typeof shared.thingOverrides === 'object'
    ? shared.thingOverrides
    : {};
  for (const [key, raw] of Object.entries(overrides)) {
    if (!key.startsWith('place:')) continue;
    if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'timeline')) {
      return true;
    }
  }
  return false;
}

/**
 * Live Budget tab row membership: legacy catalog totals when no timeline flags exist;
 * otherwise timeline-selected non-car places only (matches vacation-client buildBudgetModel).
 */
export function placeIncludedInLiveBudgetRows(shared = {}, place = {}, override = null, category = '') {
  const row = override || placeOverride(shared, place);
  const cat = String(category || productThingCategory(place, row)).toLowerCase();
  if (!tripHasExplicitTimelineBudgetMembership(shared)) {
    return true;
  }
  if (cat === 'car') return false;
  return !!row.timeline;
}

export function liveBudgetPlacesFromShared(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places : [];
  return places.filter((place) => {
    const override = placeOverride(shared, place);
    const category = productThingCategory(place, override);
    return placeIncludedInLiveBudgetRows(shared, place, override, category);
  });
}
