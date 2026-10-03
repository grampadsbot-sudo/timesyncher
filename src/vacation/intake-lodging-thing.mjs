import { insertTripThing, tripThingRow } from './trip-things.mjs';
import { placeToTripThing, PlaceSearchError } from './place-search.mjs';
import { braveAddress } from './brave-place-query.mjs';
import {
  rankIntakeLodgingCandidates,
  intakeLodgingPickMissReason,
} from './intake-lodging-candidate.mjs';
import { isLodgingProviderPlace } from './intake-lodging-category.mjs';
import { searchIntakeLodgingPlaces } from './intake-lodging-search.mjs';
import { placeSearchTelemetry } from './in-turn-search-telemetry.mjs';
import {
  intakeLodgingLookupMissDiagnostic,
  intakeLodgingLookupOkDiagnostic,
  intakeLodgingLookupProviderFailure,
  intakeLodgingLookupQuery,
  intakeLodgingLookupWithEvidence,
  primaryLodgingLookupProvider,
} from './intake-lodging-lookup.mjs';
import { buildIntakeLodgingOutcome } from './intake-lodging-turn-outcome.mjs';
import {
  nominatimForwardWithEvidence,
  nominatimReverseWithEvidence,
  nominatimLodgingPickMissReason,
  pickNominatimLodgingCandidate,
} from './intake-lodging-nominatim.mjs';
import { intakeLodgingWanted } from './trip-intake-classify.mjs';

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

function thingMetadata(thing = {}) {
  return thing?.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
}

function lodgingLookupMiss({
  name,
  query,
  reason,
  search = {},
  addressSource = '',
  coordsSource = '',
}) {
  const providerAttempts = Array.isArray(search?.providers) ? search.providers : [];
  const diagnostic = intakeLodgingLookupWithEvidence(intakeLodgingLookupMissDiagnostic({
    propertyName: name,
    query,
    reason,
    provider: primaryLodgingLookupProvider(providerAttempts),
    providerAttempts,
  }), search);
  if (addressSource) diagnostic.addressSource = addressSource;
  if (coordsSource) diagnostic.coordsSource = coordsSource;
  console.error(`intake_lodging_lookup_miss: ${diagnostic.reason} query=${diagnostic.query} provider=${diagnostic.provider}`);
  return { ok: false, miss: diagnostic, lookup: diagnostic, search };
}

function usableBraveAddress(picked = {}) {
  const direct = String(picked?.address || '').trim();
  if (direct) return direct;
  const record = picked?.sourceRecord && typeof picked.sourceRecord === 'object' ? picked.sourceRecord : null;
  return braveAddress(record);
}

function braveLodgingCategoryEstablished(places = []) {
  return (Array.isArray(places) ? places : []).some((place) => hasCoordinates(place) && isLodgingProviderPlace(place));
}

async function resolveIntakeLodgingThing({
  title = '',
  destinationHint = '',
  areaHint = '',
  tripId = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchIntakeLodgingPlaces,
} = {}) {
  const name = String(title || '').trim();
  if (!name) throw new IntakeLodgingResolveError('intake lodging thing missing a name');
  const areaText = String(areaHint || destinationHint || '').trim();
  const lookupQuery = intakeLodgingLookupQuery(name, areaText);
  const pickOptions = { propertyName: name, areaText, areaCenter: null };
  let search;
  try {
    search = await searchImpl({
      destination: destinationHint,
      areaHint: areaText,
      propertyName: name,
      tripId,
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
  pickOptions.areaCenter = search?.center && hasCoordinates(search.center) ? search.center : null;
  const bravePlaces = (Array.isArray(search?.places) ? search.places : []).filter((place) => hasCoordinates(place));
  const braveLodgingEstablished = braveLodgingCategoryEstablished(bravePlaces);
  const requireTourismLodging = !braveLodgingEstablished;

  const braveRanked = rankIntakeLodgingCandidates(bravePlaces, pickOptions);
  let picked = braveRanked.picked;
  let pickRanking = braveRanked.pickRanking;
  let addressSource = 'brave';
  let coordsSource = 'brave';
  let lat = null;
  let lng = null;
  let address = '';
  let resolved = null;

  if (picked) {
    lat = Number(picked.lat);
    lng = Number(picked.lng);
    address = usableBraveAddress(picked);
    if (hasCoordinates(picked) && !address) {
      const reversed = await nominatimReverseWithEvidence(fetchImpl, lat, lng, search, lookupQuery);
      if (reversed?.address) {
        address = reversed.address;
        addressSource = 'nominatim_reverse';
      }
    }
    if (!hasCoordinates(picked) || !address) {
      const hits = await nominatimForwardWithEvidence(fetchImpl, lookupQuery, search);
      const nomPicked = pickNominatimLodgingCandidate(hits, pickOptions, { requireTourismLodging: false });
      if (!hasCoordinates(picked) && nomPicked && hasCoordinates(nomPicked)) {
        lat = Number(nomPicked.lat);
        lng = Number(nomPicked.lng);
        coordsSource = 'nominatim_search';
        picked = { ...picked, lat, lng, externalId: nomPicked.externalId || picked.externalId };
      }
      if (!address && nomPicked) {
        const nomAddress = String(nomPicked.address || '').trim();
        if (nomAddress) {
          address = nomAddress;
          addressSource = 'nominatim_search';
        }
      }
    }
    if (!hasCoordinates({ lat, lng })) {
      return lodgingLookupMiss({
        name,
        query: lookupQuery,
        reason: 'no_coordinates',
        search,
        coordsSource,
      });
    }
    if (!address) {
      return lodgingLookupMiss({
        name,
        query: lookupQuery,
        reason: 'no_address',
        search,
        addressSource,
        coordsSource,
      });
    }
    resolved = { ...picked, lat, lng, address };
  } else {
    const hits = await nominatimForwardWithEvidence(fetchImpl, lookupQuery, search);
    const nomPicked = pickNominatimLodgingCandidate(hits, pickOptions, { requireTourismLodging });
    if (!nomPicked) {
      const reason = intakeLodgingPickMissReason(bravePlaces, pickOptions)
        || nominatimLodgingPickMissReason(hits, pickOptions, { requireTourismLodging });
      return lodgingLookupMiss({
        name,
        query: lookupQuery,
        reason,
        search,
      });
    }
    address = String(nomPicked.address || '').trim();
    lat = Number(nomPicked.lat);
    lng = Number(nomPicked.lng);
    addressSource = 'nominatim_search';
    coordsSource = 'nominatim_search';
    if (!hasCoordinates(nomPicked) || !address) {
      return lodgingLookupMiss({
        name,
        query: lookupQuery,
        reason: !hasCoordinates(nomPicked) ? 'no_coordinates' : 'no_address',
        search,
        addressSource,
        coordsSource,
      });
    }
    resolved = nomPicked;
  }

  const thing = placeToTripThing({ ...resolved, category: 'hotel' });
  thing.location = {
    ...(thing.location && typeof thing.location === 'object' ? thing.location : {}),
    lat,
    lng,
    address,
  };
  thing.metadata = {
    ...(thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {}),
    addressSource,
    coordsSource,
  };
  const providerAttempts = Array.isArray(search?.providers) ? search.providers : [];
  const lookup = intakeLodgingLookupWithEvidence(intakeLodgingLookupOkDiagnostic({
    propertyName: name,
    query: lookupQuery,
    provider: primaryLodgingLookupProvider(providerAttempts),
    providerAttempts,
    addressSource,
    coordsSource,
    pickRanking,
  }), search);
  return { ok: true, thing, search, lookup };
}

function lodgingTitleAlreadySatisfied(thing = {}) {
  const title = String(thing?.title || thing?.name || '').trim().toLowerCase();
  if (!title) return false;
  const meta = thingMetadata(thing);
  const source = String(meta.source || thing?.source || '').toLowerCase();
  if (source === 'customer_stated') return false;
  if (source === 'prior_db' || source === 'osm' || source === 'brave' || source === 'tavily') return true;
  const loc = thing?.location && typeof thing.location === 'object' ? thing.location : {};
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  const hasAddr = String(loc.address || '').trim();
  return Number.isFinite(lat) && Number.isFinite(lng) && Boolean(hasAddr);
}

function emptyCustomerStatedLodging(thing = {}) {
  const meta = thingMetadata(thing);
  if (String(meta.source || thing?.source || '').toLowerCase() !== 'customer_stated') return false;
  const loc = thing?.location && typeof thing.location === 'object' ? thing.location : {};
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  const hasAddr = String(loc.address || '').trim();
  return !(Number.isFinite(lat) && Number.isFinite(lng) && hasAddr);
}

async function dropCustomerStatedLodging(db, tripId, title = '') {
  const name = String(title || '').trim();
  if (!db || !tripId || !name) return;
  await db`
    delete from trip_things
    where trip_id = ${tripId}
      and lower(title) = lower(${name})
      and coalesce(metadata->>'source', '') = 'customer_stated'
  `;
}

async function persistCustomerStatedLodgingThing(db, tripId, requestId, title = '') {
  const name = String(title || '').trim().slice(0, 240);
  if (!db || !tripId || !name) return null;
  const inserted = await insertTripThing(db, {
    tripId,
    requestId,
    thing: {
      title: name,
      category: 'hotel',
      description: '',
      location: {},
      metadata: {
        source: 'customer_stated',
        intakeSource: 'chat_extraction',
        customerStatedLodging: true,
      },
    },
  });
  return inserted;
}

async function upgradeLodgingThingInPlace(db, tripId, rowId, requestId, thing = {}) {
  const item = tripThingRow(thing);
  if (!item || !rowId) return null;
  await db`
    update trip_things
    set category = ${item.category},
        title = ${item.title},
        description = ${item.description},
        location = ${JSON.stringify(item.location)}::jsonb,
        links = ${JSON.stringify(item.links)}::jsonb,
        ratings = ${JSON.stringify(item.ratings)}::jsonb,
        metadata = ${JSON.stringify(item.metadata)}::jsonb,
        source = ${item.source},
        source_request_id = coalesce(source_request_id, ${requestId}),
        updated_at = now()
    where id = ${rowId}
      and trip_id = ${tripId}
  `;
  return { ...item, id: String(rowId) };
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
  searchImpl = searchIntakeLodgingPlaces,
  existingTitles = [],
  existingThings = [],
} = {}) {
  const have = new Set();
  const prior = Array.isArray(existingThings) && existingThings.length
    ? existingThings
    : (Array.isArray(existingTitles) ? existingTitles.map((title) => ({ title })) : []);
  const priorByTitle = new Map();
  for (const thing of prior) {
    const key = String(thing?.title || thing?.name || '').trim().toLowerCase();
    if (key) priorByTitle.set(key, thing);
    if (lodgingTitleAlreadySatisfied(thing)) have.add(key);
  }
  const saved = [];
  const misses = [];
  const lookups = [];
  const resolvedArea = String(areaHint || destinationHint || '').trim();
  for (const wanted of Array.isArray(lodgingThings) ? lodgingThings : []) {
    const title = String(wanted?.title || wanted?.name || '').trim();
    if (!title) continue;
    const titleKey = title.toLowerCase();
    const priorRow = priorByTitle.get(titleKey);
    const outcome = await resolveIntakeLodgingThing({
      title,
      destinationHint,
      areaHint: resolvedArea,
      tripId,
      env,
      fetchImpl,
      searchImpl,
    });
    if (outcome.lookup) lookups.push(outcome.lookup);
    if (outcome.ok !== true) {
      if (outcome.miss) misses.push(outcome.miss);
      if (resolvedArea) await persistTripStatedLodgingArea(db, tripId, resolvedArea);
      if (!have.has(titleKey)) {
        const stated = await persistCustomerStatedLodgingThing(db, tripId, requestId, title);
        if (stated) {
          have.add(titleKey);
          saved.push(stated);
        }
      }
      continue;
    }
    if (have.has(titleKey)) continue;
    let inserted = null;
    if (priorRow?.id && emptyCustomerStatedLodging(priorRow)) {
      inserted = await upgradeLodgingThingInPlace(db, tripId, priorRow.id, requestId, outcome.thing);
    } else {
      await dropCustomerStatedLodging(db, tripId, title);
      inserted = await insertTripThing(db, { tripId, requestId, thing: outcome.thing });
    }
    if (inserted) {
      if (outcome.lookup && inserted.id) {
        outcome.lookup.thingId = String(inserted.id);
        const idx = lookups.length - 1;
        if (idx >= 0 && lookups[idx] === outcome.lookup) lookups[idx] = { ...outcome.lookup };
      }
      have.add(titleKey);
      saved.push(inserted);
    }
  }
  const lodgingOutcome = buildIntakeLodgingOutcome({ saved, misses, lookups });
  return { saved, misses, lookups, lodgingOutcome };
}

export async function persistIntakeLodgingLookupOnCustomerTurn(db, turnId, lookups = [], lodgingOutcome = null) {
  const id = String(turnId || '').trim();
  const rows = (Array.isArray(lookups) ? lookups : []).filter((row) => row && typeof row === 'object');
  const outcome = lodgingOutcome && typeof lodgingOutcome === 'object' ? lodgingOutcome : null;
  if (!id || (!rows.length && !outcome)) return;
  const existing = await db`
    select payload
    from transcript_turns
    where id = ${id}
    limit 1
  `;
  const payload = existing[0]?.payload && typeof existing[0].payload === 'object' ? { ...existing[0].payload } : {};
  if (rows.length) payload.intakeLodgingLookup = rows;
  if (outcome) payload.lodgingOutcome = outcome;
  const live = payload.liveTranscript && typeof payload.liveTranscript === 'object'
    ? {
      ...payload.liveTranscript,
      ...(rows.length ? { intakeLodgingLookup: rows } : {}),
      ...(outcome ? { lodgingOutcome: outcome } : {}),
    }
    : payload.liveTranscript;
  if (live) payload.liveTranscript = live;
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${id}
  `;
}

export { IntakeLodgingResolveError };
