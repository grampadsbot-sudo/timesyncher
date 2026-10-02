import { insertTripThing } from './trip-things.mjs';
import { placeToTripThing, searchPlaces } from './place-search.mjs';
import { placeSearchTelemetry } from './in-turn-search-telemetry.mjs';

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

async function resolveIntakeLodgingThing({
  title = '',
  destinationHint = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  const name = String(title || '').trim();
  if (!name) throw new IntakeLodgingResolveError('intake lodging thing missing a name');
  const destination = String(destinationHint || '').trim() || name;
  let search;
  try {
    search = await searchImpl({
      destination,
      queries: [{ category: 'hotel', q: name, limit: 5, place: true }],
      relevanceTarget: name,
      relevanceArea: destination,
      env,
      fetchImpl,
    });
  } catch (error) {
    const telemetry = placeSearchTelemetry({
      status: 'failed',
      error: String(error?.message || error || 'intake lodging lookup failed').trim(),
      things: [],
      providerAttempts: Array.isArray(error?.providers) ? error.providers : [],
    });
    throw new IntakeLodgingResolveError(telemetry.error, telemetry);
  }
  const places = (Array.isArray(search?.places) ? search.places : []).filter((place) => hasCoordinates(place));
  const hotel = places.find((place) => String(place?.category || '').toLowerCase() === 'hotel') || places[0];
  if (!hotel || !hasCoordinates(hotel)) {
    const telemetry = placeSearchTelemetry({
      status: 'failed',
      error: `intake lodging lookup returned no coordinates for ${name}`,
      things: [],
      providerAttempts: Array.isArray(search?.providers) ? search.providers : [],
    });
    console.error(`intake lodging lookup failed: ${telemetry.error}`);
    throw new IntakeLodgingResolveError(telemetry.error, telemetry);
  }
  const thing = placeToTripThing(hotel);
  const address = String(thing?.location?.address || thing?.description || '').trim();
  if (!hasCoordinates(thing.location) || !address) {
    const telemetry = placeSearchTelemetry({
      status: 'failed',
      error: `intake lodging lookup returned no address for ${name}`,
      things: [],
      providerAttempts: Array.isArray(search?.providers) ? search.providers : [],
    });
    throw new IntakeLodgingResolveError(telemetry.error, telemetry);
  }
  return { thing, search };
}

export async function persistIntakeLodgingThings(db, tripId, requestId, lodgingThings, {
  destinationHint = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
  existingTitles = [],
} = {}) {
  const have = new Set((Array.isArray(existingTitles) ? existingTitles : []).map((title) => String(title || '').toLowerCase()));
  const saved = [];
  for (const wanted of Array.isArray(lodgingThings) ? lodgingThings : []) {
    const title = String(wanted?.title || wanted?.name || '').trim();
    if (!title || have.has(title.toLowerCase())) continue;
    const { thing } = await resolveIntakeLodgingThing({
      title,
      destinationHint,
      env,
      fetchImpl,
      searchImpl,
    });
    const inserted = await insertTripThing(db, { tripId, requestId, thing });
    if (inserted) {
      have.add(title.toLowerCase());
      saved.push(inserted);
    }
  }
  return saved;
}
