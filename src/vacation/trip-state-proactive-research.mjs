import { tryGeocodeLabel } from './place-search-geocode.mjs';
import { queryVkSearchPlaces } from './vk-search-place-identity.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { digestTripState } from './trip-state-action-site.mjs';
import { isTripThingName } from './trip-thing-name-shape.mjs';

const categories = [
  { type: 'hotel', category: 'hotel', target: 'lodging options' },
  { type: 'park', category: 'activity', target: 'parks and local attractions' },
  { type: 'restaurant', category: 'restaurant', target: 'casual local dining' },
];

export async function searchProactiveItinerary({
  destination, start, end, criteria, turn, key, env, fetchImpl = globalThis.fetch,
}) {
  const waiting = { key, state: 'failed', turn, areas: [destination], gaps: [] };
  const providerEnv = buildProviderEnv(env);
  if (!providerEnv.VK_SEARCH_WAKE_URL && !providerEnv.VK_SEARCH_CENSUS_DIR) {
    return { research: { ...waiting, gaps: ['VK place search is unavailable.'] }, candidates: {} };
  }
  const deadline = AbortSignal.timeout(22_000);
  const fetchBounded = (url, options = {}) => fetchImpl(url, {
    ...options, signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
  });
  const center = await tryGeocodeLabel(fetchBounded, destination, [], null, { env: providerEnv });
  if (!center) {
    return { research: { ...waiting, gaps: ['The destination could not be resolved for place search.'] }, candidates: {} };
  }
  const attempts = await Promise.all(categories.map(async ({ type, category, target }) => {
    const q = [destination, start === end ? start : `${start} to ${end}`, target, ...criteria].join(' ').slice(0, 240);
    const search = () => queryVkSearchPlaces(fetchBounded, providerEnv, { center, locationText: destination },
      [{ q, category, areaHint: destination }]);
    let result;
    try {
      result = await search();
    } catch (error) {
      if (deadline.aborted || (error?.httpStatus && error.httpStatus < 500 && error.httpStatus !== 429)) return { type, failed: true };
      try {
        result = await search();
      } catch {
        return { type, failed: true };
      }
    }
    if (result.skipped) return { type, failed: true };
    const candidates = result.places
      .filter((place) => place.externalId && isTripThingName(place.title))
      .slice(0, 3)
      .map((place) => {
        const result_id = `vk-${digestTripState([place.externalId, place.address, place.lat, place.lng]).slice(0, 40)}`;
        const facts = [place.address, place.price == null ? '' : `Reported price: ${place.price}`]
          .map((value) => String(value || '').trim().slice(0, 280)).filter(Boolean);
        return { result_id, title: place.title, type, area: destination, source: 'vk_search', turn, facts: [...new Set(facts)] };
      });
    return { type, candidates };
  }));
  const gaps = attempts.flatMap(({ type, candidates, failed }) => (failed || !candidates.length
    ? [`${type}: ${failed ? 'search unavailable' : 'no verified options'}`] : []));
  const candidates = Object.fromEntries(attempts.flatMap((result) => result.candidates || [])
    .map((candidate) => [candidate.result_id, candidate]));
  const state = Object.keys(candidates).length ? (gaps.length ? 'partial' : 'complete')
    : attempts.every(({ failed }) => failed) ? 'failed' : 'empty';
  return { research: { ...waiting, state, gaps }, candidates };
}
