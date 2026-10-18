import { tabCategoryKey } from './listTabModel.mjs';

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function finiteCoord(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function placeCoords(place, trip) {
  const override = overrideFor(trip, place);
  const meta =
    place.metadata && typeof place.metadata === 'object' && !Array.isArray(place.metadata)
      ? place.metadata
      : {};
  const metaSource =
    meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : null;
  const source =
    override.sourceRecord ||
    place.sourceRecord ||
    metaSource ||
    (place.source && typeof place.source === 'object' ? place.source : null) ||
    {};
  const lat =
    finiteCoord(place.lat) ??
    finiteCoord(override.lat) ??
    finiteCoord(source.lat) ??
    finiteCoord(source.latitude);
  const lng =
    finiteCoord(place.lng) ??
    finiteCoord(override.lng) ??
    finiteCoord(source.lng) ??
    finiteCoord(source.longitude);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
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
