import { providerFailureMessage, resolveSearchContext } from './place-search-geocode.mjs';

export async function runPlaceProviderPass({
  fetchImpl,
  env,
  dest,
  lodging,
  lodgingPoint,
  keepAreaText = false,
  placeQueries,
  relevanceContext,
  priorPlaces,
  loadPriorPlaces,
  readPriorPlaces,
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
    else prior = await readPriorPlaces(center, { env });
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
  if (center) {
    try {
      osm = await queryOsm(fetchImpl, center);
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

  const merged = mergePlaces([prior, osm, brave]);
  const relevance = await attachRelevance(merged, fetchImpl, env, {
    ...(relevanceContext || {}),
    area: locationText || relevanceContext?.area || dest,
    locationText,
  });
  const places = relevance.places;
  const relevanceRejections = relevance.rejections;
  const liveMerged = merged.filter((place) => place.source !== 'prior_db');
  const liveCount = places.filter((place) => place.source !== 'prior_db').length;
  if (!liveCount) {
    if (places.length) {
      const message = `Saved places are not a sole source. ${providerFailureMessage(providerLog)}`;
      fail(message, 'prior_db_sole_source', providerLog);
    }
    if (liveMerged.length) {
      for (const row of providerLog) {
        if (row.provider === 'prior_db') continue;
        const rejected = liveMerged.filter((place) => place.source === row.provider).length;
        if (rejected > 0) row.relevanceRejected = rejected;
      }
      const message = `Place search relevance rejected all live provider results. ${providerFailureMessage(providerLog)}`;
      fail(message, 'relevance_rejected_all', providerLog, relevanceRejections);
    }
    const message = `Place search failed: ${providerFailureMessage(providerLog)}`;
    fail(message, 'all_providers_failed', providerLog);
  }

  return { center, locationText, places, providerLog, relevanceRejections };
}
