#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildProviderEnv, missingSearchKeys } from '../src/vacation/provider-env.mjs';
import { tavilyApiKey } from '../src/vacation/poi-search.mjs';

const built = buildProviderEnv({
  BRAVE_SEARCH_API_KEY: 'brave-from-env',
  TAVILI_API_KEY: 'tavily-from-env',
  OPENROUTER_API_KEY: 'router-key',
  DATABASE_URL: 'postgres://local',
});
assert.equal(built.brave, 'brave-from-env');
assert.equal(built.tavily, 'tavily-from-env');
assert.equal(built.braveName, 'BRAVE_SEARCH_API_KEY');
assert.equal(built.tavilyName, 'TAVILI_API_KEY');
assert.equal(built.OPENROUTER_API_KEY, 'router-key');
assert.equal(built.DATABASE_URL, 'postgres://local');
assert.deepEqual(missingSearchKeys({ BRAVE_SEARCH_API_KEY: 'x' }), []);
assert.deepEqual(missingSearchKeys({}), ['BRAVE_SEARCH_API_KEY']);
assert.equal(tavilyApiKey({ TAVILI_API_KEY: 'tv' }), 'tv');

console.log(JSON.stringify({ ok: true, checked: 'provider-env' }));
