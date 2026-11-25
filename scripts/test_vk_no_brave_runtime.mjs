#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchIntakeLodgingPlaces } from '../src/vacation/intake-lodging-search.mjs';
import { searchPlaces } from '../src/vacation/place-search.mjs';
import { clearPoiCache, probePlaceSearchKeys, searchPois } from '../src/vacation/poi-search.mjs';
import { gatherDossierWithEscalation, gatherThingEvidence, topUpDossierFields } from '../src/vacation/thing-evidence-dossier.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';

installNoopNominatimStore();

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
const BRAVE_DOMAIN = ['brave', 'com'].join('.');
const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');
const TAVILY_HOST = ['api', 'tavily', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const VK_WAKE_URL = 'https://vk-search.test/wake';

function walkJs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(abs, out);
    else if (/\.(?:mjs|js|cjs)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

const runtimeModules = [
  ...walkJs(path.join(repoRoot, 'src')),
  ...walkJs(path.join(repoRoot, 'routes')),
];
assert.ok(runtimeModules.length > 0, 'expected runtime modules under src/ and routes/');
for (const file of runtimeModules) {
  const body = fs.readFileSync(file, 'utf8');
  assert.equal(
    body.includes(BRAVE_HOST),
    false,
    `runtime module must not reference ${BRAVE_HOST}: ${path.relative(repoRoot, file)}`,
  );
}

const recordedUrls = [];
function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

const fetchImpl = async (url, init = {}) => {
  const href = String(url);
  recordedUrls.push(href);
  const parsed = new URL(href);
  assert.equal(
    parsed.hostname === BRAVE_DOMAIN || parsed.hostname.endsWith(`.${BRAVE_DOMAIN}`),
    false,
    `forbidden request to Brave host: ${href}`,
  );
  if (href === VK_WAKE_URL) {
    const body = JSON.parse(String(init.body || '{}'));
    const title = String(body.place?.title || body.place?.name || '');
    if (title.includes('Pop Century')) {
      return jsonResponse({
        thingName: "Disney's Pop Century Resort",
        category: 'hotel',
        address: '1050 Century Dr, Lake Buena Vista, FL 32830',
        lat: 28.3505,
        lng: -81.5435,
        externalId: 'disneys-pop-century-resort-orlando',
        sources: [{
          url: 'https://disneyworld.disney.go.com/resorts/pop-century-resort/',
          title: "Disney's Pop Century Resort",
          fetchedAt: '2026-11-24T00:00:00Z',
          text: "Disney's Pop Century Resort is located at 1050 Century Dr, Lake Buena Vista, FL 32830.",
        }],
      });
    }
    return jsonResponse({ sources: [] });
  }
  if (parsed.hostname === NOMINATIM_HOST) {
    return jsonResponse([{
      lat: '28.5383',
      lon: '-81.3792',
      display_name: 'Orlando, Orange County, Florida, United States',
      address: { city: 'Orlando', county: 'Orange County', state: 'Florida', country_code: 'us' },
    }]);
  }
  if (parsed.hostname === OVERPASS_HOST) {
    return jsonResponse({
      elements: [{
        type: 'node',
        id: 7701,
        lat: 28.5401,
        lon: -81.3802,
        tags: { name: 'Foxtail Coffee Co.', amenity: 'cafe', 'addr:street': 'Orange Ave' },
      }],
    });
  }
  if (parsed.hostname === OPENROUTER_HOST) {
    return jsonResponse({ answers: { relevance: { type: 'score', score: 3.8 } } });
  }
  if (parsed.hostname === TAVILY_HOST) {
    return jsonResponse({
      results: [{
        title: "Disney's Pop Century Resort Reviews",
        url: 'https://www.tripadvisor.com/Hotel_Review-pop-century',
        content: "Guests praise Disney's Pop Century Resort for Skyliner access and clean pools.",
      }],
    });
  }
  if (parsed.hostname === 'www.tripadvisor.com') {
    return {
      ok: true,
      status: 200,
      headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'text/plain' : null) },
      body: {
        getReader() {
          let sent = false;
          const bytes = Buffer.from("Disney's Pop Century Resort is a Walt Disney World value resort with Skyliner access and great family pools.");
          return {
            async read() {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: bytes };
            },
            async cancel() {},
          };
        },
      },
    };
  }
  throw new Error(`unexpected fetch URL: ${href}`);
};

const envNoBraveKey = {
  OPENROUTER_API_KEY: 'offline-router-key',
  TAVILI_API_KEY: 'offline-tavily-key',
  VK_SEARCH_WAKE_URL: VK_WAKE_URL,
  DATABASE_URL: '',
};

const lodging = await searchIntakeLodgingPlaces({
  destination: 'Orlando, FL',
  areaHint: 'Orlando, FL',
  propertyName: "Disney's Pop Century Resort",
  env: envNoBraveKey,
  fetchImpl,
});
assert.equal(lodging.places.length, 1, 'chat hotel lookup must resolve via VK Search without Brave');
assert.equal(lodging.places[0].source, 'vk-search');
assert.equal(lodging.places[0].title, "Disney's Pop Century Resort");

const chatSearch = await searchPlaces({
  destination: 'Orlando, FL',
  queries: [{
    category: 'restaurant',
    q: 'coffee near Orlando',
    limit: 5,
    place: true,
    target: 'coffee',
    targetKind: 'category',
  }],
  relevanceTarget: 'coffee',
  relevanceArea: 'Orlando, FL',
  env: envNoBraveKey,
  fetchImpl,
});
assert.ok(chatSearch.places.length >= 1, 'chat place search must return results from OSM without Brave');
assert.equal(chatSearch.places.some((p) => p.source === 'osm'), true);

clearPoiCache();
const poiResult = await searchPois({
  origin: { lat: 28.5383, lng: -81.3792 },
  category: 'restaurant',
  fsqRecords: [],
  braveKey: 'legacy-key-must-be-ignored',
  fetchImpl,
});
assert.equal(poiResult.brave, false);
assert.ok(poiResult.pois.length >= 1, 'nearby POI search must return OSM results without Brave');

const resolvePublic = async () => [{ address: '93.184.216.34' }];
const thinDossier = await gatherThingEvidence(
  { title: 'Pop Century Test Cafe', category: 'restaurant' },
  {
    destination: 'Orlando, FL',
    env: envNoBraveKey,
    fetchImpl,
    resolveImpl: resolvePublic,
    vkSearchImpl: async () => ({ sources: [], voicePass: { claimSupportOk: false } }),
  },
);
assert.ok(thinDossier.pages.length >= 1, 'thin VK Search dossier fallback must gather via non-Brave web path');
assert.equal(thinDossier.attempts.some((row) => /brave/i.test(String(row.provider || row.kind || ''))), false);

const emptyDossier = await gatherDossierWithEscalation(
  { title: 'Empty Bot Venue', category: 'restaurant' },
  async () => ({ thing: 'Empty Bot Venue', pages: [], attempts: [{ provider: 'vk-search', status: 'empty' }] }),
  { destination: 'Orlando, FL', env: envNoBraveKey, fetchImpl, resolveImpl: resolvePublic },
);
assert.ok(emptyDossier.pages.length >= 1, 'empty dossier escalation must use non-Brave web path');

const toppedUp = await topUpDossierFields(
  { thing: 'Empty Bot Venue', pages: [], attempts: [] },
  { title: 'Empty Bot Venue', category: 'restaurant' },
  { destination: 'Orlando, FL', env: envNoBraveKey, fetchImpl, resolveImpl: resolvePublic, onlyFields: ['reviews'] },
);
assert.ok(toppedUp.pages.length >= 1, 'dossier top-up must use non-Brave web path');

const probe = await probePlaceSearchKeys(envNoBraveKey, fetchImpl);
assert.equal(probe.ok, true);
assert.equal(probe.statusCode, 200);
assert.equal(probe.body.providers.some((p) => p.provider === 'brave'), false);
assert.equal(probe.body.providers.some((p) => p.provider === 'tavily' && p.resultCount >= 1), true);

assert.ok(recordedUrls.length >= 5, 'expected multiple live stubbed fetches');
assert.deepEqual(
  recordedUrls.filter((href) => href.toLowerCase().includes(BRAVE_DOMAIN)),
  [],
  'zero requests may go to any brave.com host',
);

console.log(JSON.stringify({
  ok: true,
  checked: 'vk-no-brave-runtime',
  recordedFetches: recordedUrls.length,
  runtimeModulesScanned: runtimeModules.length,
}));
