import { intakeLodgingLookupQuery } from './intake-lodging-lookup.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { PlaceSearchError } from './place-search-error.mjs';
import { resolveSearchContext } from './place-search-geocode.mjs';
import { placeSearchReadJson } from './place-search.mjs';
import { queryVkSearchPlaces } from './vk-search-place-identity.mjs';

function intakeSearchFail(message, code) {
  throw new PlaceSearchError(message, code);
}

export async function searchIntakeLodgingPlaces({
  destination = '',
  areaHint = '',
  propertyName = '',
  tripId = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  vkSearchImpl = null,
} = {}) {
  const providerEnv = buildProviderEnv(env);
  const name = String(propertyName || '').trim();
  const area = String(areaHint || '').trim();
  const destinationHint = String(destination || '').trim();
  const lookupQuery = intakeLodgingLookupQuery(name, area || destinationHint);
  const providerLog = [];
  const geocodeLabel = area || destinationHint || name;
  const context = await resolveSearchContext(
    fetchImpl,
    { destination: geocodeLabel, keepAreaText: true },
    providerLog,
    placeSearchReadJson,
    intakeSearchFail,
  );
  const center = context.center;
  const locationText = context.locationText || geocodeLabel;
  let vkPlaces = [];
  let vkQuery = lookupQuery;
  try {
    const found = await queryVkSearchPlaces(fetchImpl, providerEnv, {
      center,
      locationText,
      compactLocality: context.compactLocality || area || destinationHint,
      namedPlaceLookup: true,
      vkSearchImpl,
    }, [{
      category: 'hotel',
      q: lookupQuery,
      target: name,
      areaHint: area || destinationHint,
      propertyName: name,
      intakeLodgingLookup: true,
      limit: 5,
      place: true,
    }]);
    vkPlaces = Array.isArray(found?.places) ? found.places : [];
    vkQuery = String(found?.query || lookupQuery).trim();
    const rawResults = (Array.isArray(found?.rawResults) ? found.rawResults : []).slice(0, 5);
    if (found?.skipped) {
      providerLog.push({
        provider: 'vk-search',
        status: 'skipped',
        reason: found.skipped,
        resultCount: 0,
        ...(vkQuery ? { query: vkQuery } : {}),
        rawResults,
      });
    } else {
      providerLog.push({
        provider: 'vk-search',
        status: vkPlaces.length ? 'ok' : 'empty',
        ...(vkPlaces.length ? {} : { reason: found?.unresolvedReasons?.[0] || 'no_results' }),
        resultCount: vkPlaces.length,
        ...(vkQuery ? { query: vkQuery } : {}),
        rawResults,
      });
    }
  } catch (error) {
    providerLog.push({
      provider: 'vk-search',
      status: 'error',
      reason: String(error?.message || error || 'vk-search failed').trim(),
      resultCount: 0,
      ...(vkQuery ? { query: vkQuery } : {}),
    });
    error.providers = providerLog;
    throw error;
  }
  return {
    places: vkPlaces,
    providers: providerLog,
    center,
    locationText,
    query: lookupQuery,
    destination: destinationHint || locationText,
  };
}
