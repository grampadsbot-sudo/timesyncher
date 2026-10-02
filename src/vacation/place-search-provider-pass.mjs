import { providerFailureMessage, resolveSearchContext, tryGeocodeLabel } from './place-search-geocode.mjs';
import { buildPlaceSearchFailureDiagnostics } from './place-search-failure-diagnostics.mjs';
import {
  ANCHOR_RADIUS_SCOPE_DESTINATION,
  ANCHOR_RADIUS_SCOPE_LODGING,
  anchorRadiusCenter,
  filterPlacesWithinRadius,
  radiusMetersForAnchorScope,
} from './place-search-radius-filter.mjs';
import { namedPlaceLookupFromQueries } from './place-search-named-target.mjs';

function providerRowIsError(row = {}) {
  return String(row?.status || '').trim().toLowerCase() === 'error';
}

function providerRowIsHit(row = {}) {
  return String(row?.status || '').trim().toLowerCase() === 'ok';
}

function providerRowRan(row = {}) {
  const status = String(row?.status || '').trim().toLowerCase();
  return status !== 'skipped';
}

function providerRowAnswered(row = {}) {
  const status = String(row?.status || '').trim().toLowerCase();
  return status === 'ok' || status === 'empty';
}

function httpStatusFromReason(reason) {
  const match = String(reason || '').match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

function placeResultProviderRows(providerLog = []) {
  return (Array.isArray(providerLog) ? providerLog : [])
    .filter((row) => PLACE_RESULT_PROVIDERS.has(String(row?.provider || '').trim()));
}

function providerErrorsFromProviderLog(providerLog = []) {
  return placeResultProviderRows(providerLog)
    .filter((row) => providerRowIsError(row))
    .map((row) => {
      const httpStatus = Number.isFinite(Number(row?.httpStatus))
        ? Number(row.httpStatus)
        : httpStatusFromReason(row?.reason);
      return {
        provider: String(row.provider || '').trim(),
        ...(Number.isFinite(httpStatus) ? { httpStatus } : {}),
        message: String(row?.reason || row?.status || 'error').trim(),
      };
    });
}

function placeResultProvidersAnswered(providerLog = []) {
  return placeResultProviderRows(providerLog).filter((row) => providerRowRan(row) && providerRowAnswered(row));
}

function everyPlaceResultProviderErrored(providerLog = []) {
  const ran = placeResultProviderRows(providerLog).filter((row) => providerRowRan(row));
  return ran.length > 0 && ran.every((row) => providerRowIsError(row));
}

const PLACE_RESULT_PROVIDERS = new Set(['prior_db', 'osm', 'brave']);

function resolveBraveCompactLocality({
  namedPlaceLookup,
  searchAnchor,
  context,
  relevanceContext,
  dest,
}) {
  if (namedPlaceLookup) {
    const fromContext = String(context?.compactLocality || context?.center?.compactLocality || '').trim();
    if (fromContext) return fromContext;
    const fromRelevance = String(relevanceContext?.area || '').trim();
    if (fromRelevance && !fromRelevance.includes(',')) return fromRelevance;
    const tripDest = String(dest || '').trim();
    if (tripDest && !tripDest.includes(',')) return tripDest;
    return fromRelevance || tripDest;
  }
  const anchor = String(searchAnchor?.text || '').trim();
  if (anchor) return anchor;
  const fromContext = String(context?.compactLocality || context?.center?.compactLocality || '').trim();
  if (fromContext) return fromContext;
  const fromRelevance = String(relevanceContext?.area || '').trim();
  if (fromRelevance && !fromRelevance.includes(',')) return fromRelevance;
  const tripDest = String(dest || '').trim();
  if (tripDest && !tripDest.includes(',')) return tripDest;
  return fromRelevance || tripDest;
}

function anchorRadiusPolicySnapshot(radiusCenter, scope, categoryFallback = 'restaurant') {
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

/** All place-result providers finished without errors and none returned live rows. */
export function placeSearchProvidersAllEmpty(providerLog = []) {
  const rows = (Array.isArray(providerLog) ? providerLog : [])
    .filter((row) => PLACE_RESULT_PROVIDERS.has(String(row?.provider || '').trim()));
  if (!rows.length) return false;
  if (rows.some(providerRowIsError)) return false;
  if (rows.some(providerRowIsHit)) return false;
  return rows.every((row) => {
    const status = String(row?.status || '').trim().toLowerCase();
    return status === 'empty' || status === 'skipped';
  });
}

export async function runPlaceProviderPass({
  fetchImpl,
  env,
  dest,
  lodging,
  lodgingPoint,
  keepAreaText = false,
  placeQueries,
  osmCategoryFilter = null,
  searchAnchor = null,
  relevanceContext,
  tripId,
  priorPlaces,
  loadPriorPlaces,
  readPriorPlaces = null,
  selectPriorPlaces,
  priorRowsFromInput,
  queryOsm,
  queryBrave,
  mergePlaces,
  attachRelevance,
  readJson,
  fail,
}) {
  const providerLog = [];
  const context = await resolveSearchContext(
    fetchImpl,
    { lodging, lodgingPoint, destination: dest, keepAreaText },
    providerLog,
    readJson,
    fail,
  );
  const center = context.center;
  const locationText = context.locationText || dest;
  const namedPlaceLookup = namedPlaceLookupFromQueries(placeQueries);
  const braveCompactLocality = resolveBraveCompactLocality({
    namedPlaceLookup,
    searchAnchor,
    context,
    relevanceContext,
    dest,
  });
  let braveLookups = [];
  const anchorText = String(searchAnchor?.text || '').trim();
  let anchorGeocode = null;
  if (anchorText && !namedPlaceLookup) {
    anchorGeocode = await tryGeocodeLabel(fetchImpl, anchorText, providerLog, readJson);
  }
  const lodgingRadiusCenter = namedPlaceLookup ? null : anchorRadiusCenter(anchorGeocode, null);
  const destinationRadiusCenter = anchorRadiusCenter(null, center);
  const radiusScope = namedPlaceLookup ? ANCHOR_RADIUS_SCOPE_DESTINATION : ANCHOR_RADIUS_SCOPE_LODGING;
  const radiusCenter = namedPlaceLookup
    ? destinationRadiusCenter
    : (lodgingRadiusCenter || destinationRadiusCenter);
  const queryCenter = namedPlaceLookup
    ? destinationRadiusCenter
    : (lodgingRadiusCenter || destinationRadiusCenter);
  const primaryCategory = String(placeQueries?.[0]?.category || 'restaurant').trim().toLowerCase();
  const anchorRadiusPolicy = anchorRadiusPolicySnapshot(radiusCenter, radiusScope, primaryCategory);
  let anchorRadiusRejected = 0;
  const anchorRadiusRejections = [];

  function dropOutsideAnchorRadius(places, categoryFallback = '') {
    if (!radiusCenter) return Array.isArray(places) ? places : [];
    const filtered = filterPlacesWithinRadius(
      places,
      radiusCenter,
      (place) => String(place?.category || categoryFallback || '').trim().toLowerCase(),
      radiusScope,
    );
    anchorRadiusRejected += filtered.rejected;
    if (Array.isArray(filtered.rejections) && filtered.rejections.length) {
      anchorRadiusRejections.push(...filtered.rejections);
    }
    return filtered.places;
  }

  let prior = [];
  if (queryCenter) {
    if (Array.isArray(priorPlaces)) prior = selectPriorPlaces(priorRowsFromInput(priorPlaces), queryCenter);
    else if (loadPriorPlaces) prior = await loadPriorPlaces(queryCenter);
    else if (readPriorPlaces) prior = await readPriorPlaces(queryCenter, { env, tripId });
    else prior = [];
    prior = dropOutsideAnchorRadius(
      (Array.isArray(prior) ? prior : []).map((place) => ({ ...place, source: 'prior_db' })),
    );
    providerLog.push({
      provider: 'prior_db',
      status: prior.length ? 'ok' : 'empty',
      ...(prior.length ? {} : { reason: 'no_results' }),
      resultCount: prior.length,
    });
  } else {
    providerLog.push({
      provider: 'prior_db',
      status: 'skipped',
      reason: 'no_coordinates',
      resultCount: 0,
    });
  }

  const osmFilter = Array.isArray(osmCategoryFilter)
    ? [...new Set(osmCategoryFilter.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean))]
    : [];
  const osmQuery = queryCenter && osmFilter.length
    ? queryOsm(fetchImpl, queryCenter, osmFilter).then((places) => ({ places })).catch((error) => ({ error }))
    : Promise.resolve({ skipped: queryCenter ? 'no_osm_category' : 'no_coordinates' });
  const braveQuery = queryBrave(fetchImpl, env, {
    center: queryCenter,
    locationText,
    compactLocality: braveCompactLocality,
    namedPlaceLookup,
  }, placeQueries).then((found) => ({ found })).catch((error) => ({ error }));
  const [osmSettled, braveSettled] = await Promise.all([osmQuery, braveQuery]);

  let osm = [];
  if (osmSettled.skipped) {
    providerLog.push({
      provider: 'osm',
      status: 'skipped',
      reason: osmSettled.skipped,
      resultCount: 0,
    });
  } else if (osmSettled.error) {
    const reason = String(osmSettled.error?.message || osmSettled.error || 'osm failed').trim();
    const httpStatus = httpStatusFromReason(reason);
    console.error(`place search provider osm failed: ${reason}`);
    providerLog.push({
      provider: 'osm',
      status: 'error',
      reason,
      ...(Number.isFinite(httpStatus) ? { httpStatus } : {}),
      resultCount: 0,
    });
  } else {
    osm = dropOutsideAnchorRadius(osmSettled.places);
    providerLog.push({
      provider: 'osm',
      status: osm.length ? 'ok' : 'empty',
      ...(osm.length ? {} : { reason: 'no_results' }),
      resultCount: osm.length,
    });
  }

  let brave = [];
  if (braveSettled.error) {
    const error = braveSettled.error;
    const reason = String(error?.message || error || 'brave failed').trim();
    const httpStatus = httpStatusFromReason(reason);
    const query = String(error?.braveQuery || '').trim();
    const endpoint = String(error?.braveEndpoint || '').trim();
    if (query && endpoint) braveLookups = [{ query, endpoint }];
    console.error(`place search provider brave failed: ${reason}`);
    providerLog.push({
      provider: 'brave',
      status: 'error',
      reason,
      ...(Number.isFinite(httpStatus) ? { httpStatus } : {}),
      resultCount: 0,
      ...(query ? { query } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
  } else {
    const found = braveSettled.found;
    if (Number(found?.anchorRadiusRejected) > 0) {
      anchorRadiusRejected += Number(found.anchorRadiusRejected);
    }
    if (Array.isArray(found?.anchorRadiusRejections) && found.anchorRadiusRejections.length) {
      anchorRadiusRejections.push(...found.anchorRadiusRejections);
    }
    brave = dropOutsideAnchorRadius(Array.isArray(found) ? found : (found?.places || []));
    const query = String(found?.query || '').trim();
    const endpoint = String(found?.endpoint || '').trim();
    if (Array.isArray(found?.braveLookups) && found.braveLookups.length) {
      braveLookups = found.braveLookups;
    } else if (query && endpoint) {
      braveLookups = [{ query, endpoint }];
    }
    providerLog.push({
      provider: 'brave',
      status: brave.length ? 'ok' : 'empty',
      ...(brave.length ? {} : { reason: 'no_results' }),
      resultCount: brave.length,
      ...(query ? { query } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
  }

  const dedupeMerges = [];
  const merged = mergePlaces([prior, osm, brave], { dedupeMerges });
  const namedArea = String(relevanceContext?.area || '').trim();
  const judgeArea = namedArea || locationText || dest;
  const judgeTarget = String(relevanceContext?.target || '').trim();
  const diagnosticsBase = (rejections = [], survivingPriorDbTitles = []) => {
    const providerErrors = providerErrorsFromProviderLog(providerLog);
    return buildPlaceSearchFailureDiagnostics({
      center,
      judgeTarget,
      judgeArea,
      anchor: searchAnchor,
      anchorRadiusRejected,
      anchorRadiusPolicy,
      anchorRadiusRejections,
      relevanceRejections: rejections,
      survivingPriorDbTitles,
      dedupeMerges,
      ...(providerErrors.length ? { providerErrors } : {}),
      ...(braveLookups.length ? { braveLookups } : {}),
    });
  };
  let relevance;
  try {
    relevance = await attachRelevance(merged, fetchImpl, env, {
      ...(relevanceContext || {}),
      area: judgeArea,
      locationText,
    });
  } catch (error) {
    if (String(error?.code || '') === 'relevance_judge_failed') {
      fail(
        String(error?.message || error),
        'relevance_judge_failed',
        providerLog,
        null,
        {
          ...diagnosticsBase(),
          judgeHttpStatus: Number.isFinite(Number(error?.judgeHttpStatus)) ? Number(error.judgeHttpStatus) : null,
          judgeBodySnippet: String(error?.judgeBodySnippet || '').trim() || null,
        },
      );
    }
    throw error;
  }
  const places = relevance.places;
  const relevanceRejections = relevance.rejections;
  const liveMerged = merged.filter((place) => place.source !== 'prior_db');
  const liveCount = places.filter((place) => place.source !== 'prior_db').length;
  if (!liveCount) {
    if (places.length) {
      const message = `Saved places are not a sole source. ${providerFailureMessage(providerLog)}`;
      fail(
        message,
        'prior_db_sole_source',
        providerLog,
        relevanceRejections,
        diagnosticsBase(relevanceRejections, places.map((place) => place.title)),
      );
    }
    if (liveMerged.length) {
      for (const row of providerLog) {
        if (row.provider === 'prior_db') continue;
        const rejected = liveMerged.filter((place) => place.source === row.provider).length;
        if (rejected > 0) row.relevanceRejected = rejected;
      }
      const message = `Place search relevance rejected all live provider results. ${providerFailureMessage(providerLog)}`;
      fail(message, 'relevance_rejected_all', providerLog, relevanceRejections, diagnosticsBase(relevanceRejections));
    }
    const nominatimErrored = providerLog.some(
      (row) => String(row?.provider || '').trim() === 'nominatim' && providerRowIsError(row),
    );
    const answeredProviders = placeResultProvidersAnswered(providerLog);
    if (placeSearchProvidersAllEmpty(providerLog) && !nominatimErrored) {
      return {
        status: 'no_results',
        center,
        locationText,
        places: [],
        providerLog,
        relevanceRejections: [],
        ...diagnosticsBase(),
      };
    }
    if (answeredProviders.length && !everyPlaceResultProviderErrored(providerLog)) {
      return {
        status: 'no_results',
        center,
        locationText,
        places: [],
        providerLog,
        relevanceRejections: [],
        ...diagnosticsBase(),
      };
    }
    const message = `Place search failed: ${providerFailureMessage(providerLog)}`;
    fail(message, 'all_providers_failed', providerLog, null, diagnosticsBase());
  }

  return {
    status: 'ok',
    center,
    locationText,
    places,
    providerLog,
    relevanceRejections,
    ...diagnosticsBase(relevanceRejections),
  };
}
