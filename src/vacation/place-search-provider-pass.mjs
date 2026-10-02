import { providerFailureMessage, resolveSearchContext } from './place-search-geocode.mjs';
import { buildPlaceSearchFailureDiagnostics } from './place-search-failure-diagnostics.mjs';

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

  let prior = [];
  if (center) {
    if (Array.isArray(priorPlaces)) prior = selectPriorPlaces(priorRowsFromInput(priorPlaces), center);
    else if (loadPriorPlaces) prior = await loadPriorPlaces(center);
    else if (readPriorPlaces) prior = await readPriorPlaces(center, { env, tripId });
    else prior = [];
    prior = (Array.isArray(prior) ? prior : []).map((place) => ({ ...place, source: 'prior_db' }));
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

  let osm = [];
  const osmFilter = Array.isArray(osmCategoryFilter)
    ? [...new Set(osmCategoryFilter.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean))]
    : [];
  if (center && osmFilter.length) {
    try {
      osm = await queryOsm(fetchImpl, center, osmFilter);
      providerLog.push({
        provider: 'osm',
        status: osm.length ? 'ok' : 'empty',
        ...(osm.length ? {} : { reason: 'no_results' }),
        resultCount: osm.length,
      });
    } catch (error) {
      providerLog.push({
        provider: 'osm',
        status: 'error',
        reason: String(error?.message || error || 'osm failed').trim(),
        resultCount: 0,
      });
    }
  } else if (center) {
    providerLog.push({
      provider: 'osm',
      status: 'skipped',
      reason: 'no_osm_category',
      resultCount: 0,
    });
  } else {
    providerLog.push({
      provider: 'osm',
      status: 'skipped',
      reason: 'no_coordinates',
      resultCount: 0,
    });
  }

  let brave = [];
  try {
    const found = await queryBrave(fetchImpl, env, { center, locationText }, placeQueries);
    brave = Array.isArray(found) ? found : (found?.places || []);
    const query = String(found?.query || '').trim();
    const endpoint = String(found?.endpoint || '').trim();
    providerLog.push({
      provider: 'brave',
      status: brave.length ? 'ok' : 'empty',
      ...(brave.length ? {} : { reason: 'no_results' }),
      resultCount: brave.length,
      ...(query ? { query } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
  } catch (error) {
    const query = String(error?.braveQuery || '').trim();
    const endpoint = String(error?.braveEndpoint || '').trim();
    providerLog.push({
      provider: 'brave',
      status: 'error',
      reason: String(error?.message || error || 'brave failed').trim(),
      resultCount: 0,
      ...(query ? { query } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
  }

  const dedupeMerges = [];
  const merged = mergePlaces([prior, osm, brave], { dedupeMerges });
  const namedArea = String(relevanceContext?.area || '').trim();
  const judgeArea = namedArea || locationText || dest;
  const judgeTarget = String(relevanceContext?.target || '').trim();
  const diagnosticsBase = (rejections = [], survivingPriorDbTitles = []) => buildPlaceSearchFailureDiagnostics({
    center,
    judgeTarget,
    judgeArea,
    anchor: searchAnchor,
    relevanceRejections: rejections,
    survivingPriorDbTitles,
    dedupeMerges,
  });
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
    const message = `Place search failed: ${providerFailureMessage(providerLog)}`;
    fail(message, 'all_providers_failed', providerLog, null, diagnosticsBase());
  }

  return {
    center,
    locationText,
    places,
    providerLog,
    relevanceRejections,
    ...diagnosticsBase(relevanceRejections),
  };
}
