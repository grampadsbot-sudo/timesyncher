#!/usr/bin/env node
import assert from 'node:assert/strict';

import { buildProviderEnv } from '../src/vacation/provider-env.mjs';

const decoyEnv = {
  MY_E_SEARCH_API_KEY: 'decoy-brave',
  CUSTOM_ILI_API_KEY: 'decoy-tavily',
  BRAVE_SEARCH_API_KEY: 'real-brave',
  TAVILI_API_KEY: 'real-tavily',
};
const built = buildProviderEnv(decoyEnv);
assert.equal(built.brave, 'real-brave', 'brave key must use the deploy-required name, not suffix guessing');
assert.equal(built.tavily, 'real-tavily', 'tavily key must use the deploy-required name, not suffix guessing');
assert.equal(built.braveName, 'BRAVE_SEARCH_API_KEY');
assert.equal(built.tavilyName, 'TAVILI_API_KEY');

process.stdout.write('tsv415 provider-env tests passed\n');
