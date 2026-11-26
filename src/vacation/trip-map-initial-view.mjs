export const MAP_CENTER_UNRESOLVED = 'map_center_unresolved';

export const TRIP_MAP_SINGLE_POINT_ZOOM = 12;
export const TRIP_MAP_DESTINATION_ZOOM = 11;
export const TRIP_MAP_FIT_MAX_ZOOM = 15;
const MAP_COORD_NEAR_ORIGIN_EPSILON = 0.5;

export function finiteCoord(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isUsableMapLatLng(lat, lng) {
  const la = finiteCoord(lat);
  const ln = finiteCoord(lng);
  if (la === null || ln === null) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  if (la === 0 && ln === 0) return false;
  if (Math.abs(la) < MAP_COORD_NEAR_ORIGIN_EPSILON && Math.abs(ln) < MAP_COORD_NEAR_ORIGIN_EPSILON) {
    return false;
  }
  return true;
}

function pointFromLatLng(lat, lng) {
  if (!isUsableMapLatLng(lat, lng)) return null;
  return { lat: finiteCoord(lat), lng: finiteCoord(lng) };
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
  return [
    `const MAP_CENTER_UNRESOLVED=${JSON.stringify(MAP_CENTER_UNRESOLVED)};`,
    `const TRIP_MAP_SINGLE_POINT_ZOOM=${TRIP_MAP_SINGLE_POINT_ZOOM};`,
    `const TRIP_MAP_DESTINATION_ZOOM=${TRIP_MAP_DESTINATION_ZOOM};`,
    `const TRIP_MAP_FIT_MAX_ZOOM=${TRIP_MAP_FIT_MAX_ZOOM};`,
    `const MAP_COORD_NEAR_ORIGIN_EPSILON=${MAP_COORD_NEAR_ORIGIN_EPSILON};`,
    finiteCoord.toString(),
    isUsableMapLatLng.toString(),
    pointFromLatLng.toString(),
    pointFromRecord.toString(),
    coordsFromPlace.toString(),
    destinationCoordsFromTrip.toString(),
    `const tsTripMapInitialView=${computeTripMapInitialView.toString()};`,
    'const tsUsableMapLatLng=isUsableMapLatLng;',
  ].join('');
}
