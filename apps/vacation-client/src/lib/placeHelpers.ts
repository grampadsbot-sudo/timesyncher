import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

export function placeName(place: SharedPlace): string {
  return String(place.name || place.title || 'Untitled').trim();
}

export function overrideFor(trip: SharedTripPayload, place: SharedPlace): Record<string, unknown> {
  return trip.thingOverrides?.[`place:${place.id}`] || {};
}

export function categoryKey(place: SharedPlace, trip: SharedTripPayload): string {
  const o = overrideFor(trip, place);
  const raw = String(
    o.category || place.category?.name || place.category_name || '',
  ).toLowerCase();
  if (raw.includes('flight') || raw === 'transport') return 'flight';
  if (raw.includes('hotel') || raw.includes('lodging')) return 'hotel';
  if (raw.includes('car')) return 'car';
  if (raw.includes('restaurant') || raw.includes('bar')) return 'restaurant';
  if (raw.includes('store') || raw.includes('shop')) return 'store';
  return 'event';
}

export function placesForTab(trip: SharedTripPayload, tab: string): SharedPlace[] {
  const places = trip.places || [];
  if (tab === 'flights') return places.filter((p) => categoryKey(p, trip) === 'flight');
  if (tab === 'hotels') return places.filter((p) => categoryKey(p, trip) === 'hotel');
  if (tab === 'cars') return places.filter((p) => categoryKey(p, trip) === 'car');
  if (tab === 'restaurants') return places.filter((p) => categoryKey(p, trip) === 'restaurant');
  if (tab === 'stores') return places.filter((p) => categoryKey(p, trip) === 'store');
  if (tab === 'events') {
    return places.filter((p) => {
      const k = categoryKey(p, trip);
      return k === 'event';
    });
  }
  return places;
}

export function priceLabel(place: SharedPlace, trip: SharedTripPayload): string {
  const o = overrideFor(trip, place);
  const price = o.price ?? o.priceLevel;
  if (price == null || price === '') return '';
  return typeof price === 'number' ? `$${price}` : String(price);
}

export function logoUrl(place: SharedPlace, trip: SharedTripPayload): string {
  const o = overrideFor(trip, place);
  const url = o.logoUrl || o.iconUrl;
  return typeof url === 'string' ? url : '';
}

export function summaryText(place: SharedPlace, trip: SharedTripPayload): string {
  const o = overrideFor(trip, place);
  const summary = o.summary || place.description;
  return typeof summary === 'string' ? summary : '';
}
