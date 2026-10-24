import { productThingCategory } from './keepsake-product-overrides.mjs';
import { assignedPlaceIds } from './itinerary-minimums.mjs';

function placeOverride(shared = {}, place = {}) {
  return shared?.thingOverrides?.[`place:${place.id}`] || {};
}

function placeKey(place = {}) {
  return String(place.id ?? place.place_id ?? '').trim();
}

/** Distinct place ids assigned to a trip day (assignments plus explicit dayIds overrides). */
export function timelineBudgetPlaceIds(shared = {}) {
  const ids = new Set();
  for (const id of assignedPlaceIds(shared)) {
    if (id) ids.add(String(id));
  }
  const overrides = shared?.thingOverrides && typeof shared.thingOverrides === 'object'
    ? shared.thingOverrides
    : {};
  for (const [key, raw] of Object.entries(overrides)) {
    if (!key.startsWith('place:')) continue;
    const dayIds = raw && typeof raw === 'object' && Array.isArray(raw.dayIds) ? raw.dayIds : [];
    if (!dayIds.length) continue;
    ids.add(key.slice('place:'.length));
  }
  return ids;
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

export function tripUsesTimelineScopedBudget(shared = {}) {
  if (timelineBudgetPlaceIds(shared).size > 0) return true;
  return tripHasExplicitTimelineBudgetMembership(shared);
}

export function placeOnTripTimeline(shared = {}, place = {}) {
  const key = placeKey(place);
  if (!key) return false;
  if (timelineBudgetPlaceIds(shared).has(key)) return true;
  const override = placeOverride(shared, place);
  const dayIds = Array.isArray(override.dayIds) ? override.dayIds : [];
  return dayIds.length > 0;
}

/**
 * Live Budget tab row membership: legacy catalog totals when no timeline scope exists;
 * otherwise day-assigned non-car places only (matches TREK Mo from Ci(day) rows).
 */
export function placeIncludedInLiveBudgetRows(shared = {}, place = {}, override = null, category = '') {
  const row = override || placeOverride(shared, place);
  const cat = String(category || productThingCategory(place, row)).toLowerCase();
  if (!tripUsesTimelineScopedBudget(shared)) {
    return true;
  }
  if (cat === 'car') return false;
  return placeOnTripTimeline(shared, place);
}

export function liveBudgetPlacesFromShared(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places : [];
  return places.filter((place) => {
    const override = placeOverride(shared, place);
    const category = productThingCategory(place, override);
    return placeIncludedInLiveBudgetRows(shared, place, override, category);
  });
}
