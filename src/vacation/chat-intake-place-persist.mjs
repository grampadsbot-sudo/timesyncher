import { insertTripThing, tripThingRow } from './trip-things.mjs';
import { assignTripSiteUrlWhenThingsPresent } from './trip-site-url-after-insert.mjs';
import { placeToTripThing, queriesFromWantedThings, searchPlaces } from './place-search.mjs';
import { rowNeedsProductEnrichment } from './trip-thing-enrich-row.mjs';
import { searchPlaceNeedsWebDetailEnrichment } from './search-place-detail-enrichment.mjs';
import { normalizePlaceSearchCategory } from './place-search-category-keys.mjs';
import { normalizePlaceSearchTargetKind } from './place-search-target-kind.mjs';
import { intakeLodgingLookupQuery } from './intake-lodging-lookup.mjs';
import { samePlace } from './place-search-same-place.mjs';
import { applyEnrichedDetailToTripThing, enrichPlaceDetail } from './place-detail-enrichment.mjs';
import {
  evaluateIntakeAdmission,
  evaluateIntakePreSearch,
  findStructuralDuplicate,
  intakeProvenanceOrigin,
  intakeWriteRejected,
  isCustomerIntakeProvenance,
  recordChatIntakeSearchMiss,
} from './intake-thing-admission.mjs';

const GEOCODABLE_KINDS = new Set(['grocery', 'market', 'restaurant', 'store', 'garden', 'activity', 'hotel', 'car']);

function clean(value, max = 240) {
  return Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
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

async function loadChatIntakeRows(db, tripId) {
  if (!db || !tripId) return [];
  return db`
    select id, title, location, source, metadata, category, description, starts_at
    from trip_things
    where trip_id = ${tripId}::uuid
  `;
}

async function findExistingChatIntakeRow(db, tripId, title, metadata = {}) {
  const key = normalizedTitleKey(title);
  if (!db || !tripId || !key) return null;
  const rows = await loadChatIntakeRows(db, tripId);
  const dup = findStructuralDuplicate(rows, { metadata, title });
  if (dup) return dup;
  for (const row of rows) {
    if (normalizedTitleKey(row?.title) === key) return row;
  }
  return null;
}

export function rowNeedsPlaceSearch(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.needsDetails === true) return true;
  const source = String(row?.source || meta.source || '').trim().toLowerCase();
  if (source === 'customer_stated') return true;
  if (['prior_db', 'osm', 'vk-search', 'tavily'].includes(source)) return false;
  const intakeSource = String(meta.intakeSource || '').trim().toLowerCase();
  const metaSource = String(meta.source || '').trim().toLowerCase();
  const fromChatIntake = metaSource === 'chat_extraction'
    || intakeSource === 'chat_extraction'
    || metaSource === 'long-intake'
    || metaSource === 'customer-turn'
    || intakeSource === 'customer-turn';
  if (!fromChatIntake) return false;
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
  provenanceContext = {},
} = {}) {
  const name = clean(title, 240);
  if (!db || !tripId || !name) return null;
  const existingRows = await loadChatIntakeRows(db, tripId);
  let existing = await findExistingChatIntakeRow(db, tripId, name, metadata);
  const preRows = existing
    ? existingRows.filter((row) => String(row.id) !== String(existing.id))
    : existingRows;
  const pre = evaluateIntakePreSearch({
    title: name,
    category,
    description,
    metadata,
    existingRows: preRows,
    provenanceContext,
  });
  if (!pre.admit) {
    if (pre.reason === 'merge_duplicate' && pre.mergeIntoId) {
      const mergeRow = existingRows.find((row) => String(row.id) === pre.mergeIntoId);
      if (mergeRow) return { ...tripThingRow({ ...mergeRow }), id: String(mergeRow.id), deduped: true };
    }
    return null;
  }
  const adjustedCategory = pre.adjustedCategory || category;
  if (!existing) existing = await findExistingChatIntakeRow(db, tripId, name, metadata);
  const existingMeta = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
  if (existing && !rowNeedsPlaceSearch(existing) && thingHasCoordinates(existing)) {
    return { ...tripThingRow({ ...existing, metadata: existingMeta }), id: String(existing.id), deduped: true };
  }
  const baseMeta = {
    ...existingMeta,
    ...metadata,
    source: metadata?.source || existingMeta.source || 'chat_extraction',
    intakeSource: metadata?.intakeSource || existingMeta.intakeSource || 'chat_extraction',
  };
  const destination = clean(destinationHint, 180);
  let resolved = null;
  if (destination) {
    try {
      const outcome = await searchChatIntakePlace({
        title: name,
        category: adjustedCategory || category || existing?.category || 'activity',
        destinationHint: destination,
        detailText,
        tripId,
        db,
        env,
        fetchImpl,
        searchImpl,
      });
      if (outcome.ok && outcome.place) {
        const post = evaluateIntakeAdmission({
          title: name,
          category: adjustedCategory || category,
          description,
          metadata: {
            ...baseMeta,
            origin: intakeProvenanceOrigin(baseMeta) || 'provider_search',
            providerResultId: outcome.place?.id || outcome.place?.providerResultId || baseMeta.providerResultId,
          },
          resolvedPlace: outcome.place,
          existingRows,
          provenanceContext,
        });
        const mergeId = post.reason === 'merge_duplicate' ? String(post.mergeIntoId || '') : '';
        const upgradingSameRow = mergeId && mergeId === String(existing?.id || '');
        if (!post.admit && !upgradingSameRow) {
          if (mergeId) {
            const mergeRow = post.mergeRow || existingRows.find((row) => String(row.id) === mergeId);
            if (mergeRow) return { ...tripThingRow({ ...mergeRow }), id: String(mergeRow.id), deduped: true };
          }
          await recordChatIntakeSearchMiss(db, tripId, { title: name, category: adjustedCategory || category, reason: post.reason });
          return null;
        }
        const baseThing = placeToTripThing(outcome.place);
        try {
          const enrichment = await enrichPlaceDetail({
            place: outcome.place,
            destination,
            category: adjustedCategory || category || existing?.category || 'activity',
            env,
            fetchImpl,
          });
          resolved = applyEnrichedDetailToTripThing(baseThing, enrichment);
        } catch (error) {
          console.error(`chat intake detail enrichment failed for "${name}": ${String(error?.message || error)}`);
          resolved = baseThing;
        }
      }
    } catch (error) {
      console.error(`chat intake place search failed for "${name}": ${String(error?.message || error)}`);
    }
  }
  if (resolved) {
    const merged = {
      ...resolved,
      description: resolved.description || clean(description, 4000) || existing?.description || '',
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
  const missReason = destination ? 'search_miss' : 'missing_destination';
  if (isCustomerIntakeProvenance(baseMeta) && !intakeWriteRejected(name, baseMeta, provenanceContext)) {
    const origin = intakeProvenanceOrigin(baseMeta) || 'customer_turn';
    const provenanceSrc = clean(baseMeta.source || baseMeta.intakeSource, 80).toLowerCase();
    const fromChatExtraction = provenanceSrc === 'chat_extraction';
    const placeholder = unresolvedChatIntakePlaceThing({
      title: name,
      category: adjustedCategory || category || existing?.category || 'activity',
      description,
      metadata: {
        ...baseMeta,
        origin,
        source: fromChatExtraction ? 'chat_extraction' : 'customer_stated',
        intakeSource: fromChatExtraction
          ? (baseMeta.intakeSource || 'chat_extraction')
          : (baseMeta.intakeSource || 'customer-turn'),
      },
      startsAt,
    });
    if (!placeholder) return null;
    if (existing?.id) {
      return upgradeTripThingInPlace(db, tripId, existing.id, requestId, placeholder, env);
    }
    return insertTripThing(db, { tripId, requestId, thing: placeholder, env });
  }
  await recordChatIntakeSearchMiss(db, tripId, {
    title: name,
    category: adjustedCategory || category || existing?.category || 'activity',
    reason: missReason,
  });
  return null;
}

export function unresolvedThingsFromPlaceClassification(classification = {}) {
  const rows = [];
  const seen = new Set();
  const push = (title, category, meta = {}) => {
    if (intakeWriteRejected(title, meta)) return;
    const thing = unresolvedChatIntakePlaceThing({ title, category, metadata: meta });
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
    const meta = {
      source: item?.source || 'chat_extraction',
      origin: item?.origin || '',
      customerTurnId: item?.customerTurnId || '',
      customerSpan: item?.customerSpan || item?.name || '',
    };
    push(item?.name || item?.title, kind, meta);
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
  if (!thingHasCoordinates(row)) return true;
  return rowNeedsProductEnrichment(row);
}

function rowNeedsVkTransportDetailFill(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const loc = row?.location && typeof row.location === 'object' ? row.location : {};
  const record = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  const category = clean(row?.category, 80).toLowerCase();
  const place = {
    title: row.title,
    category: row.category,
    description: row.description,
    sourceRecord: record,
    address: loc.address || '',
    lat: loc.lat,
    lng: loc.lng,
    price: row.price ?? meta.price,
  };
  if (searchPlaceNeedsWebDetailEnrichment(place)) return true;
  if (!['flight', 'hotel', 'car'].includes(category)) return false;
  const price = row.price ?? meta.price ?? record.price;
  return price == null && row.price !== 0;
}

export function rowNeedsDetailBackfill(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.detailEnriched === true && !rowNeedsVkTransportDetailFill(row)) return false;
  const category = clean(row?.category, 80).toLowerCase();
  const detailCategories = new Set(['flight', 'hotel', 'car', 'bar', 'restaurant', 'tour', 'attraction']);
  if (!isChatIntakeGeocodableThing({ category }) && !detailCategories.has(category)) return false;
  const loc = row?.location && typeof row.location === 'object' ? row.location : {};
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export { persistChatPlaceSearchMisses } from './chat-place-search-when.mjs';

export { queriesFromWantedThings, normalizePlaceSearchTargetKind };
