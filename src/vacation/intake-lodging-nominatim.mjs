import {
  nominatimForwardSearch as nominatimForwardSearchGeocode,
  nominatimReverseGeocode as nominatimReverseGeocodeGeocode,
} from './place-search-geocode.mjs';
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

function nominatimHitToPlace(hit = {}) {
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

function trimNominatimEvidenceRow(hit = {}) {
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

async function nominatimForwardSearch(fetchImpl, query, options = {}) {
  const { hits } = await nominatimForwardSearchGeocode(fetchImpl, query, null, options);
  return hits;
}

async function nominatimReverseGeocode(fetchImpl, lat, lng, options = {}) {
  const { reversed } = await nominatimReverseGeocodeGeocode(fetchImpl, lat, lng, null, options);
  return reversed;
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

function pushNominatimProvider(search, {
  status,
  reason = '',
  resultCount = 0,
  query = '',
  rawResults = [],
  calledAtMs = null,
  httpStatus = null,
}) {
  const providers = Array.isArray(search?.providers) ? [...search.providers] : [];
  providers.push({
    provider: 'nominatim',
    status,
    ...(reason ? { reason } : {}),
    resultCount,
    ...(query ? { query } : {}),
    rawResults: rawResults.slice(0, 5),
    ...(Number.isFinite(Number(calledAtMs)) ? { calledAtMs: Number(calledAtMs) } : {}),
    ...(Number.isFinite(Number(httpStatus)) ? { httpStatus: Number(httpStatus) } : {}),
  });
  search.providers = providers;
}

export async function nominatimForwardWithEvidence(fetchImpl, lookupQuery, search) {
  const query = String(lookupQuery || '').trim();
  try {
    const { hits, calledAtMs } = await nominatimForwardSearchGeocode(fetchImpl, query, null, { limit: 5 });
    pushNominatimProvider(search, {
      status: hits.length ? 'ok' : 'empty',
      reason: hits.length ? '' : 'no_results',
      resultCount: hits.length,
      query,
      rawResults: hits.map((row) => trimNominatimEvidenceRow(row)),
      calledAtMs,
    });
    return hits;
  } catch (error) {
    const reason = String(error?.message || error || 'nominatim forward failed').trim();
    const httpStatus = Number.isFinite(Number(error?.httpStatus)) ? Number(error.httpStatus) : null;
    pushNominatimProvider(search, {
      status: 'error',
      reason,
      resultCount: 0,
      query,
      rawResults: [],
      httpStatus,
    });
    return [];
  }
}

export async function nominatimReverseWithEvidence(fetchImpl, lat, lng, search) {
  try {
    const { reversed, calledAtMs } = await nominatimReverseGeocodeGeocode(fetchImpl, lat, lng, null);
    pushNominatimProvider(search, {
      status: reversed?.address ? 'ok' : 'empty',
      reason: reversed?.address ? '' : 'no_address',
      resultCount: reversed?.address ? 1 : 0,
      query: `reverse:${lat},${lng}`,
      rawResults: reversed?.hit ? [trimNominatimEvidenceRow(reversed.hit)] : [],
      calledAtMs,
    });
    return reversed;
  } catch (error) {
    const reason = String(error?.message || error || 'nominatim reverse failed').trim();
    const httpStatus = Number.isFinite(Number(error?.httpStatus)) ? Number(error.httpStatus) : null;
    pushNominatimProvider(search, {
      status: 'error',
      reason,
      resultCount: 0,
      query: `reverse:${lat},${lng}`,
      rawResults: [],
      httpStatus,
    });
    return null;
  }
}
