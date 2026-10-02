import { placeSearchReadJson } from './place-search.mjs';
import {
  pickIntakeLodgingCandidate,
  intakeLodgingPickMissReason,
} from './intake-lodging-candidate.mjs';
import { isLodgingProviderPlace } from './intake-lodging-category.mjs';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nominatimTags(hit = {}) {
  const address = hit?.address && typeof hit.address === 'object' ? hit.address : {};
  const extratags = hit?.extratags && typeof hit.extratags === 'object' ? hit.extratags : {};
  const namedetails = hit?.namedetails && typeof hit.namedetails === 'object' ? hit.namedetails : {};
  const tourism = String(extratags.tourism || address.tourism || '').trim().toLowerCase();
  return {
    tourism,
    name: String(namedetails.name || hit?.name || '').trim(),
    class: String(hit?.class || '').trim(),
    type: String(hit?.type || '').trim(),
  };
}

export function nominatimHitToPlace(hit = {}) {
  const lat = finite(hit?.lat);
  const lng = finite(hit?.lon ?? hit?.lng);
  const tags = nominatimTags(hit);
  const title = tags.name || String(hit?.display_name || '').split(',')[0].trim();
  const address = String(hit?.display_name || '').trim();
  const osmType = String(hit?.osm_type || hit?.type || '').trim();
  const osmId = String(hit?.osm_id || hit?.place_id || '').trim();
  const externalId = osmId ? `osm:${osmType || 'node'}/${osmId}` : '';
  const lodgingTourism = tags.tourism && ['hotel', 'apartment', 'guest_house', 'chalet', 'motel'].includes(tags.tourism);
  return {
    source: 'osm',
    title,
    category: lodgingTourism ? 'hotel' : String(tags.class || 'activity'),
    lat,
    lng,
    address,
    externalId,
    osmTags: tags.tourism ? { tourism: tags.tourism } : {},
    providerCategories: tags.tourism ? [`tourism=${tags.tourism}`] : (tags.class ? [tags.class] : []),
    nominatimClass: tags.class,
    nominatimType: tags.type,
    sourceRecord: hit,
  };
}

export function trimNominatimEvidenceRow(hit = {}) {
  const tags = nominatimTags(hit);
  const lat = finite(hit?.lat);
  const lng = finite(hit?.lon ?? hit?.lng);
  return {
    title: String(hit?.display_name || tags.name || '').slice(0, 240),
    id: String(hit?.osm_id || hit?.place_id || '').slice(0, 120),
    class: tags.class,
    type: tags.type,
    tourism: tags.tourism || null,
    coordinates: lat !== null && lng !== null ? [lat, lng] : null,
    address: hit?.address && typeof hit.address === 'object' ? { ...hit.address } : null,
  };
}

export async function nominatimForwardSearch(fetchImpl, query, { limit = 5 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${Math.min(Math.max(limit, 1), 10)}&q=${encodeURIComponent(q)}`;
  const payload = await placeSearchReadJson(fetchImpl, url, { label: 'Nominatim forward' });
  return (Array.isArray(payload) ? payload : []).slice(0, limit);
}

export async function nominatimReverseGeocode(fetchImpl, lat, lng) {
  const pointLat = finite(lat);
  const pointLng = finite(lng);
  if (pointLat === null || pointLng === null) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pointLat}&lon=${pointLng}`;
  const payload = await placeSearchReadJson(fetchImpl, url, { label: 'Nominatim reverse' });
  if (!payload || typeof payload !== 'object') return null;
  const address = String(payload.display_name || '').trim();
  if (!address) return null;
  return {
    address,
    hit: payload,
    lat: finite(payload.lat) ?? pointLat,
    lng: finite(payload.lon ?? payload.lng) ?? pointLng,
  };
}

export function pickNominatimLodgingCandidate(hits = [], options = {}, { requireTourismLodging = false } = {}) {
  const places = (Array.isArray(hits) ? hits : [])
    .map((hit) => nominatimHitToPlace(hit))
    .filter((place) => finite(place.lat) !== null && finite(place.lng) !== null);
  const lodgingFiltered = requireTourismLodging
    ? places.filter((place) => isLodgingProviderPlace(place))
    : places;
  return pickIntakeLodgingCandidate(lodgingFiltered, options);
}

export function nominatimLodgingPickMissReason(hits = [], options = {}, { requireTourismLodging = false } = {}) {
  const places = (Array.isArray(hits) ? hits : [])
    .map((hit) => nominatimHitToPlace(hit))
    .filter((place) => finite(place.lat) !== null && finite(place.lng) !== null);
  const lodgingFiltered = requireTourismLodging
    ? places.filter((place) => isLodgingProviderPlace(place))
    : places;
  return intakeLodgingPickMissReason(lodgingFiltered, options);
}
