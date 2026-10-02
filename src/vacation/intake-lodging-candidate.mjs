import { categoryRadiusMeters } from './keepsake-list-minimums.mjs';
import { isLodgingProviderPlace } from './intake-lodging-category.mjs';
import { distanceMeters } from './place-search-same-place.mjs';

function normalizePlaceName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasCoordinates(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function significantNameTokens(name) {
  return normalizePlaceName(name).split(/\s+/).filter((token) => token.length >= 2);
}

function intakeLodgingNameMatches(statedName, placeTitle) {
  const stated = normalizePlaceName(statedName);
  const title = normalizePlaceName(placeTitle);
  if (!stated || !title) return false;
  if (stated === title) return true;
  if (title.includes(stated) || stated.includes(title)) return true;
  const tokens = significantNameTokens(statedName);
  if (!tokens.length) return false;
  const titleTokens = new Set(title.split(/\s+/).filter(Boolean));
  return tokens.every((token) => titleTokens.has(token));
}

function intakeLodgingAreaMatches(place, { areaCenter = null, areaText = '' } = {}) {
  const area = normalizePlaceName(areaText);
  const hasCenter = hasCoordinates(areaCenter);
  if (hasCenter && hasCoordinates(place)) {
    const meters = distanceMeters(areaCenter, place);
    if (meters !== null && meters <= categoryRadiusMeters('hotel')) return true;
  }
  if (area) {
    const address = normalizePlaceName(place?.address || '');
    const areaTokens = area.split(/\s+/).filter((token) => token.length >= 3);
    if (areaTokens.some((token) => address.includes(token))) return true;
    if (hasCenter) return false;
    return areaTokens.some((token) => normalizePlaceName(place?.title || '').includes(token));
  }
  return !hasCenter;
}

function distanceToArea(place, areaCenter) {
  if (!hasCoordinates(areaCenter) || !hasCoordinates(place)) return Number.POSITIVE_INFINITY;
  return distanceMeters(areaCenter, place) ?? Number.POSITIVE_INFINITY;
}

export function pickIntakeLodgingCandidate(places = [], {
  propertyName = '',
  areaText = '',
  areaCenter = null,
} = {}) {
  const rows = (Array.isArray(places) ? places : []).filter((place) => hasCoordinates(place));
  const lodging = rows.filter((place) => isLodgingProviderPlace(place));
  if (!lodging.length) return null;
  const named = lodging.filter((place) => intakeLodgingNameMatches(propertyName, place.title));
  if (!named.length) return null;
  const inArea = named.filter((place) => intakeLodgingAreaMatches(place, { areaCenter, areaText }));
  if (!inArea.length) return null;
  inArea.sort((left, right) => {
    const delta = distanceToArea(left, areaCenter) - distanceToArea(right, areaCenter);
    if (delta !== 0) return delta;
    return String(left.title || '').localeCompare(String(right.title || ''));
  });
  return inArea[0];
}

export function intakeLodgingPickMissReason(places = [], {
  propertyName = '',
  areaText = '',
  areaCenter = null,
} = {}) {
  const rows = (Array.isArray(places) ? places : []).filter((place) => hasCoordinates(place));
  if (!rows.length) return 'no_coordinates';
  const lodging = rows.filter((place) => isLodgingProviderPlace(place));
  if (!lodging.length) return 'no_hotel_category_result';
  const named = lodging.filter((place) => intakeLodgingNameMatches(propertyName, place.title));
  if (!named.length) return 'no_structural_name_match';
  const inArea = named.filter((place) => intakeLodgingAreaMatches(place, { areaCenter, areaText }));
  if (!inArea.length) return 'no_structural_area_match';
  return 'no_address';
}
