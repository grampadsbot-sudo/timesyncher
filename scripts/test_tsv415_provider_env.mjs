#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  BRAVE_PROVIDER_KEY_NAME,
  TAVILI_PROVIDER_KEY_NAME,
  buildProviderEnv,
} from '../src/vacation/provider-env.mjs';

const decoyEnv = {
  MY_E_SEARCH_API_KEY: 'decoy-brave',
  CUSTOM_ILI_API_KEY: 'decoy-tavily',
  BRAVE_SEARCH_API_KEY: 'real-brave',
  TAVILI_API_KEY: 'real-tavily',
};
const built = buildProviderEnv(decoyEnv);
assert.equal(built.brave, 'real-brave', 'brave key must use the deploy-required name, not suffix guessing');
assert.equal(built.tavily, 'real-tavily', 'tavily key must use the deploy-required name, not suffix guessing');
assert.equal(built.braveName, BRAVE_PROVIDER_KEY_NAME);
assert.equal(built.tavilyName, TAVILI_PROVIDER_KEY_NAME);

process.stdout.write('tsv415 provider-env tests passed\n');
