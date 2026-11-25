import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchTavilyWeb, runApprovedSourceAdapters } from './travel-source-adapter-runner.mjs';

const TAVILY_URL = `https://${['api', 'tavily', 'com'].join('.')}/search`;

let fetched = false;
await assert.rejects(
  () => searchTavilyWeb('morning flight', {
    tavilyKey: '',
    tavilyName: 'TAVILI_API_KEY',
    fetchImpl: async () => {
      fetched = true;
      throw new Error('missing key must not fetch');
    },
  }),
  (error) => {
    assert.equal(error.code, 'missing_key');
    assert.match(error.message, /TAVILI_API_KEY/);
    return true;
  },
);
assert.equal(fetched, false);

const calls = [];
const hits = await searchTavilyWeb('morning flight', {
  tavilyKey: 'tavily-test-key',
  fetchImpl: async (url, options) => {
    calls.push(String(url));
    if (String(url) === TAVILY_URL) {
      assert.equal(options.headers.Authorization, 'Bearer tavily-test-key');
      return {
        ok: true,
        json: async () => ({
          results: [
            { title: 'Schedule note', url: 'https://example.test/note', content: 'Another published schedule.' },
            { title: 'Untitled result', url: '', content: 'Dropped because it has no public page.' },
          ],
        }),
      };
    }
    throw new Error(`unexpected ${url}`);
  },
});
assert.deepEqual(hits.map((hit) => hit.source), ['tavily']);
assert.equal(hits.every((hit) => hit.source && hit.title), true);

const quiet = await searchTavilyWeb('', {
  fetchImpl: async () => {
    throw new Error('empty query must not fetch');
  },
});
assert.deepEqual(quiet, []);

const registryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'travel-source-adapter-registry.json');
const run = await runApprovedSourceAdapters({
  registryPath,
  destination: 'Lisbon',
  tavilyKey: 'tavily-test-key',
  tavilyName: 'TAVILI_API_KEY',
  fetchImpl: async (url) => {
    if (String(url) === TAVILY_URL) {
      return { ok: true, json: async () => ({ results: [{ title: 'Harbor Cafe', url: 'https://example.test/harbor', content: 'A cafe.' }] }) };
    }
    throw new Error(`unexpected adapter fetch ${url}`);
  },
});
assert.equal(run.adaptersRun.some((row) => row.adapterId === 'tavily-web' && row.candidateCount === 1), true);
assert.equal(run.candidates[0].source, 'tavily');
assert.equal(run.adaptersRun.some((row) => row.status === 'disabled_google_places_seed_removed'), false);

console.log(JSON.stringify({ ok: true, checked: 'tavily-web-adapter', sources: hits.map((hit) => hit.source) }));
