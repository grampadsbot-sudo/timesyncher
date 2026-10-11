import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import {
  logoUrlForPlace,
  numericPrice,
  placesForCategoryTab,
  rowSummary,
  tabCategoryKey,
} from './listTabModel.mjs';

export { tabCategoryKey as categoryKey, placesForCategoryTab as placesForTab };

export function placeName(place: SharedPlace): string {
  return String(place.name || place.title || 'Untitled').trim();
}

export function overrideFor(trip: SharedTripPayload, place: SharedPlace): Record<string, unknown> {
  return trip.thingOverrides?.[`place:${place.id}`] || {};
}

export function priceLabel(place: SharedPlace, trip: SharedTripPayload): string {
  const price = numericPrice(place, trip);
  if (price == null) return '';
  return `$${price}`;
}

export function logoUrl(place: SharedPlace, trip: SharedTripPayload): string {
  return logoUrlForPlace(place, trip);
}

export function summaryText(place: SharedPlace, trip: SharedTripPayload): string {
  return rowSummary(place, trip);
}
