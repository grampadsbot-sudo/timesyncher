import { insertTripThing } from './trip-things.mjs';
import { placeToTripThing, searchPlaces, PlaceSearchError } from './place-search.mjs';
import { placeSearchTelemetry } from './in-turn-search-telemetry.mjs';
import {
  intakeLodgingLookupMissDiagnostic,
  intakeLodgingLookupProviderFailure,
  intakeLodgingLookupQuery,
  primaryLodgingLookupProvider,
} from './intake-lodging-lookup.mjs';

class IntakeLodgingResolveError extends Error {
  constructor(message, telemetry = null) {
    super(String(message || 'intake lodging lookup failed').trim());
    this.name = 'IntakeLodgingResolveError';
    this.telemetry = telemetry;
  }
}

function hasCoordinates(place) {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function lodgingLookupMiss({
  name,
  query,
  reason,
  search = {},
}) {
  const providerAttempts = Array.isArray(search?.providers) ? search.providers : [];
  const diagnostic = intakeLodgingLookupMissDiagnostic({
    propertyName: name,
    query,
    reason,
    provider: primaryLodgingLookupProvider(providerAttempts),
    providerAttempts,
  });
  console.error(`intake_lodging_lookup_miss: ${diagnostic.reason} query=${diagnostic.query} provider=${diagnostic.provider}`);
  return { ok: false, miss: diagnostic, search };
}

async function resolveIntakeLodgingThing({
  title = '',
  destinationHint = '',
  areaHint = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  const name = String(title || '').trim();
  if (!name) throw new IntakeLodgingResolveError('intake lodging thing missing a name');
  const geocodeDestination = String(destinationHint || areaHint || '').trim() || name;
  const lookupQuery = intakeLodgingLookupQuery(name, areaHint || destinationHint);
  let search;
  try {
    search = await searchImpl({
      destination: geocodeDestination,
      queries: [{
        category: 'hotel',
        q: lookupQuery,
        limit: 5,
        place: true,
        target: name,
      }],
      relevanceTarget: name,
      relevanceArea: geocodeDestination,
      env,
      fetchImpl,
    });
  } catch (error) {
    const providerAttempts = Array.isArray(error?.providers) ? error.providers : [];
    if (!intakeLodgingLookupProviderFailure(error, providerAttempts)) {
      return lodgingLookupMiss({
        name,
        query: lookupQuery,
        reason: String(error?.code || error?.message || 'no_results').trim(),
        search: { providers: providerAttempts },
      });
    }
    const telemetry = placeSearchTelemetry({
      status: 'failed',
      error: String(error?.message || error || 'intake lodging lookup failed').trim(),
      things: [],
      providerAttempts,
    });
    throw new IntakeLodgingResolveError(telemetry.error, telemetry);
  }
  const places = (Array.isArray(search?.places) ? search.places : []).filter((place) => hasCoordinates(place));
  const hotel = places.find((place) => String(place?.category || '').toLowerCase() === 'hotel');
  if (!hotel) {
    return lodgingLookupMiss({
      name,
      query: lookupQuery,
      reason: places.length ? 'no_hotel_category_result' : 'no_coordinates',
      search,
    });
  }
  if (!hasCoordinates(hotel)) {
    return lodgingLookupMiss({
      name,
      query: lookupQuery,
      reason: 'no_coordinates',
      search,
    });
  }
  const thing = placeToTripThing(hotel);
  const address = String(thing?.location?.address || thing?.description || '').trim();
  if (!hasCoordinates(thing.location) || !address) {
    return lodgingLookupMiss({
      name,
      query: lookupQuery,
      reason: 'no_address',
      search,
    });
  }
  return { ok: true, thing, search };
}

async function persistTripStatedLodgingArea(db, tripId, areaHint = '') {
  const area = String(areaHint || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!db || !tripId || !area) return;
  await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) || ${{ statedLodgingArea: area }},
        updated_at = now()
    where id = ${tripId}
  `;
}

export async function persistIntakeLodgingThings(db, tripId, requestId, lodgingThings, {
  destinationHint = '',
  areaHint = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
  existingTitles = [],
} = {}) {
  const have = new Set((Array.isArray(existingTitles) ? existingTitles : []).map((title) => String(title || '').toLowerCase()));
  const saved = [];
  const misses = [];
  const resolvedArea = String(areaHint || destinationHint || '').trim();
  for (const wanted of Array.isArray(lodgingThings) ? lodgingThings : []) {
    const title = String(wanted?.title || wanted?.name || '').trim();
    if (!title || have.has(title.toLowerCase())) continue;
    const outcome = await resolveIntakeLodgingThing({
      title,
      destinationHint,
      areaHint: resolvedArea,
      env,
      fetchImpl,
      searchImpl,
    });
    if (outcome.ok !== true) {
      if (outcome.miss) misses.push(outcome.miss);
      if (resolvedArea) await persistTripStatedLodgingArea(db, tripId, resolvedArea);
      continue;
    }
    const inserted = await insertTripThing(db, { tripId, requestId, thing: outcome.thing });
    if (inserted) {
      have.add(title.toLowerCase());
      saved.push(inserted);
    }
  }
  return { saved, misses };
}

export async function persistIntakeLodgingLookupOnCustomerTurn(db, turnId, misses = []) {
  const id = String(turnId || '').trim();
  const rows = (Array.isArray(misses) ? misses : []).filter((row) => row && typeof row === 'object');
  if (!id || !rows.length) return;
  const existing = await db`
    select payload
    from transcript_turns
    where id = ${id}
    limit 1
  `;
  const payload = existing[0]?.payload && typeof existing[0].payload === 'object' ? { ...existing[0].payload } : {};
  payload.intakeLodgingLookup = rows;
  const live = payload.liveTranscript && typeof payload.liveTranscript === 'object'
    ? { ...payload.liveTranscript, intakeLodgingLookup: rows }
    : payload.liveTranscript;
  if (live) payload.liveTranscript = live;
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${id}
  `;
}

export { IntakeLodgingResolveError };
