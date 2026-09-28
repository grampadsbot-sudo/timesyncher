const RADIUS_METERS = 20000;
const DEDUPE_METERS = 250;
const USER_AGENT = 'TimeSyncherVacation/1.0';
const PLACE_SOURCES = ['prior_db', 'foursquare_os', 'osm', 'brave'];
const SOURCE_IDS = new Set(PLACE_SOURCES);
export const SEARCH_TARGETS = {
  restaurant: 15,
  store: 10,
  activity: 15,
};
const DEFAULT_QUERIES = [
  { category: 'restaurant', q: 'restaurant' },
  { category: 'store', q: 'store' },
  { category: 'activity', q: 'attraction' },
];
const PLACE_STOP = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|from|for|with|between|around|starting|leaving|ending|ended|ends|through|until|next|this|morning|afternoon|evening|please|and|or';
const NOT_A_PLACE = /^(?:the|a|an|this|that|our|my|your|new|next|last|current|week|weeks|night|nights|day|days|morning|afternoon|evening|weekend|month|year|time|trip|trips|vacation|vacations|staycation|holiday|bot|staging|one|it|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/i;
const PRIOR_CATEGORIES = new Map([
  ['restaurant', 'restaurant'],
  ['food', 'restaurant'],
  ['dining', 'restaurant'],
  ['store', 'store'],
  ['shop', 'store'],
  ['shopping', 'store'],
  ['activity', 'activity'],
  ['attraction', 'activity'],
  ['tourism', 'activity'],
  ['event', 'activity'],
]);

export class PlaceSearchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PlaceSearchError';
    this.code = code;
  }
}

function fail(message, code) {
  console.error(message);
  throw new PlaceSearchError(message, code);
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

function categoryForPhrase(phrase) {
  if (/\b(restaurants?|cafes?|coffee|dining|dinner|lunch|breakfast|brunch|food|eater(?:y|ies)|eat)\b/i.test(phrase)) return 'restaurant';
  if (/\b(stores?|shops?|shopping|grocer(?:y|ies)|markets?|boutiques?)\b/i.test(phrase)) return 'store';
  if (/\b(activities|attractions?|museums?|beaches?|hikes?|tours?|sightseeing|things to do)\b/i.test(phrase)) return 'activity';
  return '';
}

function pushQuery(found, seen, category, q) {
  const query = cleanPlace(q);
  const key = `${category}:${normalizeName(query)}`;
  if (!query || query.length < 2 || seen.has(key) || NOT_A_PLACE.test(query)) return;
  seen.add(key);
  found.push({ category, q: query, limit: SEARCH_TARGETS[category] });
}

export function wantedSearchQueries(requestText = '') {
  const source = String(requestText || '').replace(/\s+/g, ' ').trim();
  const found = [];
  const seen = new Set();
  const wantRe = /\b(?:want|wants|wanted|looking for|need|needs|find(?: me)?)\s+([^,.!?]{2,80}?)(?=\s+(?:in|near|around|at|for|with|please)\b|[,.!?]|$)/gi;
  let match = wantRe.exec(source);
  while (match) {
    for (const part of match[1].split(/\s+(?:and|or|plus)\s+/i)) {
      const phrase = cleanPlace(part);
      if (!phrase || NOT_A_PLACE.test(phrase)) continue;
      pushQuery(found, seen, categoryForPhrase(phrase) || 'activity', phrase);
    }
    if (match.index === wantRe.lastIndex) wantRe.lastIndex += 1;
    match = wantRe.exec(source);
  }
  const mentionRe = /\b(restaurants?|cafes?|coffee shops?|grocery(?: stores?)?|groceries|shopping|stores?|shops?|markets?|museums?|beaches?|hikes?|tours?|attractions?|things to do)\b/gi;
  match = mentionRe.exec(source);
  while (match) {
    const category = categoryForPhrase(match[1]);
    if (category) pushQuery(found, seen, category, match[1]);
    match = mentionRe.exec(source);
  }
  for (const item of DEFAULT_QUERIES) {
    if (!found.some((query) => query.category === item.category)) pushQuery(found, seen, item.category, item.q);
  }
  return found;
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
      };
      if (kept.some((item) => samePlace(item, next))) continue;
      kept.push(next);
    }
  }
  return kept;
}

export function missingSearchKeys(env = {}) {
  const missing = [];
  if (!String(env.brave || '').trim()) missing.push(String(env.braveName || 'brave'));
  if (!String(env.foursquare || '').trim()) missing.push(String(env.foursquareName || 'foursquare'));
  return missing;
}

function countSources(places) {
  const counts = { prior_db: 0, foursquare_os: 0, osm: 0, brave: 0 };
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
        'user-agent': USER_AGENT,
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

async function geocodeLabel(fetchImpl, label) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(label)}`;
  const payload = await readJson(fetchImpl, url, { label: 'Nominatim geocode' });
  const hit = Array.isArray(payload) ? payload[0] : null;
  const lat = finite(hit?.lat);
  const lng = finite(hit?.lon ?? hit?.lng);
  if (lat === null || lng === null) return null;
  return { lat, lng, label: String(hit.display_name || label) };
}

function pointFrom(value) {
  const lat = finite(value?.lat ?? value?.latitude);
  const lng = finite(value?.lng ?? value?.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng, label: String(value.label || value.address || '') };
}

async function resolveCenter(fetchImpl, { lodging, lodgingPoint, destination }) {
  const given = pointFrom(lodgingPoint);
  if (given) return { ...given, geocoded: 'lodging' };
  const lodgingLabel = String(lodging || '').trim();
  const destinationLabel = String(destination || '').trim();
  if (lodgingLabel) {
    const found = await geocodeLabel(fetchImpl, lodgingLabel);
    if (found) return { ...found, geocoded: 'lodging' };
    console.error(`Nominatim returned no coordinates for lodging "${lodgingLabel}".`);
    if (!destinationLabel) fail(`Nominatim returned no coordinates for lodging "${lodgingLabel}".`, 'geocode_failed');
  }
  if (!destinationLabel) fail('Place search needs a destination.', 'missing_destination');
  const found = await geocodeLabel(fetchImpl, destinationLabel);
  if (!found) fail(`Nominatim returned no coordinates for destination "${destinationLabel}".`, 'geocode_failed');
  return { ...found, geocoded: 'destination' };
}

async function queryFoursquare(fetchImpl, env, center, queries) {
  const places = [];
  for (const item of queries) {
    const params = new URLSearchParams({
      query: item.q,
      ll: `${center.lat},${center.lng}`,
      radius: String(RADIUS_METERS),
      limit: String(item.limit || SEARCH_TARGETS[item.category] || 15),
      fields: 'fsq_place_id,name,latitude,longitude,location,link,date_closed',
    });
    const payload = await readJson(
      fetchImpl,
      `https://places-api.foursquare.com/places/search?${params}`,
      {
        label: 'Foursquare OS Places',
        headers: {
          authorization: `Bearer ${String(env.foursquare).trim()}`,
          'X-Places-Api-Version': '2025-06-17',
        },
      },
    );
    const results = Array.isArray(payload?.results) ? payload.results : [];
    for (const result of results) {
      if (result?.date_closed) continue;
      const lat = finite(result?.latitude);
      const lng = finite(result?.longitude);
      const title = String(result?.name || '').trim();
      if (!title || lat === null || lng === null) continue;
      places.push({
        source: 'foursquare_os',
        title,
        category: item.category,
        lat,
        lng,
        address: String(result.location?.formatted_address || result.location?.address || ''),
        url: String(result.link || ''),
        externalId: String(result.fsq_place_id || ''),
      });
    }
  }
  return places;
}

function overpassQuery(center) {
  const around = `(around:${RADIUS_METERS},${center.lat},${center.lng})`;
  return `[out:json][timeout:25];(`
    + `node["amenity"~"restaurant|cafe|fast_food"]${around};`
    + `way["amenity"~"restaurant|cafe|fast_food"]${around};`
    + `node["shop"]${around};`
    + `way["shop"]${around};`
    + `node["tourism"~"attraction|museum|gallery|viewpoint"]${around};`
    + `way["tourism"~"attraction|museum|gallery|viewpoint"]${around};`
    + `);out center 40;`;
}

function osmCategory(tags = {}) {
  if (/restaurant|cafe|fast_food/.test(String(tags.amenity || ''))) return 'restaurant';
  if (tags.shop) return 'store';
  if (tags.tourism) return 'activity';
  return '';
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
    places.push({
      source: 'osm',
      title,
      category,
      lat,
      lng,
      address: String(tags['addr:full'] || [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ')),
      url: element.type && element.id ? `https://www.openstreetmap.org/${element.type}/${element.id}` : '',
      externalId: element.type && element.id ? `${element.type}/${element.id}` : '',
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

function braveTitle(value) {
  const raw = String(value || '').trim();
  const cut = raw.split(/\s+[|]\s+/)[0].trim();
  return cut || raw;
}

async function queryBrave(fetchImpl, env, center, queries) {
  const places = [];
  for (const item of queries) {
    const params = new URLSearchParams({
      q: item.q,
      latitude: String(center.lat),
      longitude: String(center.lng),
      radius: String(RADIUS_METERS),
      count: String(item.limit || SEARCH_TARGETS[item.category] || 15),
    });
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
      places.push({
        source: 'brave',
        title,
        category: item.category,
        lat: point.lat,
        lng: point.lng,
        address: braveAddress(result),
        url: String(result?.url || ''),
        externalId: String(result?.id || result?.url || ''),
      });
    }
  }
  return places;
}

export function selectPriorPlaces(rows = [], center, { radiusMeters = RADIUS_METERS } = {}) {
  const places = [];
  for (const row of rows) {
    const location = row?.location && typeof row.location === 'object' ? row.location : {};
    const lat = finite(location.lat ?? location.latitude ?? row?.lat);
    const lng = finite(location.lng ?? location.longitude ?? row?.lng);
    const category = PRIOR_CATEGORIES.get(String(row?.category || '').toLowerCase()) || '';
    const title = String(row?.title || '').trim();
    if (!title || !category || lat === null || lng === null) continue;
    const meters = distanceMeters(center, { lat, lng });
    if (meters === null || meters > radiusMeters) continue;
    places.push({
      source: 'prior_db',
      title,
      category,
      lat,
      lng,
      address: String(location.address || row?.address || ''),
      url: '',
      externalId: String(row?.id || title),
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
    where source in ('prior_db', 'foursquare_os', 'osm', 'brave')
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

export async function searchPlaces({
  destination,
  lodging = '',
  lodgingPoint,
  requestText = '',
  queries,
  env = process.env,
  fetchImpl = globalThis.fetch,
  priorPlaces,
  loadPriorPlaces,
} = {}) {
  const started = Date.now();
  const missing = missingSearchKeys(env);
  if (missing.length) {
    fail(`Place search refused to run. Missing ${missing.join(', ')}.`, 'missing_key');
  }
  const dest = String(destination || '').trim();
  const searchQueries = Array.isArray(queries) && queries.length ? queries : wantedSearchQueries(requestText);
  const center = await resolveCenter(fetchImpl, { lodging, lodgingPoint, destination: dest });
  let prior = [];
  if (Array.isArray(priorPlaces)) prior = selectPriorPlaces(priorRowsFromInput(priorPlaces), center);
  else if (loadPriorPlaces) prior = await loadPriorPlaces(center);
  else prior = await readPriorPlaces(center, { env });
  prior = (Array.isArray(prior) ? prior : []).map((place) => ({ ...place, source: 'prior_db' }));
  const foursquare = await queryFoursquare(fetchImpl, env, center, searchQueries);
  const osm = await queryOsm(fetchImpl, center);
  const brave = await queryBrave(fetchImpl, env, center, searchQueries);
  const places = mergePlaces([prior, foursquare, osm, brave]);
  const liveCount = places.filter((place) => place.source !== 'prior_db').length;
  if (!liveCount) {
    fail(
      places.length
        ? 'Prior Things are not a sole source. Foursquare OS Places, OpenStreetMap, and Brave Place Search returned no places.'
        : `Place search returned no places for ${dest || lodging || center.label}.`,
      places.length ? 'prior_db_sole_source' : 'empty',
    );
  }
  return {
    destination: dest || center.label,
    center,
    places,
    queries: searchQueries,
    queried: PLACE_SOURCES,
    elapsedMs: Date.now() - started,
    sourceCounts: countSources(places),
  };
}

export function placeToTripThing(place) {
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
    ratings: {},
    metadata: {
      source: place.source,
      externalId: place.externalId || '',
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
    },
  };
}

export async function fillTripIntake(options) {
  const search = await searchPlaces(options);
  return {
    search,
    things: search.places.map(placeToTripThing),
    researchedThings: search.places.map((place) => placeToResearchCandidate(place, search.destination)),
  };
}
