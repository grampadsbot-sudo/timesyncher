#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runApprovedSourceAdapters, searchBraveAndTavily } from './travel-source-adapter-runner.mjs';
import { runPublicResearch } from './vacation-public-research-worker.mjs';

const runnerText = fs.readFileSync(new URL('./travel-source-adapter-runner.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(runnerText, /BRAVE_SEARCH_API_KEY/);
assert.doesNotMatch(runnerText, /fixtureRecentTravelerSentiment/);
assert.doesNotMatch(runnerText, /TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE/);
assert.doesNotMatch(runnerText, /disabled_google_places_seed_removed/);
assert.doesNotMatch(runnerText, /places\.googleapis\.com\/.*place/);

const names = { braveName: 'BRAVE_SEARCH_API_KEY', tavilyName: 'TAVILY_API_KEY' };

let fetches = 0;
await assert.rejects(
  () => searchBraveAndTavily('Tokyo ramen', {
    ...names,
    braveKey: '',
    tavilyKey: '',
    fetchImpl: async () => {
      fetches += 1;
      throw new Error('fetch ran without keys');
    },
  }),
  (error) => error.code === 'missing_key' && /BRAVE_SEARCH_API_KEY/.test(error.message) && /TAVILY_API_KEY/.test(error.message),
);
assert.equal(fetches, 0);

await assert.rejects(
  () => searchBraveAndTavily('Tokyo ramen', {
    ...names,
    braveKey: 'brave-test',
    tavilyKey: 'tavily-test',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  }),
  /Brave search failed: HTTP 503/,
);

const calls = [];
const hits = await searchBraveAndTavily('Tokyo museums', {
  ...names,
  braveKey: 'brave-test',
  tavilyKey: 'tavily-test',
  category: 'activity',
  fetchImpl: async (url, init) => {
    const href = String(url);
    calls.push({ href, method: init?.method || 'GET' });
    if (href.includes('api.search.brave.com')) {
      assert.match(href, /q=Tokyo%20museums/);
      assert.equal(init.headers['X-Subscription-Token'], 'brave-test');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          web: {
            results: [
              { title: 'TeamLab', url: 'https://example.com/teamlab', description: 'A museum.' },
              { title: 'Places row', url: 'https://places.googleapis.com/v1/places/abc', description: 'Blocked.' },
              { title: '', url: 'https://example.com/untitled' },
            ],
          },
        }),
      };
    }
    if (href.includes('api.tavily.com')) {
      assert.equal(init.method, 'POST');
      assert.match(init.headers.Authorization, /^Bearer tavily-test$/);
      const body = JSON.parse(init.body);
      assert.equal(body.query, 'Tokyo museums');
      assert.equal(body.include_answer, false);
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{ title: 'Ueno Park', url: 'https://example.com/ueno', content: 'A park.' }] }),
      };
    }
    throw new Error(`unexpected host ${href}`);
  },
});
assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST']);
assert.deepEqual(hits.map((hit) => [hit.source, hit.title, hit.category]), [
  ['brave', 'TeamLab', 'activity'],
  ['tavily', 'Ueno Park', 'activity'],
]);
assert.ok(hits.every((hit) => hit.sourceBacked && hit.sources[0].url.startsWith('https://')));
assert.equal(hits.some((hit) => /googleapis/.test(hit.website)), false);

const registryPath = new URL('./travel-source-adapter-registry.json', import.meta.url);
await assert.rejects(
  () => runApprovedSourceAdapters({
    registryPath,
    destination: 'Tokyo',
    braveName: 'BRAVE_SEARCH_API_KEY',
    tavilyName: 'TAVILY_API_KEY',
    fetchImpl: async () => {
      throw new Error('adapter fetched without keys');
    },
  }),
  (error) => error.code === 'missing_key',
);

await assert.rejects(
  () => runPublicResearch({
    artifacts: { destination: 'Tokyo', requestText: 'museums' },
    env: {},
    fetchImpl: async () => {
      throw new Error('fetched without keys');
    },
  }),
  (error) => error.code === 'missing_key' && /BRAVE_SEARCH_API_KEY/.test(error.message),
);

const liveCalls = [];
const live = await runPublicResearch({
  artifacts: { destination: 'Tokyo', requestText: 'museums only, no flights, no hotel, no car' },
  env: { BRAVE_SEARCH_API_KEY: 'brave-test', TAVILY_API_KEY: 'tavily-test' },
  fetchImpl: async (url) => {
    const href = String(url);
    liveCalls.push(new URL(href).hostname);
    if (href.includes('api.search.brave.com')) {
      return { ok: true, status: 200, json: async () => ({ web: { results: [{ title: 'TeamLab', url: 'https://example.com/teamlab', description: 'A museum.' }] } }) };
    }
    if (href.includes('api.tavily.com')) {
      return { ok: true, status: 200, json: async () => ({ results: [{ title: 'Ueno Park', url: 'https://example.com/ueno', content: 'A park.' }] }) };
    }
    throw new Error(`unexpected ${href}`);
  },
});
assert.equal(live.provider, 'brave-tavily');
assert.ok(liveCalls.includes('api.search.brave.com'));
assert.ok(liveCalls.includes('api.tavily.com'));
assert.ok(live.adapterRun.candidates.length > 0);
assert.ok(live.adapterRun.candidates.every((candidate) => candidate.source === 'brave' || candidate.source === 'tavily'));

const quiet = await runPublicResearch({
  artifacts: { destination: 'Tokyo', requestText: 'Plan museums.' },
  env: { TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1' },
  fetchImpl: async () => {
    throw new Error('disabled live research fetched');
  },
});
assert.equal(quiet.status, 'provider_not_configured');
assert.equal(quiet.candidates.length, 0);

console.log(JSON.stringify({ ok: true, checked: 'brave-tavily-adapter' }));
