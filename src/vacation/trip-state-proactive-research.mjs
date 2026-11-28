import { nominatimForwardSearch, tryGeocodeLabel } from './place-search-geocode.mjs';
import { filterPlacesWithinRadius } from './place-search-radius-filter.mjs';
import { searchTavily } from './poi-search.mjs';
import { queryVkSearchPlaces } from './vk-search-place-identity.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { digestTripState } from './trip-state-action-site.mjs';
import { isTripThingName, normalizeTripThingName } from './trip-thing-name-shape.mjs';

const categories = [
  { type: 'hotel', category: 'hotel', target: 'lodging options', osmTypes: ['hotel', 'motel', 'guest_house', 'hostel', 'resort'] },
  { type: 'park', category: 'activity', target: 'parks and local attractions', osmTypes: ['park', 'garden', 'nature_reserve', 'attraction', 'museum', 'viewpoint'] },
  { type: 'restaurant', category: 'restaurant', target: 'casual local dining', osmTypes: ['restaurant', 'cafe', 'fast_food'] },
  { type: 'bar', category: 'restaurant', target: 'bars and nightlife', osmTypes: ['bar', 'pub', 'nightclub'] },
  { type: 'event', category: 'activity', target: 'local events on these dates' },
];

async function searchWebPlaces(q, { area, center, category, osmTypes, env, fetchImpl }) {
  const { results } = await searchTavily(q, { env, fetchImpl });
  const matches = await Promise.allSettled(results.map(async ({ title, url }) => {
    const name = title.split(/\s+[|—–-]\s+|,\s+/)[0].trim();
    if (!isTripThingName(name)) return null;
    const { hits } = await nominatimForwardSearch(fetchImpl, `${name}, ${area}`, null, { env, limit: 3 });
    const places = hits.filter((hit) => hit.osm_type && hit.osm_id && hit.lat && hit.lon
      && osmTypes.includes(hit.type) && normalizeTripThingName(hit.name) === normalizeTripThingName(name))
      .map((hit) => ({
        externalId: `${hit.osm_type}/${hit.osm_id}`, title: hit.name, address: hit.display_name,
        lat: Number(hit.lat), lng: Number(hit.lon), source: 'tavily', url,
      }));
    return filterPlacesWithinRadius(places, center, () => category).places[0];
  }));
  return matches.flatMap((match) => match.status === 'fulfilled' && match.value ? [match.value] : []);
}

export async function searchProactiveItinerary({
  destination, start, end, criteria, targets = {}, turn, key, env, fetchImpl = globalThis.fetch,
}) {
  const area = String(destination || '').trim().slice(0, 280);
  const waiting = { key, state: 'failed', turn, areas: area ? [area] : [], gaps: [] };
  const providerEnv = buildProviderEnv(env);
  const deadline = AbortSignal.timeout(22_000);
  const fetchBounded = (url, options = {}) => fetchImpl(url, {
    ...options, signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
  });
  let center = null;
  try {
    center = await tryGeocodeLabel(fetchBounded, area, [], null, { env: providerEnv });
  } catch (error) {
    center = error ? null : null;
  }
  if (!center) {
    return { research: { ...waiting, gaps: ['The destination could not be resolved for place search.'] }, candidates: {} };
  }
  const requested = categories.filter(({ type }) => Object.hasOwn(targets, type));
  const selected = requested.length ? requested : categories.slice(0, 3);
  const attempts = await Promise.all(selected.map(async ({ type, category, target, osmTypes }) => {
    const q = [area, start === end ? start : `${start} to ${end}`, target, ...(targets[type] || []), ...criteria].join(' ').slice(0, 240);
    const search = () => queryVkSearchPlaces(fetchBounded, providerEnv, { center, locationText: area },
      [{ q, category, areaHint: area }]);
    const failed = { places: [], failed: true };
    const result = providerEnv.VK_SEARCH_BOT_PRIMARY === '0' ? { places: [] } : await search().catch((error) => {
      if (deadline.aborted || (error?.httpStatus && error.httpStatus < 500 && error.httpStatus !== 429)) return failed;
      return search().catch(() => failed);
    });
    const places = result.places.filter((place) => place.externalId && isTripThingName(place.title));
    let webFailed = false;
    if (places.length < 3 && osmTypes && providerEnv.tavily && !deadline.aborted) {
      try {
        const webPlaces = await searchWebPlaces(q, { area, center, category, osmTypes, env: providerEnv, fetchImpl: fetchBounded });
        const names = new Set(places.map((place) => normalizeTripThingName(place.title)));
        for (const place of webPlaces) {
          const name = normalizeTripThingName(place.title);
          if (names.has(name)) continue;
          places.push(place);
          names.add(name);
        }
      } catch {
        webFailed = true;
      }
    }
    const candidates = places.slice(0, 3).map((place) => {
      const web = place.source === 'tavily';
      const result_id = `${web ? 'tavily' : 'vk'}-${digestTripState([place.externalId, place.address, place.lat, place.lng]).slice(0, 40)}`;
      const facts = [place.address, place.price == null ? '' : `Reported price: ${place.price}`, web ? place.url : '']
        .map((value) => String(value || '').trim().slice(0, 280)).filter(Boolean);
      return { result_id, title: place.title.slice(0, 280), type, area, source: web ? 'tavily' : 'vk_search', turn, facts: [...new Set(facts)] };
    });
    return { type, candidates, failed: candidates.length === 0 && (result.failed || webFailed) };
  }));
  const gaps = attempts.flatMap(({ type, candidates, failed }) => (failed || !candidates.length
    ? [`${type}: ${failed ? 'search unavailable' : 'no verified options'}`] : []));
  const candidates = Object.fromEntries(attempts.flatMap((result) => result.candidates || [])
    .map((candidate) => [candidate.result_id, candidate]));
  const state = Object.keys(candidates).length ? (gaps.length ? 'partial' : 'complete')
    : attempts.every(({ failed }) => failed) ? 'failed' : 'empty';
  return { research: { ...waiting, state, gaps }, candidates };
}
