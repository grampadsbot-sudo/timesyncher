import assert from 'node:assert/strict';
import { JEV_RELEVANCE_MINIMUM } from '../src/vacation/keepsake-list-minimums.mjs';
import { PlaceSearchError, fillTripIntake } from '../src/vacation/place-search.mjs';
import { runPublicResearch } from './vacation-public-research-worker.mjs';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const low = JEV_RELEVANCE_MINIMUM - 1;
const high = JEV_RELEVANCE_MINIMUM;
const searchEnv = {
  brave: 'brave-test-key',
  foursquare: 'fsq-test-key',
  braveName: 'BRAVE_SEARCH_API_KEY',
  foursquareName: 'FOURSQUARE_SERVICE_KEY',
};

let fetched = false;
await assert.rejects(
  () => fillTripIntake({
    destination: 'Lisbon',
    wantedThings: [{ name: 'restaurant', kind: 'restaurant' }],
    env: searchEnv,
    priorPlaces: [],
    fetchImpl: async () => {
      fetched = true;
      throw new Error('missing key must not fetch');
    },
  }),
  (error) => error instanceof PlaceSearchError && error.code === 'missing_key' && /OPENROUTER_API_KEY/.test(error.message),
);
assert.equal(fetched, false);

await assert.rejects(
  () => runPublicResearch({
    wantedThings: [{ name: 'restaurant', kind: 'restaurant' }],
    artifacts: { destination: 'Lisbon', requestText: 'a restaurant in Lisbon' },
    env: { BRAVE_SEARCH_API_KEY: 'brave-test-key', FOURSQUARE_SERVICE_KEY: 'fsq-test-key' },
    priorPlaces: [],
    fetchImpl: async () => {
      fetched = true;
      throw new Error('worker missing key must not fetch');
    },
  }),
  (error) => error instanceof PlaceSearchError && error.code === 'missing_key' && /OPENROUTER_API_KEY/.test(error.message),
);
assert.equal(fetched, false);

const scored = await fillTripIntake({
  destination: 'Lisbon',
  wantedThings: [{ name: 'restaurant', kind: 'restaurant' }],
  env: { ...searchEnv, OPENROUTER_API_KEY: 'test-openrouter-key' },
  priorPlaces: [],
  fetchImpl: async (url, options) => {
    const value = String(url);
    if (value.includes('nominatim.openstreetmap.org')) {
      return jsonResponse([{ lat: '38.7223', lon: '-9.1393', display_name: 'Lisbon' }]);
    }
    if (value.includes('places-api.foursquare.com')) {
      return jsonResponse({
        results: [
          { fsq_place_id: 'low-cafe', name: 'Low Cafe', latitude: 38.72, longitude: -9.14, categories: [{ name: 'Cafe' }] },
          { fsq_place_id: 'high-cafe', name: 'High Cafe', latitude: 38.73, longitude: -9.15, categories: [{ name: 'Cafe' }] },
        ],
      });
    }
    if (value.includes('overpass-api.de')) return jsonResponse({ elements: [] });
    if (value.includes('api.search.brave.com')) return jsonResponse({ results: [] });
    if (value.includes('openrouter.ai')) {
      const payload = JSON.parse(options.body);
      const choice = payload?.state?.name === 'High Cafe' ? high : low;
      return jsonResponse({ answers: { relevance: { choice } } });
    }
    throw new Error(`unexpected jev gate request ${value}`);
  },
});

assert.deepEqual(scored.things.map((thing) => thing.title), ['High Cafe']);
assert.equal(scored.things[0].metadata.jevScore, high);
assert.deepEqual(scored.things[0].metadata.sourceRef, { source: 'foursquare_os', id: 'high-cafe' });
assert.equal(scored.things.some((thing) => thing.title === 'Low Cafe'), false);
assert.equal(scored.search.places.some((place) => place.title === 'Low Cafe'), false);

console.log('jev relevance gate ok');
