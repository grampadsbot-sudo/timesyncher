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

function starFromSnippet(snippet = '') {
  const m = String(snippet).match(/(\d(?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?)/i);
  return m ? Number(m[1]) : null;
}

export function normalizeBraveWebResults(payload = {}, query = '') {
  const web = payload?.web?.results || payload?.results || [];
  const out = [];
  for (const row of web) {
    const url = String(row.url || row.link || '').trim();
    if (!/^https?:\/\//.test(url)) continue;
    const title = String(row.title || '').trim();
    const snippets = [
      String(row.description || row.snippet || '').trim(),
      ...(Array.isArray(row.extra_snippets) ? row.extra_snippets.map((s) => String(s || '').trim()) : []),
    ].filter(Boolean);
    const rating = starFromSnippet(snippets.join(' '));
    out.push({ url, title, snippets, rating, query });
  }
  return out;
}

export async function braveWebSearch(query, { env = process.env, fetchImpl = globalThis.fetch, count = 8 } = {}) {
  const startedAt = new Date().toISOString();
  const key = braveSubscriptionKey(env);
  if (!key || !String(query || '').trim()) return { results: [], attempts: [{ kind: 'brave', step: 'web_search', startedAt, status: key ? 'no_query' : 'missing_key', query }] };
  try {
    const params = new URLSearchParams({ q: String(query).trim(), count: String(count) });
    const payload = await braveGet(`/web/search?${params}`, key, fetchImpl);
    const results = normalizeBraveWebResults(payload, query);
    return {
      results,
      attempts: [{ kind: 'brave', step: 'web_search', startedAt, status: 'ok', query, results: results.length }],
    };
  } catch (error) {
    return {
      results: [],
      attempts: [{ kind: 'brave', step: 'web_search', startedAt, status: 'failed', query, error: String(error?.message || '').slice(0, 60) }],
    };
  }
}

export async function runBraveQueries(queries = [], options = {}) {
  const pages = [];
  const attempts = [];
  const braveResults = [];
  const seen = new Set();
  for (const row of queries) {
    const query = typeof row === 'string' ? row : row.query;
    const { results, attempts: att } = await braveWebSearch(query, options);
    attempts.push(...att);
    for (const hit of results) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      braveResults.push(hit);
      const snippetText = [hit.title, ...hit.snippets].filter(Boolean).join('\n');
      if (snippetText.trim()) {
        pages.push({
          url: hit.url,
          fetchedAt: new Date().toISOString(),
          text: snippetText.slice(0, 12000),
          via: 'brave-snippet',
          sha256: createHash('sha256').update(snippetText).digest('hex'),
          braveSnippet: true,
        });
      }
    }
  }
  return { pages, attempts, braveResults };
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
  try {
    if (searchCenter) {
      const params = new URLSearchParams({
        q: lookupQuery,
        latitude: String(searchCenter.lat),
        longitude: String(searchCenter.lng),
        radius: '5000',
        count: '8',
      });
      rows = (await braveGet(`/local/place_search?${params}`, key, fetchImpl))?.results || [];
      attempts.push({ kind: 'brave', step: 'place_search', status: 'ok', results: rows.length });
    }
    if (!pickBraveLocation(rows, name)) {
      const params = new URLSearchParams({ q: lookupQuery, result_filter: 'locations', count: '8' });
      rows = (await braveGet(`/web/search?${params}`, key, fetchImpl))?.locations?.results || [];
      attempts.push({ kind: 'brave', step: 'local_search', status: 'ok', results: rows.length });
    }
  } catch (error) {
    attempts.push({ kind: 'brave', step: 'search', status: 'failed', error: String(error?.message || '').slice(0, 40) });
    return { pages: [], attempts };
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
