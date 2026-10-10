import { insertTripThing, tripThingRow } from './trip-things.mjs';
import { assignTripSiteUrlWhenThingsPresent } from './trip-site-url-after-insert.mjs';
import { placeToTripThing, queriesFromWantedThings, searchPlaces } from './place-search.mjs';
import { normalizePlaceSearchCategory } from './place-search-category-keys.mjs';
import { normalizePlaceSearchTargetKind } from './place-search-target-kind.mjs';
import { intakeLodgingLookupQuery } from './intake-lodging-lookup.mjs';
import { samePlace } from './place-search-same-place.mjs';

const GEOCODABLE_KINDS = new Set(['grocery', 'market', 'restaurant', 'store', 'garden', 'activity', 'hotel', 'car']);

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizedTitleKey(title = '') {
  return clean(title, 240).toLowerCase();
}

function locationPoint(location = {}) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function thingHasCoordinates(thing = {}) {
  const loc = thing?.location && typeof thing.location === 'object' ? thing.location : {};
  const { lat, lng } = locationPoint(loc);
  return lat !== null && lng !== null;
}

export function isChatIntakeGeocodableThing({ category = '', kind = '' } = {}) {
  const raw = clean(kind || category, 80).toLowerCase();
  if (!raw || raw === 'flight' || raw === 'decision' || raw === 'note') return false;
  return GEOCODABLE_KINDS.has(raw);
}

export function unresolvedChatIntakePlaceThing({
  title = '',
  category = 'activity',
  description = '',
  metadata = {},
  startsAt = null,
} = {}) {
  const name = clean(title, 240);
  if (!name) return null;
  const cat = clean(category, 80).toLowerCase() || 'activity';
  return {
    category: cat,
    title: name,
    description: clean(description, 4000),
    location: {},
    starts_at: startsAt,
    metadata: {
      ...metadata,
      source: metadata?.source || 'chat_extraction',
      intakeSource: metadata?.intakeSource || 'chat_extraction',
      needsDetails: true,
    },
  };
}

function searchQueryForIntakeThing(title, category, destinationHint, detailText = '') {
  const name = clean(title, 180);
  const destination = clean(destinationHint, 180);
  const detail = clean(detailText, 180);
  const namedQuery = detail
    ? intakeLodgingLookupQuery(`${name} ${detail}`.trim(), destination)
    : intakeLodgingLookupQuery(name, destination);
  const normalizedCategory = normalizePlaceSearchCategory(category) || (category === 'hotel' ? 'hotel' : 'activity');
  return {
    category: normalizedCategory,
    q: namedQuery.slice(0, 240),
    limit: 5,
    place: true,
    target: name,
    targetKind: 'named_place',
  };
}

function pickSearchPlace(search, title) {
  const places = Array.isArray(search?.places) ? search.places : [];
  if (!places.length) return null;
  const target = { title: clean(title, 240), ...locationPoint({}) };
  for (const place of places) {
    const candidate = {
      title: clean(place?.title, 240),
      ...locationPoint(place),
    };
    if (samePlace(target, candidate)) return place;
  }
  return places[0];
}

export async function upgradeTripThingInPlace(db, tripId, rowId, requestId, thing = {}, env = process.env) {
  const item = tripThingRow(thing);
  if (!item || !rowId) return null;
  await db`
    update trip_things
    set category = ${item.category},
        title = ${item.title},
        description = ${item.description},
        starts_at = coalesce(${item.startsAt}, starts_at),
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
  await assignTripSiteUrlWhenThingsPresent(db, tripId, env);
  return { ...item, id: String(rowId) };
}

async function findExistingChatIntakeRow(db, tripId, title) {
  const key = normalizedTitleKey(title);
  if (!db || !tripId || !key) return null;
  const rows = await db`
    select id, title, location, source, metadata, category, description, starts_at
    from trip_things
    where trip_id = ${tripId}::uuid
  `;
  for (const row of rows) {
    if (normalizedTitleKey(row?.title) !== key) continue;
    return row;
  }
  return null;
}

function rowNeedsPlaceSearch(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.needsDetails === true) return true;
  const source = String(row?.source || meta.source || '').trim().toLowerCase();
  if (source === 'customer_stated') return true;
  if (['prior_db', 'osm', 'brave', 'tavily'].includes(source)) return false;
  return !thingHasCoordinates({ location: row?.location });
}

export async function searchChatIntakePlace({
  title = '',
  category = 'activity',
  destinationHint = '',
  detailText = '',
  tripId = '',
  db = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  const name = clean(title, 240);
  const destination = clean(destinationHint, 180);
  if (!name || !destination) return { ok: false, reason: 'missing_title_or_destination', search: null, place: null };
  const query = searchQueryForIntakeThing(name, category, destination, detailText);
  const search = await searchImpl({
    destination,
    tripDestinationLabel: destination,
    tripId,
    db,
    queries: [query],
    relevanceTarget: name,
    relevanceArea: destination,
    env,
    fetchImpl,
  });
  const place = pickSearchPlace(search, name);
  if (!place) return { ok: false, reason: search?.outcomeStatus || 'no_results', search, place: null };
  return { ok: true, search, place };
}

export async function persistChatIntakePlaceThing(db, {
  tripId,
  requestId = null,
  category = 'activity',
  title = '',
  description = '',
  metadata = {},
  startsAt = null,
  destinationHint = '',
  detailText = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  const name = clean(title, 240);
  if (!db || !tripId || !name) return null;
  const existing = await findExistingChatIntakeRow(db, tripId, name);
  const existingMeta = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
  if (existing && !rowNeedsPlaceSearch(existing) && thingHasCoordinates(existing)) {
    return { ...tripThingRow({ ...existing, metadata: existingMeta }), id: String(existing.id), deduped: true };
  }
  const destination = clean(destinationHint, 180);
  let resolved = null;
  if (destination) {
    try {
      const outcome = await searchChatIntakePlace({
        title: name,
        category: category || existing?.category || 'activity',
        destinationHint: destination,
        detailText,
        tripId,
        db,
        env,
        fetchImpl,
        searchImpl,
      });
      if (outcome.ok && outcome.place) resolved = placeToTripThing(outcome.place);
    } catch (error) {
      console.error(`chat intake place search failed for "${name}": ${String(error?.message || error)}`);
    }
  }
  const baseMeta = {
    ...existingMeta,
    ...metadata,
    source: metadata?.source || existingMeta.source || 'chat_extraction',
    intakeSource: metadata?.intakeSource || existingMeta.intakeSource || 'chat_extraction',
  };
  if (resolved) {
    const merged = {
      ...resolved,
      description: clean(description, 4000) || resolved.description || existing?.description || '',
      starts_at: startsAt || existing?.starts_at || null,
      metadata: {
        ...baseMeta,
        ...(resolved.metadata && typeof resolved.metadata === 'object' ? resolved.metadata : {}),
        needsDetails: false,
      },
    };
    if (existing?.id) {
      return upgradeTripThingInPlace(db, tripId, existing.id, requestId, merged, env);
    }
    return insertTripThing(db, { tripId, requestId, thing: merged, env });
  }
  const unresolved = unresolvedChatIntakePlaceThing({
    title: name,
    category: category || existing?.category || 'activity',
    description,
    metadata: baseMeta,
    startsAt: startsAt || existing?.starts_at || null,
  });
  if (existing?.id) {
    return upgradeTripThingInPlace(db, tripId, existing.id, requestId, unresolved, env);
  }
  return insertTripThing(db, { tripId, requestId, thing: unresolved, env });
}

export function unresolvedThingsFromPlaceClassification(classification = {}) {
  const rows = [];
  const seen = new Set();
  const push = (title, category) => {
    const thing = unresolvedChatIntakePlaceThing({ title, category, metadata: { source: 'chat_extraction' } });
    if (!thing) return;
    const key = normalizedTitleKey(thing.title);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(thing);
  };
  const things = classification?.ok === true && Array.isArray(classification.things) ? classification.things : [];
  for (const item of things) {
    const kind = clean(item?.kind || item?.category, 80).toLowerCase();
    if (!isChatIntakeGeocodableThing({ kind })) continue;
    push(item?.name || item?.title, kind);
  }
  const target = clean(classification?.target, 240);
  const targetKind = normalizePlaceSearchTargetKind(classification?.targetKind);
  if (target && targetKind === 'named_place') {
    const category = normalizePlaceSearchCategory(classification?.category) || 'activity';
    push(target, category);
  }
  return rows;
}

export function detailTextFromChatTurn(text = '', thing = {}) {
  const chunks = [
    text,
    thing?.description,
    ...(Array.isArray(thing?.notes) ? thing.notes : []),
    ...(Array.isArray(thing?.collaboratorNotes) ? thing.collaboratorNotes : []),
    thing?.customerWhen,
    thing?.whenLabel,
  ].map((value) => clean(value, 4000)).filter(Boolean);
  return chunks.join(' ').trim();
}

export async function refreshUnresolvedChatIntakePlaces(db, {
  tripId,
  requestId = null,
  text = '',
  things = [],
  destinationHint = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  const saved = [];
  for (const thing of Array.isArray(things) ? things : []) {
    if (!rowNeedsPlaceSearch(thing)) continue;
    const detailText = detailTextFromChatTurn(text, thing);
    const inserted = await persistChatIntakePlaceThing(db, {
      tripId,
      requestId,
      category: thing.category,
      title: thing.title,
      description: thing.description || '',
      metadata: thing.metadata || {},
      startsAt: thing.starts_at || null,
      destinationHint,
      detailText,
      env,
      fetchImpl,
      searchImpl,
    });
    if (inserted) saved.push(inserted);
  }
  return saved;
}

export function intakePlaceBackfillSources(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const metaSource = String(meta.source || '').trim().toLowerCase();
  const intakeSource = String(meta.intakeSource || '').trim().toLowerCase();
  const columnSource = String(row?.source || '').trim().toLowerCase();
  if (columnSource) return columnSource;
  if (metaSource === 'customer_stated') return 'customer_stated';
  if (metaSource === 'chat_extraction' || metaSource === 'customer-turn' || metaSource === 'long-intake') return metaSource;
  if (intakeSource === 'chat_extraction' || intakeSource === 'customer-turn' || intakeSource === 'long-intake') return intakeSource;
  if (metaSource) return metaSource;
  return 'null';
}

export function rowEligibleForChatPlaceBackfill(row = {}) {
  const source = intakePlaceBackfillSources(row);
  if (!['null', 'customer_stated', 'chat_extraction', 'customer-turn', 'long-intake'].includes(source)) return false;
  const category = clean(row?.category, 80).toLowerCase();
  if (!isChatIntakeGeocodableThing({ category })) return false;
  return !thingHasCoordinates(row);
}

export async function persistChatPlaceSearchMisses(db, {
  tripId,
  requestId,
  classification,
  chatSearch = {},
  insertStampedChatPlaceThings,
}) {
  const misses = unresolvedThingsFromPlaceClassification(classification);
  const fromSearch = Array.isArray(chatSearch?.things) ? chatSearch.things : [];
  const things = fromSearch.length ? fromSearch : misses;
  if (!things.length) return { placeResults: [], placeSearchReplyFacts: null };
  return insertStampedChatPlaceThings(db, {
    tripId,
    requestId,
    things,
    classification,
  });
}

export { queriesFromWantedThings, normalizePlaceSearchTargetKind };
