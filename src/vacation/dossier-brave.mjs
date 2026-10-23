import { createHash } from 'node:crypto';
import { bravePoint } from './brave-place-query.mjs';
import { intakeLodgingLookupQuery } from './intake-lodging-lookup.mjs';
import { braveSubscriptionKey, BRAVE_SEARCH_RES_V1 } from './poi-search.mjs';
const nameKey = (value) => String(value || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function placeCoords(place = {}) {
  const src = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  const fromRecord = bravePoint(src);
  if (fromRecord.lat !== null && fromRecord.lng !== null) return { lat: fromRecord.lat, lng: fromRecord.lng };
  const fromPlace = bravePoint(place);
  if (fromPlace.lat !== null && fromPlace.lng !== null) return { lat: fromPlace.lat, lng: fromPlace.lng };
  const lat = finite(place.lat ?? place.latitude ?? src.lat ?? src.latitude);
  const lng = finite(place.lng ?? place.lon ?? place.longitude ?? src.lng ?? src.lon ?? src.longitude);
  return lat !== null && lng !== null ? { lat, lng } : null;
}

function destinationCenter(place = {}, center = null) {
  const fromCoords = placeCoords(place);
  if (fromCoords) return fromCoords;
  const meta = place.metadata && typeof place.metadata === 'object' ? place.metadata : {};
  const fromMeta = bravePoint({ coordinates: meta.destinationCenter, ...meta.destinationCenter });
  if (fromMeta.lat !== null && fromMeta.lng !== null) return { lat: fromMeta.lat, lng: fromMeta.lng };
  const lat = finite(center?.lat);
  const lng = finite(center?.lng);
  return lat !== null && lng !== null ? { lat, lng } : null;
}

export function pickBraveLocation(rows = [], name = '') {
  const core = nameKey(String(name).split(/\s[-–|]\s/)[0]);
  return rows.find((row) => row?.id && nameKey(row.title || row.name).includes(core))
    || rows.find((row) => row?.id && core.includes(nameKey(row.title || row.name)) && nameKey(row.title || row.name).length >= 4);
}

function reviewText(row) {
  return String(row?.comment || row?.description || row?.text || '').replace(/\s+/g, ' ').trim();
}

export function bravePoiPage(poi = {}, { fetchedAt = new Date().toISOString(), id = '' } = {}) {
  const rating = poi.rating || {};
  const average = finite(rating.ratingValue);
  const best = finite(rating.bestRating) || 5;
  const count = finite(rating.reviewCount);
  const profile = rating.profile || {};
  const reviews = (Array.isArray(poi.reviews?.results) ? poi.reviews.results : Array.isArray(poi.reviews) ? poi.reviews : [])
    .map((row) => ({ text: reviewText(row), date: String(row?.date || row?.age || '').trim(), rating: finite(row?.rating?.ratingValue ?? row?.rating) }))
    .filter((row) => row.text.length >= 20);
  const url = [profile.url, poi.reviews?.viewMoreUrl, poi.url].find((u) => /^https?:\/\//.test(String(u || '')));
  if (!url || (!average && !reviews.length)) return null;
  const source = String(profile.name || 'Tripadvisor').trim();
  const lines = [`${poi.title || ''} on ${source} (via Brave local POIs${id ? `, id ${id}` : ''}).`];
  let ratingQuote = '';
  if (average && count) {
    ratingQuote = `Rated ${average} out of ${best} from ${count} reviews on ${source}.`;
    lines.push(ratingQuote);
  }
  reviews.forEach((row, index) => lines.push(`Review ${index + 1}${row.rating ? ` (${row.rating}/5)` : ''}${row.date ? ` ${row.date}` : ''}: ${row.text}`));
  const text = lines.join('\n');
  return {
    url, fetchedAt, text, via: 'brave', sha256: createHash('sha256').update(text).digest('hex'),
    braveRating: average && count ? { average, count, scaleMax: best, quote: ratingQuote, url, source } : null,
    braveReviews: reviews,
  };
}

async function braveGet(path, key, fetchImpl) {
  const response = await fetchImpl(`${BRAVE_SEARCH_RES_V1}${path}`, { method: 'GET', headers: { accept: 'application/json', 'X-Subscription-Token': key } });
  if (!response?.ok) throw new Error(`brave_http_${Number(response?.status) || 0}`);
  return response.json();
}

export async function braveLocalEvidence(place = {}, {
  destination = '', center = null, env = process.env, fetchImpl = globalThis.fetch,
} = {}) {
  const attempts = [];
  const name = String(place.title || place.name || '').trim();
  const key = braveSubscriptionKey(env);
  if (!key || !name) return { pages: [], attempts: [{ kind: 'brave', status: key ? 'no_name' : 'missing_key' }] };
  const lookupQuery = intakeLodgingLookupQuery(name, destination) || name;
  let rows = [];
  const searchCenter = destinationCenter(place, center);
  if (searchCenter) {
    try {
      const params = new URLSearchParams({
        q: lookupQuery,
        latitude: String(searchCenter.lat),
        longitude: String(searchCenter.lng),
        radius: '5000',
        count: '8',
      });
      rows = (await braveGet(`/local/place_search?${params}`, key, fetchImpl))?.results || [];
      attempts.push({ kind: 'brave', step: 'place_search', status: 'ok', results: rows.length });
    } catch (error) {
      const reason = String(error?.message || '').slice(0, 40);
      attempts.push({ kind: 'brave', step: 'place_search', status: 'failed', error: reason });
      if (reason !== 'brave_http_404') return { pages: [], attempts };
    }
  }
  if (!pickBraveLocation(rows, name)) {
    try {
      const params = new URLSearchParams({ q: lookupQuery, result_filter: 'locations', count: '8' });
      rows = (await braveGet(`/web/search?${params}`, key, fetchImpl))?.locations?.results || [];
      attempts.push({ kind: 'brave', step: 'local_search', status: 'ok', results: rows.length });
    } catch (error) {
      attempts.push({ kind: 'brave', step: 'local_search', status: 'failed', error: String(error?.message || '').slice(0, 40) });
      return { pages: [], attempts };
    }
  }
  const hit = pickBraveLocation(rows, name);
  if (!hit) {
    attempts.push({ kind: 'brave', step: 'match', status: 'no_match' });
    return { pages: [], attempts };
  }
  try {
    const pois = (await braveGet(`/local/pois?${new URLSearchParams({ ids: hit.id })}`, key, fetchImpl))?.results || [];
    const page = bravePoiPage(pois[0] || {}, { id: hit.id });
    attempts.push({ kind: 'brave', step: 'pois', status: page ? 'ok' : 'empty', reviews: page?.braveReviews.length || 0, rating: Boolean(page?.braveRating) });
    return { pages: page ? [page] : [], attempts };
  } catch (error) {
    attempts.push({ kind: 'brave', step: 'pois', status: 'failed', error: String(error?.message || '').slice(0, 40) });
    return { pages: [], attempts };
  }
}
