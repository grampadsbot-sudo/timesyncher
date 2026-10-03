import assert from 'node:assert/strict';
import fs from 'node:fs';
import { insertTripThing } from '../src/vacation/trip-things.mjs';
import { DEFAULT_FIRST_PASS_MINIMUMS, runPublicResearch } from './vacation-public-research-worker.mjs';
import {
  PlaceSearchError,
  destinationFromChat,
  fillTripIntake,
  lodgingFromChat,
  placeToTripThing,
  mergePlaces,
  queriesFromWantedThings,
  readPriorPlaces,
  searchPlaces,
  selectPriorPlaces,
} from '../src/vacation/place-search.mjs';
const ENV = {
  BRAVE_SEARCH_API_KEY: 'brave-test-key',
};
const ALLOWED_HOSTS = new Set([
  'overpass-api.de',
  'api.search.brave.com',
  'openrouter.ai',
  'nominatim.openstreetmap.org',
  'api.tavily.com',
]);

function placeEnv(env = ENV) {
  return {
    brave: env.BRAVE_SEARCH_API_KEY || env.brave || '',
    braveName: 'BRAVE_SEARCH_API_KEY',
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || 'test-openrouter-key',
  };
}

function recordHost(url, hosts) {
  const hostname = new URL(String(url)).hostname;
  hosts.push(hostname);
  if (!ALLOWED_HOSTS.has(hostname)) throw new Error(`unexpected host ${hostname}`);
  return hostname;
}
const CENTER = { lat: 38.7223, lng: -9.1393 };
const PLACE_WANTED = [
  { name: 'Louise Cafe', kind: 'restaurant' },
  { name: 'Paper Shop', kind: 'store' },
  { name: 'River Walk', kind: 'activity' },
];
const POKE_WANTED = [
  { name: 'Poke Harbor', kind: 'activity' },
  { name: 'North Market', kind: 'store' },
  { name: 'River Lantern', kind: 'restaurant' },
];

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function callKind(url) {
  const value = String(url);
  if (value.includes('nominatim.openstreetmap.org')) return 'nominatim';
  if (value.includes('overpass-api.de')) return 'osm';
  if (value.includes('api.search.brave.com/res/v1/local/place_search')) return 'brave';
  if (value.includes('api.tavily.com')) return 'tavily';
  if (value.includes('googleapis.com') || value.includes('places.google')) return 'google';
  return value;
}

function lisbonRoutes(url) {
  const value = String(url);
  if (value.includes('nominatim.openstreetmap.org')) {
    return jsonResponse([{ lat: '38.7223', lon: '-9.1393', display_name: 'Lisbon, Portugal' }]);
  }
  if (value.includes('overpass-api.de')) {
    return jsonResponse({
      elements: [
        { type: 'node', id: 11, lat: 38.7225, lon: -9.1395, tags: { name: 'Harbor Cafe', amenity: 'restaurant' } },
        { type: 'node', id: 22, lat: 38.74, lon: -9.15, tags: { name: 'City Museum', tourism: 'museum', 'addr:street': 'Museum Road' } },
      ],
    });
  }
  if (value.includes('api.search.brave.com/res/v1/local/place_search')) {
    const q = new URL(value).searchParams.get('q') || '';
    if (q === 'Paper Shop' || q === 'Paper Shop, Lisbon') {
      return jsonResponse({
        results: [{
          title: 'Paper Shop',
          url: 'https://example.test/paper',
          coordinates: [38.71, -9.15],
        }],
      });
    }
    if (q === 'River Walk' || q === 'River Walk, Lisbon') {
      return jsonResponse({
        results: [{
          title: 'River Walk | Listing',
          url: 'https://example.test/walk',
          coordinates: [38.75, -9.16],
          postal_address: { streetAddress: 'River Road', addressLocality: 'Lisbon' },
        }],
      });
    }
    if (q === 'Louise Cafe' || q === 'Louise Cafe, Lisbon') return jsonResponse({ results: [] });
    return jsonResponse({ results: [] });
  }
  throw new Error(`unexpected place search request ${value}`);
}

function jevOk(choice = 5) {
  return jsonResponse({ answers: { relevance: { choice } } });
}

function isOpenRouter(url) {
  return String(url).includes('openrouter.ai');
}

function recordingFetch(routes, events) {
  const calls = [];
  const hosts = [];
  const fetchImpl = async (url, options) => {
    const hostname = recordHost(url, hosts);
    calls.push({ url: String(url), options, hostname });
    if (isOpenRouter(url)) return jevOk(5);
    events?.push(callKind(url));
    return routes(url, options);
  };
  return { fetchImpl, calls, hosts };
}

const merged = mergePlaces([
  [{ title: 'Harbor Cafe', source: 'prior_db', category: 'restaurant', lat: 38.7223, lng: -9.1393 }],
  [{ title: 'City Museum', source: 'osm', category: 'activity', lat: 38.74, lng: -9.15 }],
  [{ title: 'North Market', source: 'brave', category: 'store', lat: 10, lng: 10 }],
  [{ title: 'North Market', source: 'osm', category: 'store', lat: 11, lng: 11 }],
]);
assert.deepEqual(merged.map((place) => [place.title, place.source]), [
  ['Harbor Cafe', 'prior_db'],
  ['City Museum', 'osm'],
  ['North Market', 'brave'],
  ['North Market', 'osm'],
]);

const events = [];
const prior = [{
  title: 'Harbor Cafe',
  source: 'brave',
  category: 'restaurant',
  lat: 38.7224,
  lng: -9.1394,
  address: '1 Dock',
}];
const recorded = recordingFetch(lisbonRoutes, events);
const found = await searchPlaces({
  destination: 'Lisbon',
  wantedThings: PLACE_WANTED,
  env: placeEnv(),
  fetchImpl: recorded.fetchImpl,
  loadPriorPlaces: async () => {
    events.push('prior_db');
    return prior;
  },
});
assert.deepEqual(events, [
  'nominatim',
  'prior_db',
  'osm',
  'brave',
  'brave',
  'brave',
]);
assert.deepEqual([...new Set(recorded.hosts)].sort(), [
  'api.search.brave.com',
  'nominatim.openstreetmap.org',
  'openrouter.ai',
  'overpass-api.de',
]);
assert.deepEqual(found.places.map((place) => [place.title, place.source]), [
  ['Harbor Cafe', 'osm'],
  ['City Museum', 'osm'],
  ['Paper Shop', 'brave'],
  ['River Walk', 'brave'],
]);
assert.equal(found.places.some((place) => /google/i.test(place.source)), false);
assert.equal(recorded.calls.some((call) => callKind(call.url) === 'google'), false);
const braveCall = recorded.calls.find((call) => callKind(call.url) === 'brave');
assert.equal(braveCall.options.headers['X-Subscription-Token'], 'brave-test-key');
assert.equal(braveCall.url.includes('brave-test-key'), false);
assert.equal(found.sourceCounts.prior_db, 0);
assert.equal(found.sourceCounts.osm, 2);
assert.equal(found.sourceCounts.brave, 2);
const river = found.places.find((place) => place.title === 'River Walk');
assert.equal(river.address, 'River Road, Lisbon');
const museum = found.places.find((place) => place.title === 'City Museum');
assert.equal(museum.categoryName, 'Museum');

const blockedFetch = async () => {
  throw new Error('fetch should not run');
};
await assert.rejects(
  () => searchPlaces({
    destination: 'Lisbon',
    wantedThings: PLACE_WANTED,
    env: placeEnv({}),
    fetchImpl: blockedFetch,
  }),
  (error) => {
    assert.equal(error instanceof PlaceSearchError, true);
    assert.equal(error.code, 'missing_key');
    assert.match(error.message, /BRAVE_SEARCH_API_KEY/);
    return true;
  },
);
const emptyLive = recordingFetch((url) => {
  if (String(url).includes('nominatim')) return jsonResponse([{ lat: '38.7223', lon: '-9.1393' }]);
  if (String(url).includes('overpass')) return jsonResponse({ elements: [] });
  return jsonResponse({ results: [] });
});
await assert.rejects(
  () => searchPlaces({
    destination: 'Lisbon',
    wantedThings: PLACE_WANTED,
    env: placeEnv(),
    fetchImpl: emptyLive.fetchImpl,
    priorPlaces: prior,
  }),
  (error) => {
    assert.equal(error.code, 'prior_db_sole_source');
    assert.match(error.message, /not a sole source/);
    return true;
  },
);
const allEmpty = await searchPlaces({
  destination: 'Lisbon',
  wantedThings: PLACE_WANTED,
  env: placeEnv(),
  fetchImpl: emptyLive.fetchImpl,
  priorPlaces: [],
});
assert.equal(allEmpty.outcomeStatus, 'no_results');
assert.equal(allEmpty.places.length, 0);
assert.ok(Array.isArray(allEmpty.providers));
assert.ok(allEmpty.providers.filter((row) => ['prior_db', 'osm', 'brave'].includes(String(row.provider || ''))).every((row) => row.status === 'empty' || row.status === 'skipped'));

const geocodeCalls = [];
await assert.rejects(
  () => searchPlaces({
    destination: 'Nowhereville',
    wantedThings: PLACE_WANTED,
    env: placeEnv(),
    priorPlaces: [],
    fetchImpl: async (url) => {
      recordHost(url, geocodeCalls);
      const value = String(url);
      return value.includes('openrouter.ai') ? jevOk(5) : jsonResponse(value.includes('api.search.brave.com') ? { results: [] } : []);
    },
  }),
  (error) => {
    assert.equal(error.code, 'geocode_failed');
    assert.match(error.message, /Nowhereville/);
    return true;
  },
);
assert.ok(geocodeCalls.includes('nominatim.openstreetmap.org'));
assert.equal(geocodeCalls.includes('api.search.brave.com'), false);
const fill = await fillTripIntake({
  destination: 'Lisbon',
  wantedThings: PLACE_WANTED,
  env: placeEnv(),
  fetchImpl: recordingFetch(lisbonRoutes).fetchImpl,
  loadPriorPlaces: async () => prior,
});
assert.deepEqual(fill.things.map((thing) => thing.source), [
  'osm',
  'osm',
  'brave',
  'brave',
]);
assert.equal(fill.things[0].metadata.source, 'osm');
assert.equal(fill.researchedThings[1].source, 'osm');
assert.equal(fill.researchedThings[1].lat, 38.74);
assert.equal(fill.researchedThings[1].title, 'City Museum');

const keptPrior = selectPriorPlaces([
  { id: 'near', title: 'Harbor Cafe', category: 'restaurant', source: 'brave', location: { lat: 38.7224, lng: -9.1394, address: '1 Dock' } },
  { id: 'far', title: 'Far Market', category: 'store', location: { lat: 41.15, lng: -8.61 } },
  { id: 'note', title: 'Planning brief', category: 'note', location: { lat: 38.7223, lng: -9.1393 } },
], CENTER);
assert.deepEqual(keptPrior.map((place) => [place.title, place.source]), [['Harbor Cafe', 'prior_db']]);

const noDb = await readPriorPlaces(CENTER, { env: {} });
assert.deepEqual(noDb, []);
const fromQuery = await readPriorPlaces(CENTER, {
  query: async () => [
    { id: 'near', title: 'Harbor Cafe', category: 'restaurant', location: { lat: 38.7224, lng: -9.1394 } },
    { id: 'far', title: 'Far Market', category: 'store', location: { lat: 41.15, lng: -8.61 } },
  ],
});
assert.deepEqual(fromQuery.map((place) => place.title), ['Harbor Cafe']);
const inserts = [];
const db = async (strings, ...values) => { inserts.push({ sql: strings.join(' '), values }); return [{ id: 'trip-thing-1' }]; };
const written = await insertTripThing(db, {
  tripId: 'trip-1',
  requestId: 'request-1',
  thing: fill.things.find((thing) => thing.title === 'City Museum'),
});
assert.equal(written.source, 'osm');
const museumInsert = inserts.find((row) => /insert into trip_things/i.test(row.sql));
assert.ok(museumInsert);
assert.match(museumInsert.sql, /\bsource\b/);
assert.equal(museumInsert.values.at(-1), 'osm');
assert.equal(museumInsert.values.includes('City Museum'), true);
const note = await insertTripThing(db, {
  tripId: 'trip-1',
  requestId: 'request-1',
  thing: { title: 'Planning brief', category: 'note', metadata: { source: 'product-gbrain-dispatch' } },
});
assert.equal(note.source, null);
const noteInsert = inserts.filter((row) => /insert into trip_things/i.test(row.sql)).at(-1);
assert.equal(noteInsert.values.at(-1), null);

assert.equal(destinationFromChat('Plan a trip to Lisbon next April'), 'Lisbon');
assert.equal(destinationFromChat('Create a new 4-night staycation on the Las Vegas Strip ending Monday morning'), 'Las Vegas Strip');
assert.equal(destinationFromChat('Is there a Vegas vacation?'), 'Vegas');
assert.equal(destinationFromChat('What should I do now?'), '');
assert.equal(destinationFromChat('vacation in maui for three nights'), 'maui');
assert.deepEqual(lodgingFromChat('staying at the Jockey Club in Lisbon'), {
  text: 'Jockey Club in Lisbon',
  lat: null,
  lng: null,
});
assert.equal(lodgingFromChat('', { lat: 36.11, lng: -115.17 }).lat, 36.11);

const intentQueries = queriesFromWantedThings(POKE_WANTED);
assert.deepEqual(intentQueries.map((query) => [query.category, query.q, query.limit]), [
  ['activity', 'Poke Harbor', DEFAULT_FIRST_PASS_MINIMUMS.rest],
  ['store', 'North Market', DEFAULT_FIRST_PASS_MINIMUMS.store],
  ['restaurant', 'River Lantern', DEFAULT_FIRST_PASS_MINIMUMS.restaurant],
]);
assert.deepEqual(DEFAULT_FIRST_PASS_MINIMUMS, { restaurant: 15, store: 10, rest: 15 });
assert.equal(intentQueries.some((query) => /huggo|bellagio|kona brewing|catch las vegas|speedishuttle/i.test(query.q)), false);
assert.deepEqual(queriesFromWantedThings([]), []);
assert.deepEqual(queriesFromWantedThings([{ name: '', kind: 'restaurant' }]), []);
const placeSource = fs.readFileSync(new URL('../src/vacation/place-search.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(placeSource, /SEARCH_TARGETS|DEFAULT_QUERIES|wantedSearchQueries/);
assert.doesNotMatch(placeSource, /DEFAULT_FIRST_PASS_MINIMUMS/);
assert.match(placeSource, /firstPassSearchLimit/);
assert.match(placeSource, /queriesFromWantedThings/);
assert.doesNotMatch(placeSource, /intakeThingHasProperName/);
assert.match(placeSource, /searchTavily/);

const lodgingEvents = [];
const lodgingHosts = [];
const lodgingSearch = await searchPlaces({
  destination: 'Lisbon',
  lodging: 'Jockey Club',
  wantedThings: POKE_WANTED,
  env: placeEnv(),
  priorPlaces: [],
  fetchImpl: async (url) => {
    const value = String(url);
    recordHost(url, lodgingHosts);
    if (isOpenRouter(value)) return jevOk(5);
    lodgingEvents.push(callKind(value));
    if (value.includes('nominatim') && value.includes('Jockey')) {
      return jsonResponse([{ lat: '36.1100', lon: '-115.1700', display_name: 'Jockey Club' }]);
    }
    if (value.includes('nominatim')) throw new Error(`destination geocode ran before lodging: ${value}`);
    if (value.includes('overpass-api.de')) return jsonResponse({ elements: [] });
    if (value.includes('api.search.brave.com')) {
      const query = new URL(value).searchParams.get('q');
      return jsonResponse({
        results: [{ title: `Brave ${query}`, coordinates: [36.112, -115.172] }],
      });
    }
    throw new Error(`unexpected lodging search ${value}`);
  },
});
assert.equal(lodgingEvents[0], 'nominatim');
assert.equal(lodgingEvents.filter((kind) => kind === 'nominatim').length, 1);
assert.equal(lodgingEvents.includes('brave'), true);
assert.equal(lodgingSearch.center.geocoded, 'lodging');
assert.deepEqual(lodgingSearch.queries.map((query) => query.q), ['Poke Harbor', 'North Market', 'River Lantern']);
assert.equal(
  lodgingSearch.places.some((place) => place.title === 'Brave Poke Harbor, Jockey Club' && place.source === 'brave'),
  true,
);
assert.equal(lodgingSearch.places.length < DEFAULT_FIRST_PASS_MINIMUMS.restaurant, true);
assert.equal(lodgingSearch.places.some((place) => /huggo|bellagio|catch las vegas/i.test(place.title)), false);
assert.deepEqual([...new Set(lodgingHosts)].sort(), [
  'api.search.brave.com',
  'nominatim.openstreetmap.org',
  'openrouter.ai',
  'overpass-api.de',
]);

const braveCalls = [];
const emptyHosts = [];
const emptyLiveSearch = await searchPlaces({
  destination: 'Lisbon',
  wantedThings: PLACE_WANTED,
  env: placeEnv(),
  priorPlaces: [],
  fetchImpl: async (url) => {
    const value = String(url);
    recordHost(url, emptyHosts);
    if (isOpenRouter(value)) return jevOk(5);
    braveCalls.push(`${callKind(value)}:${new URL(value).searchParams.get('q') || ''}`);
    if (value.includes('nominatim')) return jsonResponse([{ lat: '38.7223', lon: '-9.1393', display_name: 'Lisbon' }]);
    if (value.includes('overpass-api.de')) return jsonResponse({ elements: [] });
    if (value.includes('api.search.brave.com')) return jsonResponse({ results: [] });
    throw new Error(`unexpected search ${value}`);
  },
});
assert.equal(emptyLiveSearch.outcomeStatus, 'no_results');
assert.equal(emptyLiveSearch.places.length, 0);
assert.equal(braveCalls.filter((entry) => entry.startsWith('brave:')).length, 3);
assert.deepEqual(braveCalls.filter((entry) => entry.startsWith('brave:')), [
  'brave:Louise Cafe, Lisbon',
  'brave:Paper Shop, Lisbon',
  'brave:River Walk, Lisbon',
]);
assert.deepEqual([...new Set(emptyHosts)].sort(), [
  'api.search.brave.com',
  'nominatim.openstreetmap.org',
  'overpass-api.de',
]);

const fallbackEvents = [];
const fallbackHosts = [];
const lodgingMiss = await searchPlaces({
  destination: 'Lisbon',
  lodging: 'Missing House',
  wantedThings: PLACE_WANTED,
  env: placeEnv(),
  priorPlaces: [],
  fetchImpl: async (url) => {
    const value = String(url);
    recordHost(url, fallbackHosts);
    if (isOpenRouter(value)) return jevOk(5);
    if (value.includes('nominatim')) {
      fallbackEvents.push(decodeURIComponent(value));
      if (value.includes('Missing')) return jsonResponse([]);
      return jsonResponse([{ lat: '38.7223', lon: '-9.1393', display_name: 'Lisbon' }]);
    }
    if (value.includes('api.search.brave.com') && value.includes('q=Louise')) {
      return jsonResponse({
        results: [{
          id: 'brave-lisbon',
          title: 'Lisbon Cafe',
          coordinates: [38.7225, -9.1395],
          category: 'Café',
        }],
      });
    }
    if (value.includes('api.search.brave.com')) return jsonResponse({ results: [] });
    if (value.includes('overpass-api.de')) return jsonResponse({ elements: [] });
    throw new Error(`unexpected lodging miss ${value}`);
  },
});
assert.deepEqual([...new Set(fallbackHosts)].sort(), [
  'api.search.brave.com',
  'nominatim.openstreetmap.org',
  'openrouter.ai',
  'overpass-api.de',
]);
assert.match(fallbackEvents[0], /Missing House/);
assert.match(fallbackEvents[1], /Lisbon/);
assert.equal(lodgingMiss.center.geocoded, 'destination');
assert.equal(lodgingMiss.places[0].title, 'Lisbon Cafe');
assert.equal(lodgingMiss.places[0].externalId, 'brave-lisbon');
assert.equal(lodgingMiss.places[0].categoryName, 'Café');
assert.equal(lodgingMiss.places[0].jevScore, 5);
const savedCafe = placeToTripThing({
  ...lodgingMiss.places[0],
  rating: 4.4,
  ratingCount: 12,
});
assert.deepEqual(savedCafe.metadata.sourceRef, { source: 'brave', id: 'brave-lisbon' });
assert.equal(savedCafe.ratings.source, 'brave');
assert.equal(savedCafe.ratings.rating, '4.4');
assert.equal(savedCafe.ratings.count, 12);
assert.equal(savedCafe.ratings.googleRating, undefined);
assert.equal(savedCafe.metadata.jevScore, 5);
assert.equal(savedCafe.metadata.categoryName, 'Café');
assert.equal(savedCafe.metadata.sourceRecord.categoryName, 'Café');

const workerEvents = [];
const workerFetch = recordingFetch(lisbonRoutes, workerEvents);
const research = await runPublicResearch({
  wantedThings: PLACE_WANTED,
  artifacts: { destination: 'Lisbon', requestText: 'vacation in Lisbon' },
  env: placeEnv(),
  priorPlaces: [],
  fetchImpl: workerFetch.fetchImpl,
});
assert.equal(research.status, 'live_place_search');
assert.equal(research.provider, 'place-search');
assert.deepEqual(workerEvents, [
  'nominatim',
  'osm',
  'brave',
  'brave',
  'brave',
]);
assert.equal(research.things.some((thing) => thing.source === 'brave' && thing.title === 'River Walk'), true);
assert.equal(research.things.some((thing) => thing.source === 'osm'), true);
assert.deepEqual([...new Set(workerFetch.hosts)].sort(), [
  'api.search.brave.com',
  'nominatim.openstreetmap.org',
  'openrouter.ai',
  'overpass-api.de',
]);
assert.equal(workerFetch.calls.some((call) => /googleapis|places\.google/.test(call.url)), false);
const braveQuery = decodeURIComponent(workerFetch.calls.find((call) => call.url.includes('place_search')).url);
assert.match(braveQuery, /q=Louise(\+|%20)Cafe/);
assert.doesNotMatch(braveQuery, /near /);

await assert.rejects(
  () => runPublicResearch({
    wantedThings: PLACE_WANTED,
    artifacts: { destination: 'Lisbon', requestText: 'restaurants in Lisbon' },
    env: {},
    priorPlaces: [],
    fetchImpl: async () => {
      throw new Error('missing keys must not fetch');
    },
  }),
  (error) => error instanceof PlaceSearchError && error.code === 'missing_key',
);

const quiet = await searchPlaces({
  destination: 'Lisbon',
  env: {},
  fetchImpl: async () => {
    throw new Error('empty wanted things must not fetch');
  },
});
assert.deepEqual(quiet.places, []);
assert.deepEqual(quiet.notes, []);
const quietResearch = await runPublicResearch({
  artifacts: { destination: 'Lisbon' },
  env: {},
  fetchImpl: async () => {
    throw new Error('no wanted things must not fetch');
  },
});
assert.equal(quietResearch.status, 'no_wanted_things');
assert.deepEqual(quietResearch.things, []);

const tavilyCalls = [];
const flightHosts = [];
const flightSearch = await searchPlaces({
  wantedThings: [{ name: 'morning flight', kind: 'flight' }],
  env: { ...placeEnv(), TAVILI_API_KEY: 'tavily-test-key', tavilyName: 'TAVILI_API_KEY' },
  fetchImpl: async (url, options) => {
    recordHost(url, flightHosts);
    if (isOpenRouter(url)) return jevOk(5);
    tavilyCalls.push(String(url));
    assert.equal(String(url), 'https://api.tavily.com/search');
    const body = JSON.parse(options.body);
    assert.equal(body.query, 'morning flight');
    assert.equal(options.headers.authorization, 'Bearer tavily-test-key');
    return jsonResponse({
      results: [{
        title: 'Morning departure',
        url: 'https://example.test/flight',
        content: 'A published schedule.',
        score: 0.8,
      }],
    });
  },
});
assert.deepEqual(tavilyCalls, ['https://api.tavily.com/search']);
assert.deepEqual([...new Set(flightHosts)].sort(), ['api.tavily.com', 'openrouter.ai']);
assert.deepEqual(flightSearch.places, []);
assert.equal(flightSearch.notes[0].source, 'tavily');
assert.equal(flightSearch.notes[0].title, 'Morning departure');
const flightFillHosts = [];
const flightFill = await fillTripIntake({
  wantedThings: [{ name: 'morning flight', kind: 'flight' }],
  env: { ...placeEnv(), TAVILI_API_KEY: 'tavily-test-key', tavilyName: 'TAVILI_API_KEY' },
  fetchImpl: async (url) => {
    recordHost(url, flightFillHosts);
    if (isOpenRouter(url)) return jevOk(5);
    return jsonResponse({
      results: [{
        title: 'Morning departure',
        url: 'https://example.test/flight',
        content: 'A published schedule.',
        score: 0.8,
      }],
    });
  },
});
assert.deepEqual([...new Set(flightFillHosts)].sort(), ['api.tavily.com', 'openrouter.ai']);
assert.equal(flightFill.things[0].source, 'tavily');
assert.equal(flightFill.things[0].metadata.source, 'tavily');
await assert.rejects(
  () => searchPlaces({
    wantedThings: [{ name: 'rental car', kind: 'car' }],
    env: placeEnv(),
    fetchImpl: async () => {
      throw new Error('missing tavily key must not fetch');
    },
  }),
  (error) => {
    assert.equal(error instanceof PlaceSearchError, true);
    assert.equal(error.code, 'missing_key');
    assert.match(error.message, /TAVILI_API_KEY/);
    return true;
  },
);

console.log(JSON.stringify({ ok: true, checked: 'place-search', places: found.places.map((place) => place.source) }));
