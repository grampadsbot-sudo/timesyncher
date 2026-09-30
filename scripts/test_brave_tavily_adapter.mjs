import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchBraveAndTavily, runApprovedSourceAdapters } from './travel-source-adapter-runner.mjs';

let fetched = false;
await assert.rejects(
  () => searchBraveAndTavily('morning flight', {
    braveKey: '',
    tavilyKey: '',
    braveName: 'BRAVE_SEARCH_API_KEY',
    tavilyName: 'TAVILI_API_KEY',
    fetchImpl: async () => {
      fetched = true;
      throw new Error('missing keys must not fetch');
    },
  }),
  (error) => {
    assert.equal(error.code, 'missing_key');
    assert.match(error.message, /BRAVE_SEARCH_API_KEY/);
    assert.match(error.message, /TAVILI_API_KEY/);
    return true;
  },
);
assert.equal(fetched, false);

const calls = [];
const hits = await searchBraveAndTavily('morning flight', {
  braveKey: 'brave-test-key',
  tavilyKey: 'tavily-test-key',
  fetchImpl: async (url, options) => {
    calls.push(String(url));
    if (String(url).includes('api.search.brave.com')) {
      assert.equal(options.headers['X-Subscription-Token'], 'brave-test-key');
      return {
        ok: true,
        json: async () => ({
          web: {
            results: [
              { title: 'Morning departure', url: 'https://example.test/flight', description: 'A published schedule.' },
              { title: 'Untitled result', url: '', description: 'Dropped because it has no public page.' },
            ],
          },
        }),
      };
    }
    if (String(url).includes('api.tavily.com/search')) {
      assert.equal(options.headers.Authorization, 'Bearer tavily-test-key');
      return {
        ok: true,
        json: async () => ({
          results: [{ title: 'Schedule note', url: 'https://example.test/note', content: 'Another published schedule.' }],
        }),
      };
    }
    throw new Error(`unexpected ${url}`);
  },
});
assert.deepEqual(hits.map((hit) => hit.source), ['brave', 'tavily']);
assert.equal(hits.every((hit) => hit.source && hit.title), true);

const quiet = await searchBraveAndTavily('', {
  fetchImpl: async () => {
    throw new Error('empty query must not fetch');
  },
});
assert.deepEqual(quiet, []);

const registryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'travel-source-adapter-registry.json');
const run = await runApprovedSourceAdapters({
  registryPath,
  destination: 'Lisbon',
  braveKey: 'brave-test-key',
  tavilyKey: 'tavily-test-key',
  braveName: 'BRAVE_SEARCH_API_KEY',
  tavilyName: 'TAVILI_API_KEY',
  fetchImpl: async (url) => {
    if (String(url).includes('api.search.brave.com')) {
      return { ok: true, json: async () => ({ web: { results: [{ title: 'Harbor Cafe', url: 'https://example.test/harbor', description: 'A cafe.' }] } }) };
    }
    if (String(url).includes('api.tavily.com')) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    throw new Error(`unexpected adapter fetch ${url}`);
  },
});
assert.equal(run.adaptersRun.some((row) => row.adapterId === 'brave-tavily-web' && row.candidateCount === 1), true);
assert.equal(run.candidates[0].source, 'brave');
assert.equal(run.adaptersRun.some((row) => row.status === 'disabled_google_places_seed_removed'), false);

console.log(JSON.stringify({ ok: true, checked: 'brave-tavily-adapter', sources: hits.map((hit) => hit.source) }));
