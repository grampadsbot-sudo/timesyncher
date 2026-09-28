import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { searchTavily, TavilySearchError } from '../src/vacation/poi-search.mjs';

const source = readFileSync(new URL('../src/vacation/poi-search.mjs', import.meta.url), 'utf8');
const fetchBraveAt = source.indexOf('async function fetchBrave');
const searchTavilyAt = source.indexOf('export async function searchTavily');
assert.ok(fetchBraveAt >= 0, 'fetchBrave stays in poi-search.mjs');
assert.ok(searchTavilyAt > fetchBraveAt, 'searchTavily sits after fetchBrave');
assert.match(source, /TAVILY_API_KEY/);
assert.equal(source.includes('maps.googleapis.com'), false);

const QUERY = 'weekday hours for a public event';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const success = await searchTavily(QUERY, {
  apiKey: 'test-key',
  env: {},
  fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.authorization, 'Bearer test-key');
    assert.equal(init.headers['x-tavily-access-mode'], undefined);
    const body = JSON.parse(init.body);
    assert.equal(body.query, QUERY);
    assert.equal(body.include_answer, false);
    assert.equal(body.auto_parameters, false);
    assert.equal(Object.hasOwn(body, 'api_key'), false);
    assert.equal(url.includes('google'), false);
    return jsonResponse({
      answer: 'must not be returned',
      results: [
        {
          title: 'Hours',
          url: 'https://example.com/hours',
          content: 'Open until evening.',
          score: 0.8,
        },
        { title: 'Missing url', content: 'Dropped because it has no result URL.' },
      ],
    });
  },
});

assert.equal(success.query, QUERY);
assert.equal(Object.hasOwn(success, 'answer'), false);
assert.equal(success.results.length, 1);
assert.deepEqual(success.results[0], {
  source: 'tavily',
  url: 'https://example.com/hours',
  title: 'Hours',
  content: 'Open until evening.',
  score: 0.8,
});

let missingFetches = 0;
await assert.rejects(
  () => searchTavily(QUERY, {
    env: {},
    fetchImpl: async () => {
      missingFetches += 1;
      return jsonResponse({ results: [] });
    },
  }),
  (error) => {
    assert.ok(error instanceof TavilySearchError);
    assert.equal(error.code, 'TAVILY_API_KEY_MISSING');
    assert.match(error.message, /TAVILY_API_KEY is not set/);
    return true;
  },
);
assert.equal(missingFetches, 0);

await assert.rejects(
  () => searchTavily(QUERY, {
    apiKey: '   ',
    env: { TAVILY_API_KEY: 'env-key-must-not-override-blank' },
    fetchImpl: async () => jsonResponse({ results: [] }),
  }),
  (error) => error instanceof TavilySearchError && error.code === 'TAVILY_API_KEY_MISSING',
);

await assert.rejects(
  () => searchTavily(QUERY, {
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({ error: 'nope' }, 503),
  }),
  (error) => {
    assert.ok(error instanceof TavilySearchError);
    assert.equal(error.code, 'TAVILY_HTTP_ERROR');
    assert.equal(error.status, 503);
    assert.match(error.message, /HTTP 503/);
    assert.equal(error.message.includes('test-key'), false);
    return true;
  },
);

await assert.rejects(
  () => searchTavily(QUERY, {
    apiKey: 'test-key',
    timeoutMs: 20,
    fetchImpl: (_url, init) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(jsonResponse({ results: [] })), 1000);
      init.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  }),
  (error) => {
    assert.ok(error instanceof TavilySearchError);
    assert.equal(error.code, 'TAVILY_TIMEOUT');
    assert.match(error.message, /timed out after 20ms/);
    return true;
  },
);

console.log(JSON.stringify({
  ok: true,
  checked: ['success', 'missing-key', 'http-error', 'timeout'],
}));
