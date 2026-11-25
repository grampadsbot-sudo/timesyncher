#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildProviderEnv, missingSearchKeys } from '../src/vacation/provider-env.mjs';
import { tavilyApiKey } from '../src/vacation/poi-search.mjs';

const built = buildProviderEnv({
  TAVILI_API_KEY: 'tavily-from-env',
  OPENROUTER_API_KEY: 'router-key',
  DATABASE_URL: 'postgres://local',
  VK_SEARCH_WAKE_URL: 'https://vk-search.test/wake',
});
assert.equal(built.brave, undefined);
assert.equal(built.braveName, undefined);
assert.equal(built.tavily, 'tavily-from-env');
assert.equal(built.tavilyName, 'TAVILI_API_KEY');
assert.equal(built.OPENROUTER_API_KEY, 'router-key');
assert.equal(built.DATABASE_URL, 'postgres://local');
assert.equal(built.VK_SEARCH_WAKE_URL, 'https://vk-search.test/wake');
assert.deepEqual(missingSearchKeys({}), []);
assert.equal(tavilyApiKey({ TAVILI_API_KEY: 'tv' }), 'tv');

console.log(JSON.stringify({ ok: true, checked: 'provider-env' }));
