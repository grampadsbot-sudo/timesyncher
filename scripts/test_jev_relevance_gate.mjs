import assert from 'node:assert/strict';
import { JEV_RELEVANCE_MINIMUM, jevRelevanceMinimum } from '../src/vacation/keepsake-list-minimums.mjs';
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
const VK_SEARCH_WAKE_URL = 'https://vk-search.example/wake';
const searchEnv = {
  VK_SEARCH_WAKE_URL,
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
    env: { VK_SEARCH_WAKE_URL },
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
  'vk-search.example',
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
    if (value === VK_SEARCH_WAKE_URL) {
      return jsonResponse({
        results: [
          { id: 'low-cafe', title: 'Low Cafe', url: 'https://example.test/low-cafe', address: '10 Rua Low, Lisbon', coordinates: [38.72, -9.14], categories: [{ name: 'Cafe' }] },
          { id: 'high-cafe', title: 'High Cafe', url: 'https://example.test/high-cafe', address: '20 Rua High, Lisbon', coordinates: [38.73, -9.15], categories: [{ name: 'Cafe' }] },
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
  'nominatim.openstreetmap.org',
  'openrouter.ai',
  'overpass-api.de',
  'vk-search.example',
]);
assert.deepEqual(scored.things.map((thing) => thing.title), ['High Cafe']);
assert.equal(scored.things[0].metadata.jevScore, high);
assert.deepEqual(scored.things[0].metadata.sourceRef, { source: 'vk-search', id: 'high-cafe' });
assert.equal(scored.things.some((thing) => thing.title === 'Low Cafe'), false);
assert.equal(scored.search.places.some((place) => place.title === 'Low Cafe'), false);

assert.equal(jevRelevanceMinimum({ JEV_RELEVANCE_MINIMUM: '0' }), JEV_RELEVANCE_MINIMUM);
assert.equal(jevRelevanceMinimum({ JEV_RELEVANCE_MINIMUM: '-2' }), JEV_RELEVANCE_MINIMUM);
assert.equal(jevRelevanceMinimum({ JEV_RELEVANCE_MINIMUM: '4' }), 4);

console.log('jev relevance gate ok');
