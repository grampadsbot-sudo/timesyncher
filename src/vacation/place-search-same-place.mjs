const DEDUPE_METERS = 250;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function distanceMeters(origin, point) {
  const lat1 = finite(origin?.lat);
  const lng1 = finite(origin?.lng);
  const lat2 = finite(point?.lat);
  const lng2 = finite(point?.lng);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function samePlace(left, right) {
  const leftName = normalizeName(left?.title);
  const rightName = normalizeName(right?.title);
  if (!leftName || leftName !== rightName) return false;
  const meters = distanceMeters(left, right);
  if (meters === null) return true;
  return meters <= DEDUPE_METERS;
}
