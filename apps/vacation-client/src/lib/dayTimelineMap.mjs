import { tabCategoryKey } from './listTabModel.mjs';

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function coordNumber(primary, fallback) {
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
  if (primary === null || primary === undefined || primary === '') return null;
  const parsed = Number(primary ?? fallback);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function placeCoords(place, trip) {
  const override = overrideFor(trip, place);
  const lat = coordNumber(place.lat, override.lat);
  const lng = coordNumber(place.lng, override.lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

export function mapPlacesForTimeline(trip, entries) {
  const seen = new Set();
  const markers = [];
  for (const entry of entries) {
    if (entry.kind === 'travel' || !entry.place) continue;
    const category = tabCategoryKey(entry.place, trip);
    if (category === 'flight' || category === 'car') continue;
    const coords = placeCoords(entry.place, trip);
    if (!coords) continue;
    const key = String(entry.place.id);
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push({ ...entry.place, lat: coords.lat, lng: coords.lng });
  }
  return markers;
}
