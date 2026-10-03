import { categoryRadiusMeters } from './keepsake-list-minimums.mjs';
import { distanceMeters } from './place-search-same-place.mjs';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export const ANCHOR_RADIUS_SCOPE_LODGING = 'lodging_anchor';
export const ANCHOR_RADIUS_SCOPE_DESTINATION = 'destination';

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

export function anchorRadiusPolicySnapshot(radiusCenter, scope, categoryFallback = 'restaurant') {
  if (!radiusCenter) return null;
  const lat = Number(radiusCenter.lat);
  const lng = Number(radiusCenter.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    scope,
    center: {
      lat,
      lng,
      ...(radiusCenter.label ? { label: String(radiusCenter.label).trim() } : {}),
    },
    radiusMeters: radiusMetersForAnchorScope(categoryFallback, scope),
  };
}

export function radiusMetersForAnchorScope(category, scope = ANCHOR_RADIUS_SCOPE_LODGING) {
  if (scope === ANCHOR_RADIUS_SCOPE_DESTINATION) {
    return categoryRadiusMeters('activity');
  }
  return categoryRadiusMeters(category);
}

function placeTitle(place = {}) {
  return String(place?.title || place?.name || '').trim();
}

export function filterPlacesWithinRadius(places = [], radiusCenter, categoryForPlace, scope = ANCHOR_RADIUS_SCOPE_LODGING) {
  const rows = Array.isArray(places) ? places : [];
  if (!radiusCenter) return { places: rows, rejected: 0, rejections: [] };
  const kept = [];
  const rejections = [];
  let rejected = 0;
  for (const place of rows) {
    const category = String(categoryForPlace(place) || '').trim().toLowerCase();
    const lat = finite(place?.lat);
    const lng = finite(place?.lng);
    const title = placeTitle(place);
    const source = String(place?.source || '').trim();
    const limitMeters = radiusMetersForAnchorScope(category, scope);
    if (lat === null || lng === null || !category) {
      rejected += 1;
      rejections.push({
        title,
        source,
        lat,
        lng,
        meters: null,
        limitMeters,
        scope,
        reason: 'missing_coordinates_or_category',
      });
      continue;
    }
    const meters = distanceMeters(radiusCenter, { lat, lng });
    if (meters === null || meters > limitMeters) {
      rejected += 1;
      rejections.push({
        title,
        source,
        lat,
        lng,
        meters,
        limitMeters,
        scope,
        reason: 'outside_radius',
      });
      continue;
    }
    kept.push(place);
  }
  return { places: kept, rejected, rejections };
}
