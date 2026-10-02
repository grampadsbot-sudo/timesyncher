import { intakeLodgingLookupQuery } from './intake-lodging-lookup.mjs';
import { buildProviderEnv, missingSearchKeys } from './provider-env.mjs';
import { PlaceSearchError } from './place-search-error.mjs';
import { resolveSearchContext } from './place-search-geocode.mjs';
import { trimBraveResultEvidence } from './brave-place-query.mjs';
import { queryBravePlaceSearch, placeSearchReadJson } from './place-search.mjs';

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
} = {}) {
  const providerEnv = buildProviderEnv(env);
  const name = String(propertyName || '').trim();
  const area = String(areaHint || '').trim();
  const destinationHint = String(destination || '').trim();
  const lookupQuery = intakeLodgingLookupQuery(name, area || destinationHint);
  const missing = missingSearchKeys(providerEnv);
  if (missing.length) {
    intakeSearchFail(`Place search refused to run. Missing ${missing.join(', ')}.`, 'missing_key');
  }
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
  let bravePlaces = [];
  let braveQuery = lookupQuery;
  let braveEndpoint = '';
  try {
    const found = await queryBravePlaceSearch(fetchImpl, providerEnv, {
      center,
      locationText,
      compactLocality: context.compactLocality || area || destinationHint,
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
    bravePlaces = Array.isArray(found?.places) ? found.places : [];
    braveQuery = String(found?.query || lookupQuery).trim();
    braveEndpoint = String(found?.endpoint || '').trim();
    const rawBraveResults = (Array.isArray(found?.rawResults) ? found.rawResults : [])
      .slice(0, 5)
      .map((row) => trimBraveResultEvidence(row));
    providerLog.push({
      provider: 'brave',
      status: bravePlaces.length ? 'ok' : 'empty',
      ...(bravePlaces.length ? {} : { reason: 'no_results' }),
      resultCount: bravePlaces.length,
      ...(braveQuery ? { query: braveQuery } : {}),
      ...(braveEndpoint ? { endpoint: braveEndpoint } : {}),
      rawResults: rawBraveResults,
    });
  } catch (error) {
    providerLog.push({
      provider: 'brave',
      status: 'error',
      reason: String(error?.message || error || 'brave failed').trim(),
      resultCount: 0,
      ...(error?.braveQuery ? { query: String(error.braveQuery).trim() } : {}),
      ...(error?.braveEndpoint ? { endpoint: String(error.braveEndpoint).trim() } : {}),
    });
    error.providers = providerLog;
    throw error;
  }
  return {
    places: bravePlaces,
    providers: providerLog,
    center,
    locationText,
    query: lookupQuery,
    destination: destinationHint || locationText,
  };
}
