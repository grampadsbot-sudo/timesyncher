import { categoryRadiusMeters, firstPassSearchLimit } from './keepsake-list-minimums.mjs';
import { intakeThingHasProperName } from './intake-thing-name.mjs';
import { searchTavily } from './poi-search.mjs';
import { attachPlaceRelevance } from './place-search-relevance.mjs';
import { buildProviderEnv, missingSearchKeys } from './provider-env.mjs';
import { writeRatings } from './write-ratings.mjs';
import { runPlaceProviderPass } from './place-search-provider-pass.mjs';
import { PlaceSearchError } from './place-search-error.mjs';

export { PlaceSearchError };
const DEDUPE_METERS = 250;
const SOURCE_IDS = new Set(['prior_db', 'osm', 'brave']);
const PLACE_KINDS = new Set(['grocery', 'restaurant', 'store', 'garden', 'activity', 'hotel']);
const PLACE_STOP = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|from|for|with|between|around|starting|leaving|ending|ended|ends|through|until|next|this|morning|afternoon|evening|please|and|or';
const NOT_A_PLACE = /^(?:the|a|an|this|that|our|my|your|new|next|last|current|week|weeks|night|nights|day|days|morning|afternoon|evening|weekend|month|year|time|trip|trips|vacation|vacations|staycation|holiday|bot|staging|one|it|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/i;
const PRIOR_CATEGORIES = new Map([
  ['grocery', 'grocery'],
  ['groceries', 'grocery'],
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

function fail(message, code, providers, relevanceRejections = null) {
  console.error(message);
  const error = new PlaceSearchError(message, code);
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
    if (place && !intakeThingHasProperName(name)) continue;
    const category = place ? kind : (kind || 'decision');
    const key = `${category}:${normalizeName(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      category,
      q: name,
      limit: place ? searchLimit(category) : 5,
      place,
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

export function distanceMeters(origin, point) {
  const lat1 = finite(origin?.lat);
  const lng1 = finite(origin?.lng);
  const lat2 = finite(point?.lat);
  const lng2 = finite(point?.lng);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function samePlace(left, right) {
  const leftName = normalizeName(left?.title);
  const rightName = normalizeName(right?.title);
  if (!leftName || leftName !== rightName) return false;
  const meters = distanceMeters(left, right);
  if (meters === null) return true;
  return meters <= DEDUPE_METERS;
}

export function mergePlaces(groups = []) {
  const kept = [];
  for (const group of groups) {
    for (const place of group || []) {
      const lat = finite(place?.lat);
      const lng = finite(place?.lng);
      const title = String(place?.title || '').trim();
      const category = PRIOR_CATEGORIES.get(String(place?.category || '').toLowerCase()) || '';
      if (!title || !category || !SOURCE_IDS.has(place?.source) || lat === null || lng === null) continue;
      const next = {
        source: place.source,
        title,
        category,
        lat,
        lng,
        address: String(place.address || ''),
        url: String(place.url || ''),
        externalId: String(place.externalId || ''),
        ...(place.categoryName ? { categoryName: String(place.categoryName).trim() } : {}),
      };
      if (kept.some((item) => samePlace(item, next))) continue;
      kept.push(next);
    }
  }
  return kept;
}

export { missingSearchKeys } from './provider-env.mjs';

function countSources(places) {
  const counts = { prior_db: 0, osm: 0, brave: 0 };
  for (const place of places) counts[place.source] += 1;
  return counts;
}

async function readJson(fetchImpl, url, { headers, method, body, label }) {
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
    fail(`${label} failed: HTTP ${response?.status || 'no status'} ${String(detail).slice(0, 300)}`.trim(), 'source_failed');
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
  return {
    source: place.source,
    url: place.url || '',
    ...(place.rating != null ? { rating: place.rating } : {}),
    ...(place.ratingCount != null ? { count: place.ratingCount } : {}),
    ...(place.categoryName ? { categoryName: String(place.categoryName).trim() } : {}),
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

const OSM_CATEGORIES = [
  {
    category: 'grocery',
    filter: '["shop"~"supermarket|grocery|convenience|greengrocer"]',
    match: (tags) => /^(?:supermarket|grocery|convenience|greengrocer)$/.test(String(tags.shop || '')),
    name: (tags) => String(tags.shop || '').trim(),
  },
  {
    category: 'restaurant',
    filter: '["amenity"~"restaurant|cafe|fast_food"]',
    match: (tags) => /restaurant|cafe|fast_food/.test(String(tags.amenity || '')),
    name: (tags) => String(tags.amenity || '').trim(),
  },
  {
    category: 'store',
    filter: '["shop"]',
    match: (tags) => Boolean(tags.shop),
    name: (tags) => String(tags.shop || '').trim(),
  },
  {
    category: 'garden',
    filter: '["leisure"="garden"]',
    match: (tags) => String(tags.leisure || '') === 'garden' || String(tags.tourism || '') === 'garden',
    name: () => 'garden',
  },
  {
    category: 'activity',
    filter: '["tourism"~"attraction|museum|gallery|viewpoint"]',
    match: (tags) => Boolean(tags.tourism),
    name: (tags) => String(tags.tourism || '').trim(),
  },
];

function overpassQuery(center) {
  const parts = [];
  for (const entry of OSM_CATEGORIES) {
    const around = `(around:${categoryRadiusMeters(entry.category)},${center.lat},${center.lng})`;
    parts.push(`node${entry.filter}${around};`, `way${entry.filter}${around};`);
  }
  return `[out:json][timeout:25];(${parts.join('')});out center 40;`;
}

function categoryNameField(name) {
  const categoryName = String(name || '').trim();
  return categoryName ? { categoryName } : {};
}

function osmCategory(tags = {}) {
  const found = OSM_CATEGORIES.find((entry) => entry.match(tags));
  return found ? found.category : '';
}

function osmCategoryName(tags = {}) {
  const found = OSM_CATEGORIES.find((entry) => entry.match(tags));
  return found ? found.name(tags) : '';
}

async function queryOsm(fetchImpl, center) {
  const body = `data=${encodeURIComponent(overpassQuery(center))}`;
  const payload = await readJson(fetchImpl, 'https://overpass-api.de/api/interpreter', {
    label: 'OpenStreetMap Overpass',
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const places = [];
  for (const element of elements) {
    const tags = element?.tags || {};
    const title = String(tags.name || '').trim();
    const category = osmCategory(tags);
    const lat = finite(element?.lat ?? element?.center?.lat);
    const lng = finite(element?.lon ?? element?.center?.lon);
    if (!title || !category || lat === null || lng === null) continue;
    if (metersInsideCategory(center, { lat, lng }, category) === null) continue;
    places.push({
      source: 'osm',
      title,
      category,
      lat,
      lng,
      address: String(tags['addr:full'] || [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ')),
      url: element.type && element.id ? `https://www.openstreetmap.org/${element.type}/${element.id}` : '',
      externalId: element.type && element.id ? `${element.type}/${element.id}` : '',
      ...ratingFromRecord(tags),
      ...categoryNameField(osmCategoryName(tags)),
    });
  }
  return places;
}

function bravePoint(result) {
  const coords = result?.coordinates;
  if (Array.isArray(coords) && !Array.isArray(coords[0]) && coords.length >= 2) {
    return { lat: finite(coords[0]), lng: finite(coords[1]) };
  }
  if (Array.isArray(coords?.[0]) && coords[0].length >= 2) {
    return { lat: finite(coords[0][0]), lng: finite(coords[0][1]) };
  }
  return { lat: finite(result?.latitude), lng: finite(result?.longitude) };
}

function braveAddress(result) {
  if (typeof result?.address === 'string' && result.address.trim()) return result.address.trim();
  const postal = result?.postal_address || {};
  return [postal.streetAddress, postal.addressLocality, postal.addressRegion, postal.postalCode].filter(Boolean).join(', ');
}

function braveCategoryName(result) {
  const direct = result?.category;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (direct && typeof direct === 'object') {
    const name = String(direct.name || direct.label || '').trim();
    if (name) return name;
  }
  const categories = Array.isArray(result?.categories) ? result.categories : [];
  return categories.map((item) => String(item?.name || item || '').trim()).find(Boolean) || '';
}

function braveTitle(value) {
  const raw = String(value || '').trim();
  const cut = raw.split(/\s+[|]\s+/)[0].trim();
  return cut || raw;
}

async function queryBrave(fetchImpl, env, { center, locationText }, queries) {
  const places = [];
  for (const item of queries) {
    const anchorText = String(locationText || center?.label || '').trim();
    const q = center
      ? String(item.q || '').trim()
      : [String(item.q || '').trim(), anchorText ? `near ${anchorText}` : ''].filter(Boolean).join(' ').trim();
    const params = new URLSearchParams({
      q: q.slice(0, 500),
      count: String(item.limit || searchLimit(item.category)),
    });
    if (center) {
      params.set('latitude', String(center.lat));
      params.set('longitude', String(center.lng));
      params.set('radius', String(categoryRadiusMeters(item.category)));
    }
    const payload = await readJson(
      fetchImpl,
      `https://api.search.brave.com/res/v1/local/place_search?${params}`,
      {
        label: 'Brave Place Search',
        headers: { 'X-Subscription-Token': String(env.brave).trim() },
      },
    );
    const results = Array.isArray(payload?.results) ? payload.results : [];
    for (const result of results) {
      const point = bravePoint(result);
      const title = braveTitle(result?.title || result?.name);
      if (!title || point.lat === null || point.lng === null) continue;
      if (center && metersInsideCategory(center, point, item.category) === null) continue;
      places.push({
        source: 'brave',
        title,
        category: item.category,
        lat: point.lat,
        lng: point.lng,
        address: braveAddress(result),
        url: String(result?.url || ''),
        externalId: String(result?.id || result?.url || ''),
        ...ratingFromRecord(result),
        ...categoryNameField(braveCategoryName(result)),
      });
    }
  }
  return places;
}

export function selectPriorPlaces(rows = [], center) {
  const places = [];
  for (const row of rows) {
    const location = row?.location && typeof row.location === 'object' ? row.location : {};
    const lat = finite(location.lat ?? location.latitude ?? row?.lat);
    const lng = finite(location.lng ?? location.longitude ?? row?.lng);
    const category = PRIOR_CATEGORIES.get(String(row?.category || '').toLowerCase()) || '';
    const title = String(row?.title || '').trim();
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

async function queryPriorRows(env) {
  const databaseUrl = env.DATABASE_URL || env.NEON_DATABASE_URL || '';
  if (!databaseUrl) return [];
  const { sql } = await import('./db.mjs');
  const db = sql(env);
  return db`
    select id, title, category, location, source
    from trip_things
    where source in ('prior_db', 'osm', 'brave')
    order by updated_at desc
    limit 400
  `;
}

export async function readPriorPlaces(center, { env = process.env, query } = {}) {
  if (finite(center?.lat) === null || finite(center?.lng) === null) return [];
  const rows = query ? await query(center) : await queryPriorRows(env);
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
  let locationText = dest;
  const placeTarget = String(relevanceTarget || '').trim() || String(placeQueries[0]?.target || '').trim();
  const placeArea = String(relevanceArea || '').trim() || dest;
  if (placeQueries.length) {
    const pass = await runPlaceProviderPass({
      fetchImpl,
      env,
      dest,
      lodging,
      lodgingPoint,
      placeQueries,
      relevanceContext: { target: placeTarget, area: placeArea },
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
    });
    center = pass.center;
    locationText = pass.locationText || dest;
    places = pass.places;
    providerLog = pass.providerLog;
    relevanceRejections = pass.relevanceRejections || [];
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
    elapsedMs: Date.now() - started,
    sourceCounts: countSources(places),
  };
}

export function placeToTripThing(place) {
  const sourceRecord = sourceRecordFor(place);
  const sourceRef = sourceRefFor(place);
  return {
    category: place.category,
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
    metadata: {
      source: place.source,
      externalId: place.externalId || '',
      sourceRef,
      sourceRecord,
      jevScore: place.jevScore ?? 0,
      ...(place.categoryName ? { categoryName: String(place.categoryName).trim() } : {}),
    },
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

