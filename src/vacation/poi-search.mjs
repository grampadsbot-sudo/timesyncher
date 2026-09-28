/**
 * House-radius POI search. Foursquare OS Places records and OSM first.
 * Brave runs only when that database is thin. Synthesis may cite result IDs only.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const POI_RADIUS_METERS = {
  grocery: 8000,
  restaurant: 10000,
  store: 10000,
  garden: 40000,
  activity: 40000,
};

export const THIN_POI_COUNT = 3;
const POI_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const BRAVE_CACHE_MS = 8 * 60 * 60 * 1000;
const cache = new Map();
const braveCache = new Map();

export function clearPoiCache() {
  cache.clear();
  braveCache.clear();
}

export function geohash(lat, lng, precision = 6) {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  const latitude = Number(lat);
  const longitude = Number(lng);
  while (hash.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (longitude >= mid) {
        ch = (ch << 1) + 1;
        minLng = mid;
      } else {
        ch <<= 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (latitude >= mid) {
        ch = (ch << 1) + 1;
        minLat = mid;
      } else {
        ch <<= 1;
        maxLat = mid;
      }
    }
    even = !even;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export function distanceMeters(origin, point) {
  const lat1 = Number(origin?.lat);
  const lng1 = Number(origin?.lng);
  const lat2 = Number(point?.lat);
  const lng2 = Number(point?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cacheKey(origin, category, radiusMeters, dateBucket) {
  return [category, geohash(origin.lat, origin.lng, 6), radiusMeters, dateBucket || 'any'].join(':');
}

export function searchFsqRecords(records = [], { origin, radiusMeters, category }) {
  return records.filter((record) => {
    const meters = distanceMeters(origin, record);
    if (meters === null || meters > radiusMeters) return false;
    if (!category) return true;
    const blob = `${record.category || ''} ${(record.categories || []).join(' ')} ${record.name || ''}`;
    return new RegExp(category, 'i').test(blob);
  }).map((record) => ({
    id: `fsq:${record.id || record.fsq_id}`,
    name: String(record.name || '').trim(),
    lat: Number(record.lat),
    lng: Number(record.lng),
    category,
    source: 'fsq-os-places',
    url: record.website || `https://opensource.foursquare.com/os-places/${encodeURIComponent(record.id || record.fsq_id)}`,
  })).filter((poi) => poi.id !== 'fsq:' && poi.name);
}

export function overpassQuery({ lat, lng, radiusMeters, category }) {
  const tag = category === 'restaurant' || category === 'grocery'
    ? '["amenity"~"restaurant|cafe|fast_food|marketplace"]'
    : category === 'store'
      ? '["shop"]'
      : '["tourism"~"attraction|museum|viewpoint"]';
  return `[out:json][timeout:25];(node${tag}(around:${Math.round(radiusMeters)},${lat},${lng});way${tag}(around:${Math.round(radiusMeters)},${lat},${lng}););out center 20;`;
}

export function parseOverpass(payload, category) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  return elements.map((element) => {
    const lat = Number(element.lat ?? element.center?.lat);
    const lng = Number(element.lon ?? element.center?.lon);
    const name = String(element.tags?.name || '').trim();
    const id = `osm:${element.type}/${element.id}`;
    return {
      id,
      name,
      lat,
      lng,
      category,
      source: 'osm',
      url: element.type && element.id ? `https://www.openstreetmap.org/${element.type}/${element.id}` : '',
    };
  }).filter((poi) => poi.name && Number.isFinite(poi.lat) && Number.isFinite(poi.lng));
}

function bravePois(payload, category) {
  const results = payload?.web?.results || payload?.results || [];
  return results.map((result) => ({
    id: `brave:${result.url || result.title}`,
    name: String(result.title || '').trim(),
    lat: Number(result.lat),
    lng: Number(result.lng),
    category,
    source: 'brave',
    url: String(result.url || ''),
  })).filter((poi) => poi.url && poi.name);
}

async function fetchBrave(fetchImpl, braveKey, origin, category) {
  const response = await fetchImpl(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`${category} near ${origin.lat},${origin.lng}`)}`, {
    headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
  });
  if (!response?.ok) return [];
  return bravePois(await response.json(), category);
}

async function braveForThinDatabase(key, database, { fetchImpl, braveKey, origin, category, thinAt, now }) {
  if (database.length >= thinAt || !braveKey || !fetchImpl) return [];
  const hit = braveCache.get(key);
  if (hit && hit.expiresAt > now) return hit.pois;
  const pois = await fetchBrave(fetchImpl, braveKey, origin, category);
  braveCache.set(key, { expiresAt: now + BRAVE_CACHE_MS, pois });
  return pois;
}

export async function searchPois({
  origin,
  category,
  dateBucket = '',
  fsqRecords = [],
  fetchImpl = fetch,
  braveKey = '',
  thinAt = THIN_POI_COUNT,
  now = Date.now(),
} = {}) {
  if (!Number.isFinite(Number(origin?.lat)) || !Number.isFinite(Number(origin?.lng))) {
    return { pois: [], cache: 'miss', brave: false };
  }
  const radiusMeters = POI_RADIUS_METERS[category] || POI_RADIUS_METERS.activity;
  const key = cacheKey(origin, category, radiusMeters, dateBucket);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    const brave = await braveForThinDatabase(key, hit.value.pois, { fetchImpl, braveKey, origin, category, thinAt, now });
    return { pois: [...hit.value.pois, ...brave], cache: 'hit', brave: brave.length > 0 };
  }
  const fsq = searchFsqRecords(fsqRecords, { origin, radiusMeters, category });
  let osm = [];
  if (fsq.length < thinAt && fetchImpl) {
    const body = overpassQuery({ lat: origin.lat, lng: origin.lng, radiusMeters, category });
    const response = await fetchImpl('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'TimeSyncherVacation/1.0' },
      body: `data=${encodeURIComponent(body)}`,
    });
    if (response?.ok) osm = parseOverpass(await response.json(), category);
  }
  const database = [...fsq, ...osm];
  cache.set(key, { expiresAt: now + POI_CACHE_MS, value: { pois: database } });
  const brave = await braveForThinDatabase(key, database, { fetchImpl, braveKey, origin, category, thinAt, now });
  return { pois: [...database, ...brave], cache: 'miss', brave: brave.length > 0 };
}

export async function jevRelevanceScore(poi, { fetchImpl = fetch, apiKey = '' } = {}) {
  if (!apiKey || !fetchImpl) return 0;
  const response = await fetchImpl('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://timesyncher.com',
      'X-Title': 'TimeSyncher Vacation POI',
    },
    body: JSON.stringify({
      model: 'typesafe/jev-1.13',
      state: { channel: 'vacation-search', poiId: poi.id, name: poi.name, url: poi.url, category: poi.category },
      questions: {
        relevance: {
          type: 'score',
          instructions: 'Score this web result as a specific place for the trip. 1 is not a place. 5 is a specific place that matches the category.',
          criteria: { 1: 'Not a specific place.', 5: 'A specific place that matches the category.' },
        },
      },
    }),
  });
  if (!response?.ok) return 0;
  const body = await response.json();
  const answer = body?.answers?.relevance || {};
  const choice = Number(answer.choice ?? answer.value);
  if (Number.isInteger(choice) && choice >= 1 && choice <= 5) return choice;
  const raw = Number(answer.score);
  if (!Number.isFinite(raw)) return 0;
  if (Number.isInteger(raw) && raw >= 0 && raw <= 4) return raw + 1;
  if (raw >= 1 && raw <= 5) return raw;
  return 0;
}

export async function scoreWebPoisInParallel(pois, scoreOne, { concurrency = 20 } = {}) {
  let cursor = 0;
  const kept = [];
  async function worker() {
    while (cursor < pois.length) {
      const index = cursor;
      cursor += 1;
      const poi = pois[index];
      const score = Number(await scoreOne(poi));
      if (score === 0) {
        kept.push(poi);
        continue;
      }
      if (score >= 3) kept.push({ ...poi, jevScore: score });
    }
  }
  const workers = Math.min(concurrency, pois.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()));
  return kept;
}

export function synthesizeFromIds(ids = [], pois = []) {
  const byId = new Map(pois.map((poi) => [poi.id, poi]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function lowestRentalPrices(offers = [], { limit = 10, eliminatedBrands = [] } = {}) {
  const blocked = new Set(eliminatedBrands.map((brand) => String(brand || '').trim().toLowerCase()).filter(Boolean));
  return [...offers]
    .filter((offer) => Number.isFinite(Number(offer.price)) && !blocked.has(String(offer.brand || '').trim().toLowerCase()))
    .sort((a, b) => Number(a.price) - Number(b.price) || String(a.brand || '').localeCompare(String(b.brand || '')))
    .slice(0, limit);
}
