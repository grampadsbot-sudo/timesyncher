import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyTripIntake, tripIntakeJobFields } from '../src/vacation/trip-intake-classify.mjs';
import { insertTripThing } from '../src/vacation/trip-things.mjs';
import { runPublicResearch } from './vacation-public-research-worker.mjs';

const routeSource = fs.readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('./vacation-public-research-worker.mjs', import.meta.url), 'utf8');
const dispatchSource = fs.readFileSync(new URL('./product-gbrain-dispatch.mjs', import.meta.url), 'utf8');
const runnerSource = fs.readFileSync(new URL('./travel-source-adapter-runner.mjs', import.meta.url), 'utf8');
const poiSource = fs.readFileSync(new URL('../src/vacation/poi-search.mjs', import.meta.url), 'utf8');

assert.match(routeSource, /classifyTripIntake/);
assert.match(routeSource, /const queuedJobType = 'trip_intake'/);
assert.match(routeSource, /insert into worker_jobs \(request_id, trip_id, job_type, input\)/);
assert.match(routeSource, /wantedThings: jobFields\.wantedThings/);
assert.match(routeSource, /intakeEvent: jobFields\.intakeEvent/);
assert.match(workerSource, /jobInput\.wantedThings/);
assert.match(dispatchSource, /jobInput\.wantedThings/);
assert.doesNotMatch(dispatchSource, /lodgingLane: lane/);
assert.doesNotMatch(workerSource, /runGrokResearch|TIMESYNCHER_GROK_BIN|TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE|Perplexity|perplexity/);
assert.doesNotMatch(runnerSource, /TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE|function fixtureRecentTravelerSentiment/);
assert.doesNotMatch(poiSource, /\bGENERIC_NAME\b|\bAIRLINES\b|function flightPlan/);
assert.match(poiSource, /TAVILI_API_KEY is not set/);

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const requestText = 'Plan a week in Lisbon. We want a restaurant, a store, and a morning flight.';
const extracted = [
  { name: 'restaurant', kind: 'restaurant', who: '', when: '' },
  { name: 'store', kind: 'store', who: '', when: '' },
  { name: 'morning flight', kind: 'flight', who: '', when: 'morning' },
];
const classifyCalls = [];
const classification = await classifyTripIntake({
  text: requestText,
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl: async (url) => {
    classifyCalls.push(String(url));
    if (String(url).includes('/decisions')) {
      return jsonResponse({ answers: { trip_intake: { noul: 0.91 } } });
    }
    return jsonResponse({ choices: [{ message: { content: JSON.stringify({ things: extracted }) } }] });
  },
});
assert.equal(classification.ok, true);
assert.equal(classification.intake, true);
assert.deepEqual(classification.things.map((thing) => thing.name), ['restaurant', 'store', 'morning flight']);
assert.equal(classification.things.every((thing) => thing.source === 'chat_extraction'), true);
assert.equal(classifyCalls.length, 2);

const jobFields = tripIntakeJobFields({
  requestText,
  receivedAt: '2026-09-28T00:00:00.000Z',
  classification,
  firstIntake: true,
  jobKind: 'trip_intake',
});
assert.equal(jobFields.intakeEvent.kind, 'trip_intake');
assert.equal(jobFields.intakeEvent.requestText, requestText);
assert.deepEqual(jobFields.wantedThings.map((thing) => [thing.name, thing.kind, thing.source]), [
  ['restaurant', 'restaurant', 'chat_extraction'],
  ['store', 'store', 'chat_extraction'],
  ['morning flight', 'flight', 'chat_extraction'],
]);

const jobInput = {
  customerId: 'customer-1',
  tripId: 'trip-1',
  requestId: 'request-1',
  source: 'vacation-app',
  requestType: 'trip_intake',
  requestText,
  intakeEvent: jobFields.intakeEvent,
  wantedThings: jobFields.wantedThings,
  intakeError: jobFields.intakeError,
};
const searchCalls = [];
const research = await runPublicResearch({
  job: { job_type: 'trip_intake', input: jobInput },
  artifacts: { destination: 'Lisbon', requestText },
  env: {
    BRAVE_SEARCH_API_KEY: 'brave-test-key',
    TAVILI_API_KEY: 'tavily-test-key',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    foursquare: 'paid-places-key',
  },
  priorPlaces: [],
  fetchImpl: async (url, options) => {
    const value = String(url);
    searchCalls.push(value);
    if (value.includes('googleapis') || value.includes('places.google')) throw new Error(`google places ${value}`);
    if (value.includes('nominatim.openstreetmap.org')) {
      return jsonResponse([{ lat: '38.7223', lon: '-9.1393', display_name: 'Lisbon, Portugal' }]);
    }
    if (value.includes('overpass-api.de')) {
      return jsonResponse({
        elements: [
          { type: 'node', id: 22, lat: 38.74, lon: -9.15, tags: { name: 'City Museum', tourism: 'museum' } },
        ],
      });
    }
    if (value.includes('api.search.brave.com') && value.includes('q=restaurant')) {
      return jsonResponse({
        results: [{
          title: 'River Walk',
          url: 'https://example.test/walk',
          coordinates: [38.75, -9.16],
        }],
      });
    }
    if (value.includes('api.search.brave.com')) return jsonResponse({ results: [] });
    if (value.includes('openrouter.ai')) {
      return jsonResponse({ answers: { relevance: { choice: 5 } } });
    }
    if (value.includes('api.tavily.com/search')) {
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
    }
    throw new Error(`unexpected search ${value}`);
  },
});

assert.equal(research.status, 'live_place_search');
assert.equal(research.provider, 'place-search');
assert.equal(research.intakeEvent.kind, 'trip_intake');
assert.deepEqual(research.wantedThings.map((thing) => thing.name), ['restaurant', 'store', 'morning flight']);
assert.equal(searchCalls.some((url) => url.includes('nominatim')), true);
assert.equal(searchCalls.filter((url) => url.includes(['places-api', 'foursquare', 'com'].join('.'))).length, 0);
assert.equal(searchCalls.some((url) => url.includes('api.search.brave.com')), true);
assert.equal(searchCalls.some((url) => url.includes('api.tavily.com')), true);
assert.equal(searchCalls.some((url) => /googleapis|places\.google/.test(url)), false);
const sources = research.things.map((thing) => thing.source);
assert.equal(sources.includes('osm'), true);
assert.equal(sources.includes('brave'), true);
assert.equal(sources.includes('tavily'), true);
assert.equal(sources.includes(null), false);
assert.equal(research.things.every((thing) => thing.source), true);

const inserts = [];
const db = async (strings, ...values) => {
  inserts.push({ sql: strings.join(' '), values });
};
for (const thing of research.things) {
  const written = await insertTripThing(db, { tripId: 'trip-1', requestId: 'request-1', thing });
  assert.equal(written.source, thing.source);
  assert.notEqual(written.source, null);
}
assert.equal(inserts.length, research.things.length);
assert.equal(inserts.every((row) => /\bsource\b/.test(row.sql) && row.sql.includes('insert into trip_things')), true);
assert.deepEqual(inserts.map((row) => row.values.at(-1)), sources);

console.log(JSON.stringify({
  ok: true,
  checked: 'trip-intake-search',
  sources,
}));
