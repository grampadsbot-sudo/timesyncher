import assert from 'node:assert/strict';
import { JEV_RELEVANCE_MINIMUM } from '../src/vacation/keepsake-list-minimums.mjs';
import { PlaceSearchError, fillTripIntake } from '../src/vacation/place-search.mjs';
import { runPublicResearch } from './vacation-public-research-worker.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

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
  braveName: 'BRAVE_SEARCH_API_KEY',
};

let fetched = false;
await assert.rejects(
  () => fillTripIntake({
    destination: 'Lisbon',
    wantedThings: [{ name: 'River Lantern', kind: 'restaurant' }],
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
    wantedThings: [{ name: 'River Lantern', kind: 'restaurant' }],
    artifacts: { destination: 'Lisbon', requestText: 'a restaurant in Lisbon' },
    env: { BRAVE_SEARCH_API_KEY: 'brave-test-key' },
    priorPlaces: [],
    fetchImpl: async () => {
      fetched = true;
      throw new Error('worker missing key must not fetch');
    },
  }),
  (error) => error instanceof PlaceSearchError && error.code === 'missing_key' && /OPENROUTER_API_KEY/.test(error.message),
);
assert.equal(fetched, false);

const scoredHosts = [];
const allowedHosts = new Set([
  'overpass-api.de',
  'api.search.brave.com',
  'openrouter.ai',
  'nominatim.openstreetmap.org',
]);
const scored = await fillTripIntake({
  destination: 'Lisbon',
  wantedThings: [{ name: 'River Lantern', kind: 'restaurant' }],
  env: { ...searchEnv, OPENROUTER_API_KEY: 'test-openrouter-key' },
  priorPlaces: [],
  fetchImpl: async (url, options) => {
    const value = String(url);
    const hostname = new URL(value).hostname;
    scoredHosts.push(hostname);
    if (!allowedHosts.has(hostname)) throw new Error(`unexpected host ${hostname}`);
    if (value.includes('nominatim.openstreetmap.org')) {
      return jsonResponse([{ lat: '38.7223', lon: '-9.1393', display_name: 'Lisbon' }]);
    }
    if (value.includes('overpass-api.de')) return jsonResponse({ elements: [] });
    if (value.includes('api.search.brave.com')) {
      return jsonResponse({
        results: [
          { id: 'low-cafe', title: 'Low Cafe', coordinates: [38.72, -9.14], categories: [{ name: 'Cafe' }] },
          { id: 'high-cafe', title: 'High Cafe', coordinates: [38.73, -9.15], categories: [{ name: 'Cafe' }] },
        ],
      });
    }
    if (value.includes('openrouter.ai')) {
      const payload = JSON.parse(options.body);
      const choice = payload?.state?.name === 'High Cafe' ? high : low;
      return jsonResponse({ answers: { relevance: { choice } } });
    }
    throw new Error(`unexpected jev gate request ${value}`);
  },
});

assert.deepEqual([...new Set(scoredHosts)].sort(), [
  'api.search.brave.com',
  'nominatim.openstreetmap.org',
  'openrouter.ai',
  'overpass-api.de',
]);
assert.deepEqual(scored.things.map((thing) => thing.title), ['High Cafe']);
assert.equal(scored.things[0].metadata.jevScore, high);
assert.deepEqual(scored.things[0].metadata.sourceRef, { source: 'brave', id: 'high-cafe' });
assert.equal(scored.things.some((thing) => thing.title === 'Low Cafe'), false);
assert.equal(scored.search.places.some((place) => place.title === 'Low Cafe'), false);

console.log('jev relevance gate ok');
