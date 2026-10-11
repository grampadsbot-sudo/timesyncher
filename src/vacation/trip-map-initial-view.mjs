export const MAP_CENTER_UNRESOLVED = 'map_center_unresolved';

export const TRIP_MAP_SINGLE_POINT_ZOOM = 12;
export const TRIP_MAP_DESTINATION_ZOOM = 11;
export const TRIP_MAP_FIT_MAX_ZOOM = 15;

export function finiteCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointFromLatLng(lat, lng) {
  const la = finiteCoord(lat);
  const ln = finiteCoord(lng);
  if (la === null || ln === null) return null;
  return { lat: la, lng: ln };
}

function pointFromRecord(record = {}) {
  if (!record || typeof record !== 'object') return null;
  const nested = record.location && typeof record.location === 'object' ? record.location : {};
  return pointFromLatLng(
    record.lat ?? record.latitude ?? nested.lat ?? nested.latitude,
    record.lng ?? record.longitude ?? nested.lng ?? nested.longitude,
  );
}

export function coordsFromPlace(place = {}) {
  return pointFromRecord(place);
}

export function destinationCoordsFromTrip(trip = {}) {
  const direct = pointFromRecord(trip);
  if (direct) return direct;
  const meta = trip.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  const fromMeta = pointFromRecord(meta.destinationCenter)
    || pointFromRecord(meta.searchCenter)
    || pointFromRecord(meta.destinationCoordinates)
    || pointFromRecord(meta.destinationLocation);
  if (fromMeta) return fromMeta;
  return pointFromLatLng(trip.destination_lat ?? trip.destinationLat, trip.destination_lng ?? trip.destinationLng);
}

/**
 * @param {{ places?: object[], trip?: object }} input
 * @returns {{
 *   ok: true,
 *   mode: 'bounds' | 'point' | 'destination',
 *   center: { lat: number, lng: number },
 *   zoom: number,
 *   maxZoom: number,
 *   points: { lat: number, lng: number }[],
 * } | {
 *   ok: false,
 *   code: string,
 * }}
 */
export function computeTripMapInitialView({ places = [], trip = {} } = {}) {
  const points = [];
  const seen = new Set();
  for (const place of places || []) {
    const point = coordsFromPlace(place);
    if (!point) continue;
    const key = `${point.lat},${point.lng}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(point);
  }

  if (points.length > 1) {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const center = {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
    return {
      ok: true,
      mode: 'bounds',
      center,
      zoom: TRIP_MAP_DESTINATION_ZOOM,
      maxZoom: TRIP_MAP_FIT_MAX_ZOOM,
      points,
    };
  }

  if (points.length === 1) {
    return {
      ok: true,
      mode: 'point',
      center: points[0],
      zoom: TRIP_MAP_SINGLE_POINT_ZOOM,
      maxZoom: TRIP_MAP_SINGLE_POINT_ZOOM,
      points,
    };
  }

  const destination = destinationCoordsFromTrip(trip);
  if (destination) {
    return {
      ok: true,
      mode: 'destination',
      center: destination,
      zoom: TRIP_MAP_DESTINATION_ZOOM,
      maxZoom: TRIP_MAP_DESTINATION_ZOOM,
      points: [destination],
    };
  }

  return { ok: false, code: MAP_CENTER_UNRESOLVED };
}

export function tripMapInitialViewBundleSnippet() {
  return `const tsTripMapInitialView=(${computeTripMapInitialView.toString()});`;
}
