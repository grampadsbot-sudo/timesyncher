import {
  braveAddress,
  braveCategoryName,
  braveEndpoint,
  bravePoint,
  braveProviderCategories,
  braveQueryString,
  braveLocalPlaceResult,
  bravePlaceSearchRows,
  bravePlaceDisplayTitle,
  preferBraveUrlDuplicates,
} from './brave-place-query.mjs';
import { placePersistCategory } from './intake-car-category.mjs';
import { categoryRadiusMeters, firstPassSearchLimit } from './keepsake-list-minimums.mjs';
import { searchTavily } from './poi-search.mjs';
import { attachPlaceRelevance } from './place-search-relevance.mjs';
import { buildProviderEnv, missingSearchKeys } from './provider-env.mjs';
import { writeRatings } from './write-ratings.mjs';
import { mergeLogoMetadata } from './trip-thing-logo-metadata.mjs';
import { runPlaceProviderPass } from './place-search-provider-pass.mjs';
import { PlaceSearchError } from './place-search-error.mjs';
import { isNominatimOpenStreetMapUrl } from './place-search-geocode.mjs';
import { normalizePlaceSearchCategory } from './place-search-category-keys.mjs';
import { normalizePlaceSearchTargetKind } from './place-search-target-kind.mjs';
import { overpassQuery, placesFromOsmPayload } from './place-search-osm.mjs';
import { mergePlaces as mergePlaceRows } from './place-search-merge.mjs';
import { distanceMeters, samePlace } from './place-search-same-place.mjs';
import { ANCHOR_RADIUS_SCOPE_DESTINATION, ANCHOR_RADIUS_SCOPE_LODGING, radiusMetersForAnchorScope } from './place-search-radius-filter.mjs';

export { PlaceSearchError };
const SOURCE_IDS = new Set(['prior_db', 'osm', 'brave']);
const PLACE_KINDS = new Set(['grocery', 'market', 'restaurant', 'store', 'garden', 'activity', 'hotel']);
const PLACE_STOP = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|from|for|with|between|around|starting|leaving|ending|ended|ends|through|until|next|this|morning|afternoon|evening|please|and|or';
const NOT_A_PLACE = /^(?:the|a|an|this|that|our|my|your|new|next|last|current|week|weeks|night|nights|day|days|morning|afternoon|evening|weekend|month|year|time|trip|trips|vacation|vacations|staycation|holiday|bot|staging|one|it|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/i;
const PRIOR_CATEGORIES = new Map([
  ['grocery', 'grocery'],
  ['groceries', 'grocery'],
  ['market', 'market'],
  ['farmers_market', 'market'],
  ['restaurant', 'restaurant'],
  ['food', 'restaurant'],
  ['dining', 'restaurant'],
  ['store', 'store'],
  ['shop', 'store'],
  ['shopping', 'store'],
  ['garden', 'garden'],
  ['gardens', 'garden'],
  ['activity', 'activity'],
  ['attraction', 'activity'],
  ['tourism', 'activity'],
  ['event', 'activity'],
  ['hotel', 'hotel'],
]);

function fail(message, code, providers, relevanceRejections = null, diagnostics = null) {
  console.error(message);
  const error = new PlaceSearchError(message, code, diagnostics && typeof diagnostics === 'object' ? diagnostics : {});
  if (Array.isArray(providers) && providers.length) error.providers = providers;
  if (Array.isArray(relevanceRejections) && relevanceRejections.length) {
    error.relevanceRejections = relevanceRejections.slice(0, 10);
  }
  throw error;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanPlace(value) {
  return String(value || '')
    .replace(/^(?:the|a|an|new|my|our|your)\s+/i, '')
    .replace(/[.;,]+$/g, '')
    .trim();
}

function firstPlace(source, pattern) {
  pattern.lastIndex = 0;
  let match = pattern.exec(source);
  while (match) {
    const place = cleanPlace(match[1]);
    if (place && !NOT_A_PLACE.test(place)) return place;
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    match = pattern.exec(source);
  }
  return '';
}

export function destinationFromChat(requestText) {
  const source = String(requestText || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const stop = `(?=\\s+(?:${PLACE_STOP})\\b|[,.!?]|$)`;
  const place = '([a-z][a-z0-9 .\'’-]{2,60}?)';
  const patterns = [
    new RegExp(`\\b(?:visit(?:ing)?|trip to|headed to|going to|travel(?:ing|ling)? to|fly(?:ing)? to)\\s+(?:the\\s+)?${place}${stop}`, 'ig'),
    new RegExp(`\\bvacation(?:ing)?\\s+(?:in\\s+)?(?:the\\s+)?${place}${stop}`, 'ig'),
    new RegExp(`\\bstaycation\\s+(?:on|in)\\s+(?:the\\s+)?${place}${stop}`, 'ig'),
    new RegExp(`\\b(?:in|to|near|around|on)\\s+(?:the\\s+)?${place}${stop}`, 'ig'),
    /\b(?:a|an|the)\s+([a-z][a-z0-9 .'’-]+?)\s+(?:vacation|trip|staycation|itinerary)\b/ig,
  ];
  for (const pattern of patterns) {
    const found = firstPlace(source, pattern);
    if (found) return found;
  }
  return '';
}

export function lodgingFromChat(requestText, hints = {}) {
  const lat = finite(hints.lat);
  const lng = finite(hints.lng);
  const explicit = [hints.lodging, hints.house]
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
  if (explicit || (lat !== null && lng !== null)) return { text: explicit, lat, lng };
  const source = String(requestText || '').replace(/\s+/g, ' ');
  const match = source.match(/\b(?:staying|stay|stayed|lodging|hotel|airbnb|house|condo|rental)\s+(?:at|in|near|on)\s+([^,.!?]{3,80})/i);
  return { text: match ? cleanPlace(match[1]) : '', lat: null, lng: null };
}

function searchLimit(category) {
  return firstPassSearchLimit(category);
}

export function queriesFromWantedThings(wantedThings = []) {
  const found = [];
  const seen = new Set();
  for (const thing of wantedThings) {
    const name = cleanPlace(thing?.name || thing?.title || '');
    if (!name || name.length < 2 || NOT_A_PLACE.test(name)) continue;
    const kind = String(thing?.kind || thing?.category || '').trim().toLowerCase();
    const place = PLACE_KINDS.has(kind);
    const category = place ? kind : (kind || 'decision');
    const key = `${category}:${normalizeName(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      category,
      q: name,
      limit: place ? searchLimit(category) : 5,
      place,
      ...(place ? { target: name, targetKind: 'named_place' } : {}),
    });
  }
  return found;
}

function isPlaceQuery(item) {
  if (item?.place === false) return false;
  if (item?.place === true) return true;
  return PLACE_KINDS.has(String(item?.category || '').toLowerCase());
}

function metersInsideCategory(center, point, category) {
  const meters = distanceMeters(center, point);
  if (meters === null || meters > categoryRadiusMeters(category)) return null;
  return meters;
}

export { distanceMeters, samePlace } from './place-search-same-place.mjs';

export function mergePlaces(groups = [], options = {}) {
  return mergePlaceRows(groups, options, samePlace);
}

export { missingSearchKeys } from './provider-env.mjs';

function countSources(places) {
  const counts = { prior_db: 0, osm: 0, brave: 0 };
  for (const place of places) counts[place.source] += 1;
  return counts;
}

export async function placeSearchReadJson(fetchImpl, url, { headers, method, body, label }) {
  if (isNominatimOpenStreetMapUrl(url)) {
    throw new PlaceSearchError(
      'Nominatim HTTP must use the nominatim gateway (throttle + cache)',
      'nominatim_bypass',
    );
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: method || 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'TimeSyncherVacation/1.0',
        ...(headers || {}),
      },
      body,
    });
  } catch (error) {
    fail(`${label} request failed: ${error.message || error}`, 'source_failed');
  }
  if (!response?.ok) {
    let detail = '';
    try {
      detail = typeof response.text === 'function' ? await response.text() : '';
    } catch {
      detail = '';
    }
    const httpStatus = Number(response?.status);
    const message = `${label} failed: HTTP ${response?.status || 'no status'} ${String(detail).slice(0, 300)}`.trim();
    const error = new PlaceSearchError(message, 'source_failed');
    if (Number.isFinite(httpStatus)) error.httpStatus = httpStatus;
    console.error(message);
    throw error;
  }
  try {
    return await response.json();
  } catch (error) {
    fail(`${label} returned invalid JSON: ${error.message || error}`, 'source_failed');
  }
}

function presentNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value.trim()))) return Number(value.trim());
  return null;
}

function ratingFromRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  const nested = record.rating && typeof record.rating === 'object' ? record.rating : null;
  const rating = presentNumber(nested ? (nested.ratingValue ?? nested.value) : record.rating);
  const count = presentNumber(nested?.ratingCount ?? nested?.count ?? record.stats?.total_ratings ?? record.total_ratings ?? record.ratingCount);
  const fields = {};
  if (rating != null) fields.rating = rating;
  if (count != null) fields.ratingCount = count;
  return fields;
}

function sourceRefFor(place) {
  const source = String(place?.source || '').trim();
  const id = String(place?.externalId || place?.url || '').trim();
  if (!source || !id) return null;
  return { source, id };
}

function sourceRecordFor(place) {
  const embedded = place?.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  if (embedded && (embedded.id || embedded.icon_category || embedded.categories || embedded.class || embedded.type || embedded.osm_tags)) {
    return {
      ...embedded,
      source: String(place.source || embedded.source || '').trim(),
      url: String(place.url || embedded.url || '').trim(),
    };
  }
  return {
    source: place.source,
    url: place.url || '',
    ...(place.rating != null ? { rating: place.rating } : {}),
    ...(place.ratingCount != null ? { count: place.ratingCount } : {}),
    ...(place.categoryName ? { categoryName: String(place.categoryName).trim() } : {}),
    ...(Array.isArray(place.providerCategories) && place.providerCategories.length
      ? { providerCategories: place.providerCategories }
      : {}),
    ...(place.nominatimClass ? { class: place.nominatimClass } : {}),
    ...(place.nominatimType ? { type: place.nominatimType } : {}),
    ...(place.nominatimTourism ? { tourism: place.nominatimTourism } : {}),
  };
}

function openRouterKey(env) {
  return String(env?.OPENROUTER_API_KEY || env?.JEV_API_KEY || '').trim();
}

function requireOpenRouterKey(env) {
  const apiKey = openRouterKey(env);
  if (!apiKey) fail('Place search refused to run. Missing OPENROUTER_API_KEY.', 'missing_key');
  return apiKey;
}

async function attachRelevance(rows, fetchImpl, env, relevanceContext = {}) {
  return attachPlaceRelevance(rows, fetchImpl, env, relevanceContext, { requireOpenRouterKey });
}

function categoryNameField(name) {
  const categoryName = String(name || '').trim();
  return categoryName ? { categoryName } : {};
}

async function queryOsm(fetchImpl, center, categoryFilter = null) {
  const body = `data=${encodeURIComponent(overpassQuery(center, categoryFilter))}`;
  const payload = await placeSearchReadJson(fetchImpl, 'https://overpass-api.de/api/interpreter', {
    label: 'OpenStreetMap Overpass',
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  return placesFromOsmPayload(payload, center, { finite, metersInsideCategory, ratingFromRecord });
}

function braveCallSummary(calls) {
  const query = calls.map((row) => row.query).filter(Boolean).join(' | ');
  const endpoint = [...new Set(calls.map((row) => row.endpoint).filter(Boolean))].join(' | ');
  return { query, endpoint };
}

export async function queryBravePlaceSearch(fetchImpl, env, {
  center,
  locationText,
  compactLocality = '',
  namedPlaceLookup = false,
}, queries) {
  if (braveEndpoint(center) !== 'local') {
    const error = new Error('Brave place search requires coordinates');
    error.code = 'no_coordinates';
    throw error;
  }
  const places = [];
  const calls = [];
  let anchorRadiusRejected = 0;
  const anchorRadiusRejections = [];
  const braveRadiusScope = namedPlaceLookup
    ? ANCHOR_RADIUS_SCOPE_DESTINATION
    : ANCHOR_RADIUS_SCOPE_LODGING;
  const area = String(locationText || center?.label || '').trim();
  const locality = String(compactLocality || center?.compactLocality || '').trim();
  try {
    for (const item of queries) {
      const query = braveQueryString(item, area, center, locality);
      const endpoint = 'local';
      calls.push({ query, endpoint });
      const params = new URLSearchParams({
        q: query,
        count: String(item.limit || searchLimit(item.category)),
        latitude: String(center.lat),
        longitude: String(center.lng),
        radius: String(categoryRadiusMeters(item.category)),
      });
      const payload = await placeSearchReadJson(
        fetchImpl,
        `https://api.search.brave.com/res/v1/local/place_search?${params}`,
        {
          label: 'Brave Place Search',
          headers: { 'X-Subscription-Token': String(env.brave).trim() },
        },
      );
      const braveRows = bravePlaceSearchRows(payload, endpoint);
      const rawBraveResults = braveRows.slice(0, 5);
      for (let providerRank = 0; providerRank < braveRows.length; providerRank += 1) {
        const result = braveRows[providerRank];
        if (!braveLocalPlaceResult(result)) continue;
        const point = bravePoint(result);
        const title = bravePlaceDisplayTitle(result);
        const address = braveAddress(result);
        const description = String(result?.description || '').replace(/\s+/g, ' ').trim();
        if (!title) continue;
        const limitMeters = radiusMetersForAnchorScope(item.category, braveRadiusScope);
        const meters = center ? distanceMeters(center, point) : null;
        if (center && (meters === null || meters > limitMeters)) {
          anchorRadiusRejected += 1;
          anchorRadiusRejections.push({
            title,
            source: 'brave',
            lat: point.lat,
            lng: point.lng,
            meters,
            limitMeters,
            scope: braveRadiusScope,
            reason: 'outside_radius',
          });
          continue;
        }
        const providerCategories = braveProviderCategories(result);
        places.push({
          source: 'brave',
          title,
          category: placePersistCategory({ source: 'brave', category: item.category, sourceRecord: result, providerCategories }),
          lat: point.lat,
          lng: point.lng,
          address,
          url: String(result?.url || ''),
          externalId: String(result?.id || result?.url || ''),
          providerRank,
          sourceRecord: result,
          ...(description ? { description } : {}),
          ...ratingFromRecord(result),
          ...categoryNameField(braveCategoryName(result)),
          ...(providerCategories.length ? { providerCategories } : {}),
        });
      }
      calls[calls.length - 1].rawResults = rawBraveResults;
    }
  } catch (error) {
    const summary = braveCallSummary(calls);
    error.braveQuery = summary.query;
    error.braveEndpoint = summary.endpoint;
    throw error;
  }
  const rawResults = calls.flatMap((row) => (Array.isArray(row.rawResults) ? row.rawResults : [])).slice(0, 5);
  const braveLookups = calls.map((row) => ({
    query: String(row.query || '').trim(),
    endpoint: String(row.endpoint || '').trim(),
  })).filter((row) => row.query && row.endpoint);
  const dedupedPlaces = preferBraveUrlDuplicates(places);
  return {
    places: dedupedPlaces,
    rawResults,
    ...(braveLookups.length ? { braveLookups } : {}),
    ...(anchorRadiusRejected > 0 ? { anchorRadiusRejected } : {}),
    ...(anchorRadiusRejections.length ? { anchorRadiusRejections } : {}),
    ...braveCallSummary(calls),
  };
}

export function selectPriorPlaces(rows = [], center) {
  const places = [];
  for (const row of rows) {
    const location = row?.location && typeof row.location === 'object' ? row.location : {};
    const lat = finite(location.lat ?? location.latitude ?? row?.lat);
    const lng = finite(location.lng ?? location.longitude ?? row?.lng);
    const category = PRIOR_CATEGORIES.get(String(row?.category || '').toLowerCase()) || '';
    const title = String(row?.title || '').trim();
    if (category === 'hotel') continue;
    if (!title || !category || lat === null || lng === null) continue;
    const meters = metersInsideCategory(center, { lat, lng }, category);
    if (meters === null) continue;
    places.push({
      source: 'prior_db',
      title,
      category,
      lat,
      lng,
      address: String(location.address || row?.address || ''),
      url: '',
      externalId: String(row?.id || ''),
      ...ratingFromRecord(row?.ratings || row),
      meters,
    });
  }
  places.sort((a, b) => a.meters - b.meters || a.title.localeCompare(b.title));
  return places.slice(0, 40).map(({ meters, ...place }) => place);
}

async function queryPriorRows(env, tripId) {
  const databaseUrl = env.DATABASE_URL || env.NEON_DATABASE_URL || '';
  if (!databaseUrl) return [];
  const id = String(tripId || '').trim();
  if (!id) fail('Place search prior_db refused: trip id is required.', 'missing_trip_id');
  const { sql } = await import('./db.mjs');
  const db = sql(env);
  return db`
    select id, title, category, location, source
    from trip_things
    where trip_id = ${id}::uuid
      and source in ('prior_db', 'osm', 'brave')
    order by updated_at desc
    limit 400
  `;
}

export async function readPriorPlaces(center, { env = process.env, tripId, query } = {}) {
  if (finite(center?.lat) === null || finite(center?.lng) === null) return [];
  const rows = query ? await query(center) : await queryPriorRows(env, tripId);
  return selectPriorPlaces(Array.isArray(rows) ? rows : [], center);
}

function priorRowsFromInput(priorPlaces) {
  return priorPlaces.map((place) => {
    if (place?.location && typeof place.location === 'object') return place;
    return {
      id: place?.externalId || place?.id,
      title: place?.title,
      category: place?.category,
      address: place?.address,
      location: {
        lat: place?.lat,
        lng: place?.lng,
        address: place?.address || '',
      },
    };
  });
}

async function queryTavily(fetchImpl, env, queries) {
  const notes = [];
  const key = String(env.tavily || '').trim();
  for (const item of queries) {
    const found = await searchTavily(item.q, { apiKey: key, env, fetchImpl });
    for (const result of found.results) {
      const title = String(result.title || '').trim();
      if (!title) continue;
      notes.push({
        source: 'tavily',
        title,
        category: item.category,
        url: result.url,
        description: result.content || '',
        externalId: result.url,
        ...ratingFromRecord(result),
      });
    }
  }
  return notes;
}

export async function searchPlaces({
  destination,
  lodging = '',
  lodgingPoint,
  wantedThings = [],
  queries,
  relevanceTarget = '',
  relevanceArea = '',
  searchAnchor = null,
  keepAreaText = false,
  tripDestinationCenter = null,
  tripDestinationLabel = '',
  tripId = '',
  db = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  priorPlaces,
  loadPriorPlaces,
} = {}) {
  env = buildProviderEnv(env);
  const started = Date.now();
  const dest = String(destination || '').trim();
  const searchQueries = Array.isArray(queries) && queries.length ? queries : queriesFromWantedThings(wantedThings);
  const placeQueries = searchQueries.filter(isPlaceQuery);
  const infoQueries = searchQueries.filter((item) => !isPlaceQuery(item));
  if (!searchQueries.length) {
    return {
      destination: dest,
      center: null,
      places: [],
      notes: [],
      queries: [],
      queried: [],
      providers: [],
      elapsedMs: Date.now() - started,
      sourceCounts: countSources([]),
    };
  }
  requireOpenRouterKey(env);
  if (placeQueries.length) {
    const missing = missingSearchKeys(env);
    if (missing.length) fail(`Place search refused to run. Missing ${missing.join(', ')}.`, 'missing_key');
  }
  if (infoQueries.length && !String(env.tavily || '').trim()) {
    fail(`Search refused to run. Missing ${String(env.tavilyName || 'TAVILI_API_KEY')}.`, 'missing_key');
  }
  let center = null;
  let places = [];
  let providerLog = [];
  let relevanceRejections = [];
  let placeSearchDiagnostics = {};
  let locationText = dest;
  const placeTarget = String(relevanceTarget || '').trim() || String(placeQueries[0]?.target || '').trim();
  const placeArea = String(relevanceArea || '').trim() || dest;
  for (const item of placeQueries) {
    const raw = String(item?.category || '').trim().toLowerCase();
    if (!raw) fail('Place search refused: classifier place category missing.', 'missing_place_category');
    if (raw !== 'hotel' && !normalizePlaceSearchCategory(raw)) {
      fail(`Place search refused: unknown place category ${raw}.`, 'unknown_place_category');
    }
    const targetKind = normalizePlaceSearchTargetKind(item?.targetKind);
    if (!targetKind) fail('Place search refused: classifier place targetKind missing.', 'missing_place_target_kind');
  }
  const osmCategoryFilter = [...new Set(placeQueries.map((item) => normalizePlaceSearchCategory(item?.category)).filter(Boolean))];
  if (placeQueries.length) {
    const pass = await runPlaceProviderPass({
      fetchImpl,
      env,
      dest,
      lodging,
      lodgingPoint,
      keepAreaText,
      tripDestinationCenter,
      tripDestinationLabel: String(tripDestinationLabel || dest).trim(),
      placeQueries,
      osmCategoryFilter,
      searchAnchor,
      relevanceContext: { target: placeTarget, area: placeArea, category: osmCategoryFilter[0] || placeQueries[0]?.category || '' },
      tripId,
      db,
      priorPlaces,
      loadPriorPlaces,
      readPriorPlaces,
      selectPriorPlaces,
      priorRowsFromInput,
      queryOsm,
      queryBrave: queryBravePlaceSearch,
      mergePlaces,
      attachRelevance,
      readJson: placeSearchReadJson,
      fail,
    });
    center = pass.center;
    locationText = pass.locationText || dest;
    places = pass.places;
    providerLog = pass.providerLog;
    relevanceRejections = pass.relevanceRejections || [];
    placeSearchDiagnostics = {
      judgeInput: pass.judgeInput,
      searchCenter: pass.searchCenter,
      anchor: pass.anchor,
      ...(Number(pass.anchorRadiusRejected) > 0 ? { anchorRadiusRejected: pass.anchorRadiusRejected } : {}),
      ...(Array.isArray(pass.dedupeMerges) && pass.dedupeMerges.length ? { dedupeMerges: pass.dedupeMerges } : {}),
      ...(Array.isArray(pass.providerErrors) && pass.providerErrors.length ? { providerErrors: pass.providerErrors } : {}),
      ...(Array.isArray(pass.braveLookups) && pass.braveLookups.length ? { braveLookups: pass.braveLookups } : {}),
      ...(pass.anchorRadiusPolicy ? { anchorRadiusPolicy: pass.anchorRadiusPolicy } : {}),
      ...(Array.isArray(pass.anchorRadiusRejections) && pass.anchorRadiusRejections.length
        ? { anchorRadiusRejections: pass.anchorRadiusRejections }
        : {}),
      ...(pass.providerTimings ? { providerTimings: pass.providerTimings } : {}),
    };
    if (pass.status === 'no_results') {
      return {
        destination: dest || center?.label || locationText || '',
        center: pass.queryCenter || center,
        places: [],
        notes: [],
        queries: searchQueries,
        queried: [...SOURCE_IDS],
        providers: providerLog,
        relevanceRejections: pass.relevanceRejections || [],
        outcomeStatus: 'no_results',
        outcomeReason: pass.reason || null,
        ...placeSearchDiagnostics,
        elapsedMs: Date.now() - started,
        sourceCounts: countSources([]),
      };
    }
  }
  const noteRelevance = infoQueries.length
    ? await attachRelevance(await queryTavily(fetchImpl, env, infoQueries), fetchImpl, env, { target: placeTarget, area: placeArea })
    : { places: [], rejections: [] };
  const notes = noteRelevance.places;
  return {
    destination: dest || center?.label || locationText || '',
    center,
    places,
    notes,
    queries: searchQueries,
    queried: infoQueries.length ? [...SOURCE_IDS, 'tavily'] : [...SOURCE_IDS],
    providers: providerLog,
    relevanceRejections,
    ...placeSearchDiagnostics,
    elapsedMs: Date.now() - started,
    sourceCounts: countSources(places),
  };
}

export function placeToTripThing(place) {
  const sourceRecord = sourceRecordFor(place);
  const sourceRef = sourceRefFor(place);
  const baseMetadata = {
    source: place.source,
    externalId: place.externalId || '',
    sourceRef,
    sourceRecord,
    jevScore: place.jevScore ?? 0,
    ...(place.categoryName ? { categoryName: String(place.categoryName).trim() } : {}),
    ...(Array.isArray(place.providerCategories) && place.providerCategories.length
      ? { providerCategories: place.providerCategories }
      : {}),
  };
  return {
    category: placePersistCategory(place),
    subtype: place.source,
    title: place.title,
    description: place.address || '',
    source: place.source,
    location: {
      lat: place.lat,
      lng: place.lng,
      address: place.address || '',
    },
    links: place.url ? [{ label: place.source, url: place.url }] : [],
    ratings: writeRatings({ sourceRecord }),
    metadata: mergeLogoMetadata(baseMetadata, { ...place, sourceRecord }),
  };
}

export function placeToResearchCandidate(place, destination = '') {
  return {
    category: place.category,
    source: place.source,
    title: place.title,
    summary: place.address ? `${place.title}, ${place.address}` : place.title,
    details: place.address || '',
    website: place.url || '',
    address: place.address || '',
    lat: place.lat,
    lng: place.lng,
    area: destination,
    sourceBacked: true,
    sources: place.url ? [{ label: place.source, url: place.url }] : [],
    metadata: {
      source: place.source,
      externalId: place.externalId || '',
      sourceRef: sourceRefFor(place),
      jevScore: place.jevScore ?? 0,
    },
  };
}

export function noteToTripThing(note) {
  const sourceRecord = sourceRecordFor({ ...note, source: 'tavily' });
  const sourceRef = sourceRefFor({ ...note, source: 'tavily' });
  return {
    category: note.category,
    subtype: 'tavily',
    title: note.title,
    description: note.description || '',
    source: 'tavily',
    location: {},
    links: note.url ? [{ label: 'tavily', url: note.url }] : [],
    ratings: writeRatings({ sourceRecord }),
    metadata: {
      source: 'tavily',
      externalId: note.externalId || note.url || '',
      sourceRef,
      sourceRecord,
      jevScore: note.jevScore ?? 0,
    },
  };
}

export function noteToResearchCandidate(note, destination = '') {
  return {
    category: note.category,
    source: 'tavily',
    title: note.title,
    summary: note.description || note.title,
    details: note.description || '',
    website: note.url || '',
    address: '',
    area: destination,
    sourceBacked: Boolean(note.url),
    sources: note.url ? [{ label: 'tavily', url: note.url }] : [],
    metadata: {
      source: 'tavily',
    },
  };
}
export async function fillTripIntake(options) {
  const search = await searchPlaces(options);
  const notes = Array.isArray(search.notes) ? search.notes : [];
  return {
    search,
    things: [...search.places.map(placeToTripThing), ...notes.map(noteToTripThing)],
    researchedThings: [
      ...search.places.map((place) => placeToResearchCandidate(place, search.destination)),
      ...notes.map((note) => noteToResearchCandidate(note, search.destination)),
    ],
  };
}

