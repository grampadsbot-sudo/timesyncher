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

const requestText = 'Plan a week in Orindell. We want River Lantern, North Market Hall, and Harbor Jet.';
const extracted = [
  { name: 'River Lantern', kind: 'restaurant', who: '', when: '' },
  { name: 'North Market Hall', kind: 'store', who: '', when: '' },
  { name: 'Harbor Jet', kind: 'flight', who: '', when: 'morning' },
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
assert.deepEqual(classification.things.map((thing) => thing.name), ['River Lantern', 'North Market Hall', 'Harbor Jet']);
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
  ['River Lantern', 'restaurant', 'chat_extraction'],
  ['North Market Hall', 'store', 'chat_extraction'],
  ['Harbor Jet', 'flight', 'chat_extraction'],
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
  artifacts: { destination: 'Orindell', requestText },
  env: {
    BRAVE_SEARCH_API_KEY: 'brave-test-key',
    TAVILI_API_KEY: 'tavily-test-key',
    OPENROUTER_API_KEY: 'test-openrouter-key',
  },
  priorPlaces: [],
  fetchImpl: async (url, options) => {
    const value = String(url);
    const hostname = new URL(value).hostname;
    searchCalls.push({ url: value, hostname });
    const allowedHosts = new Set([
      'overpass-api.de',
      'api.search.brave.com',
      'openrouter.ai',
      'nominatim.openstreetmap.org',
      'api.tavily.com',
    ]);
    if (!allowedHosts.has(hostname)) throw new Error(`unexpected host ${hostname}`);
    if (value.includes('googleapis') || value.includes('places.google')) throw new Error(`google places ${value}`);
    if (value.includes('nominatim.openstreetmap.org')) {
      return jsonResponse([{ lat: '41.1200', lon: '-8.6100', display_name: 'Orindell, Example' }]);
    }
    if (value.includes('overpass-api.de')) {
      return jsonResponse({
        elements: [
          { type: 'node', id: 22, lat: 41.12, lon: -8.61, tags: { name: 'River Lantern', amenity: 'restaurant' } },
        ],
      });
    }
    if (value.includes('api.search.brave.com/res/v1/local/place_search')) {
      const url = new URL(value);
      const q = url.searchParams.get('q') || 'Example Place';
      return jsonResponse({
        results: [{
          title: q,
          url: 'https://example.test/place',
          coordinates: [41.12, -8.61],
        }],
      });
    }
    if (value.includes('api.search.brave.com')) return jsonResponse({ results: [] });
    if (value.includes('openrouter.ai')) {
      return jsonResponse({ answers: { relevance: { choice: 5 } } });
    }
    if (value.includes('api.tavily.com/search')) {
      const body = JSON.parse(options.body);
      assert.equal(body.query, 'Harbor Jet');
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
assert.deepEqual(research.wantedThings.map((thing) => thing.name), ['River Lantern', 'North Market Hall', 'Harbor Jet']);
assert.deepEqual([...new Set(searchCalls.map((call) => call.hostname))].sort(), [
  'api.search.brave.com',
  'api.tavily.com',
  'nominatim.openstreetmap.org',
  'openrouter.ai',
  'overpass-api.de',
]);
assert.equal(searchCalls.some((call) => call.url.includes('nominatim')), true);
assert.equal(searchCalls.some((call) => call.url.includes('api.search.brave.com')), true);
assert.equal(searchCalls.some((call) => call.url.includes('api.tavily.com')), true);
assert.equal(searchCalls.some((call) => /googleapis|places\.google/.test(call.url)), false);
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
