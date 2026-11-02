import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBraveQueries, braveLocalEvidence } from '../src/vacation/dossier-brave.mjs';
import { gatherThingEvidence } from '../src/vacation/thing-evidence-dossier.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { dossierEmptyGatherReason } from '../src/vacation/xai-dossier-fill-state.mjs';
import { dossierPagesVerified } from '../src/vacation/thing-evidence-dossier.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { dossierSearchIdentity } from '../src/vacation/dossier-brave-queries.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { target, summary, description, findings, field, judge, noSleep, webResponse } from './lib/dossier-round4-test-support.mjs';

const env = { BRAVE_SEARCH_API_KEY: 'offline-fixture', TAVILI_API_KEY: 'offline-fixture' };
const flight = { tripId: 'offline-trip', placeId: 'route', title: 'Coastal Air SEA-BOS', category: 'flight',
  website: 'https://coastal.example/booking/find-flights', sourceRecord: { airline: 'Coastal Air', route: 'SEA-BOS' } };
const flightSummary = 'Coastal Air SEA-BOS connects the two airports with nonstop service between Seattle and Boston on its route network.';
const flightDescription = 'Coastal Air SEA-BOS links Seattle and Boston with nonstop service. The airline route page identifies SEA as the Seattle airport and BOS as the Boston airport. Its destination listing describes this airport pair as part of the airline network. The route evidence establishes the connection between the two airports without confirming any particular booking or departure.';
const flightFacts = 'Coastal Air connects SEA and BOS nonstop. SEA is the Seattle airport and BOS is the Boston airport. The destination listing describes this airport pair as part of the airline network. The route page does not confirm a booking or departure.';

for (const place of [flight, target]) test(`G3/G4 Brave 402 to Tavily pages and presented ${place.category}`, async () => {
  let brave = 0, tavily = 0;
  const storeImpl = memoryStore();
  const facts = place.category === 'flight' ? flightFacts : `${summary} ${description}`;
  const hitUrl = place.category === 'flight' ? 'https://coastal.example/routes/sea-bos' : target.website;
  const queries = [];
  const result = (await runThingEvidenceDossierStagingTargets([place], {
    env, operatorFill: true, skipExisting: true, storeImpl, sleepImpl: noSleep,
    gatherImpl: (p, options) => gatherThingEvidence(p, { ...options, braveImpl: null,
      resolveImpl: async () => [{ address: '93.184.216.34' }],
      extractImpl: async () => { throw new Error('offline extract unavailable'); },
    }),
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/web/search')) { brave += 1; return webResponse([], 402); }
      if (parsed.pathname === '/search') {
        assert.equal(parsed.pathname, '/search');
        const body = JSON.parse(options.body);
        queries.push(body.query); tavily += 1;
        assert.equal(body.search_depth, 'basic');
        return { ok: true, status: 200, json: async () => ({ results: [{ url: hitUrl, title: place.title, content: facts }] }) };
      }
      return { ok: false, status: 403 };
    },
    extractReviewsImpl: async () => ({ reviews: [] }),
    buildImpl: async (dossier, { prompt }) => {
      assert.ok(JSON.parse(prompt.split('\n').at(-1)).pages.some((p) => p.text.includes(facts)));
      return { findings: place.category === 'flight' ? { summary: field(flightSummary), description: field(flightDescription) } : findings() };
    }, judgeImpl: judge,
  })).results[0];
  assert.equal(result.failed, false);
  assert.equal(brave, 1, 'circuit breaker spans gather, extract fallback and local stages');
  assert.ok(tavily > 0);
  assert.ok(result.trace.attempts.some((a) => a.provider === 'Tavily' && a.stage === 'search' && a.httpStatus === 200 && a.results === 1));
  const saved = [...storeImpl.rows.values()].at(-1);
  assert.equal(dossierPagesVerified(saved), true);
  assert.equal(dossierPresented(saved, place), true, 'unchanged presented judge');
  assert.ok(saved.pages.some((p) => p.via === 'tavily-search'));
  if (place.category === 'flight') {
    assert.ok(queries.some((q) => /Coastal Air SEA BOS site:coastal.example route/.test(q)));
    assert.ok(saved.pages.some((p) => p.via === 'thing-record'));
  }
});

for (const status of [401, 402, 403, 429, 500, 'network']) test(`Brave ${status} falls back at every stage and preserves bounded retries`, async () => {
  let brave = 0, tavily = 0;
  const stages = ['general', 'reviews', 'price', 'extract_fallback', 'web_search'];
  const result = await runBraveQueries(stages.map((stage) => ({ stage, query: `${target.title} ${stage}` })), {
    env, sleepImpl: noSleep,
    fetchImpl: async (url) => {
      if (new URL(url).pathname.endsWith('/web/search')) {
        brave += 1;
        if (status === 'network') throw new Error('offline network failure');
        return webResponse([], status);
      }
      tavily += 1;
      return { ok: true, status: 200, json: async () => ({ results: [{ url: `${target.website}${tavily}`, title: target.title, content: summary }] }) };
    },
  });
  assert.equal(result.pages.length, stages.length);
  assert.equal(tavily, stages.length);
  assert.equal(brave, [401, 402, 403].includes(status) ? 1 : status === 'network' ? stages.length : stages.length * 3);
  assert.deepEqual(result.attempts.filter((a) => a.provider === 'Tavily').map((a) => a.searchStage), stages);
});

for (const category of ['flight', 'restaurant', 'attraction', 'store', 'hotel', 'car']) test(`Tavily replacement covers ${category}`, async () => {
  const dossier = await gatherThingEvidence({ title: target.title, category }, {
    env, sleepImpl: noSleep, braveImpl: null,
    fetchImpl: async (url) => new URL(url).pathname.endsWith('/web/search') ? webResponse([], 402)
      : { ok: true, status: 200, json: async () => ({ results: [{ url: target.website, title: target.title, content: summary }] }) },
  });
  assert.ok(dossier.pages.length);
  assert.equal(dossier.attempts.filter((a) => a.kind === 'brave' && a.httpStatus === 402).length, 1);
});

for (const fail of ['http', 'network', 'empty']) test(`Brave 402 plus Tavily ${fail} gives a current named cause`, async () => {
  const result = await runBraveQueries(['one', 'two'], {
    env, sleepImpl: noSleep,
    fetchImpl: async (url) => {
      if (new URL(url).pathname.endsWith('/web/search')) return webResponse([], 402);
      if (fail === 'network') throw new Error('offline failure');
      return { ok: fail === 'empty', status: fail === 'empty' ? 200 : 503, json: async () => ({ results: [] }) };
    },
  });
  assert.equal(result.pages.length, 0);
  assert.equal(dossierEmptyGatherReason(result), `brave_http_402+tavily_${fail === 'http' ? 'http_503' : fail === 'network' ? 'request_failed' : 'zero_hits'}`);
});

test('local Brave error uses Tavily immediately and the per-call breaker resets on a new call', async () => {
  let brave = 0, tavily = 0;
  const options = { env, sleepImpl: noSleep, fetchImpl: async (url) => {
    if (new URL(url).pathname.endsWith('/web/search')) { brave += 1; return webResponse([], 402); }
    tavily += 1;
    return { ok: true, status: 200, json: async () => ({ results: [{ url: target.website, content: summary }] }) };
  } };
  assert.ok((await braveLocalEvidence(target, options)).pages.length);
  assert.equal(brave, 1); assert.equal(tavily, 1);
  assert.ok((await runBraveQueries(['new operator call'], options)).pages.length);
  assert.equal(brave, 2);
});

test('a booking deep link failure searches airline domain routes within the same call', async () => {
  const queries = [];
  const dossier = await gatherThingEvidence(flight, {
    env, sleepImpl: noSleep, braveImpl: null,
    resolveImpl: async () => [{ address: '93.184.216.34' }],
    extractImpl: async () => { throw new Error('offline booking extract failed'); },
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/web/search')) return webResponse([], 402);
      if (path !== '/search') return { ok: false, status: 403 };
      const q = JSON.parse(options.body).query; queries.push(q);
      return { ok: true, status: 200, json: async () => ({ results: q.includes('site:coastal.example route') ? [{ url: 'https://coastal.example/destinations', title: flight.title, content: flightFacts }] : [] }) };
    },
  });
  assert.ok(queries.some((q) => q.includes('site:coastal.example route')));
  assert.ok(dossier.pages.some((p) => p.url === 'https://coastal.example/destinations'));
});

test('dossier identity keeps the actual multi-venue title without truncating its beginning', () => {
  const title = 'e’s BAR / The Dead Poet / Lilly’s Cocktail & Wine';
  assert.equal(dossierSearchIdentity({ title, category: 'restaurant' }, 'Upper West Side'), `${title} Upper West Side`);
});
