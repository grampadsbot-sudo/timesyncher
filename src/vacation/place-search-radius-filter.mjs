import { categoryRadiusMeters } from './keepsake-list-minimums.mjs';
import { distanceMeters } from './place-search-same-place.mjs';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function anchorRadiusCenter(searchAnchorGeocode, searchCenter) {
  const anchorLat = finite(searchAnchorGeocode?.lat);
  const anchorLng = finite(searchAnchorGeocode?.lng);
  if (anchorLat !== null && anchorLng !== null) {
    return { lat: anchorLat, lng: anchorLng, label: String(searchAnchorGeocode?.label || '').trim() };
  }
  const centerLat = finite(searchCenter?.lat);
  const centerLng = finite(searchCenter?.lng);
  if (centerLat === null || centerLng === null) return null;
  return { lat: centerLat, lng: centerLng, label: String(searchCenter?.label || '').trim() };
}

export function filterPlacesWithinRadius(places = [], radiusCenter, categoryForPlace) {
  const rows = Array.isArray(places) ? places : [];
  if (!radiusCenter) return { places: rows, rejected: 0 };
  const kept = [];
  let rejected = 0;
  for (const place of rows) {
    const category = String(categoryForPlace(place) || '').trim().toLowerCase();
    const lat = finite(place?.lat);
    const lng = finite(place?.lng);
    if (lat === null || lng === null || !category) {
      rejected += 1;
      continue;
    }
    const meters = distanceMeters(radiusCenter, { lat, lng });
    if (meters === null || meters > categoryRadiusMeters(category)) {
      rejected += 1;
      continue;
    }
    kept.push(place);
  }
  return { places: kept, rejected };
}
