#!/usr/bin/env node
import assert from 'node:assert/strict';
import { openRouterAppKey } from './vacation-app-reply-rules.mjs';
import { runShepherdJevPreflight } from './shepherd-staging-smoke-jev-preflight.mjs';

const stubEnv = {
  VERCEL_TOKEN: '',
  DATABASE_URL: 'postgresql://shepherd-jev-preflight/local',
  TIMESYNCHER_COUPON_HASH_SALT: 'salt',
  TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
};

assert.equal(openRouterAppKey(stubEnv), '');

const ok = await runShepherdJevPreflight({
  env: { ...stubEnv, OPENROUTER_API_KEY: 'test-jev-preflight-key' },
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      ok: true,
      model: 'typesafe/jev-1.13',
      answers: { preflight_ping: { noul: 0.9 } },
    }),
  }),
});
assert.equal(ok.ok, true);
assert.equal(ok.error, null);

console.log(JSON.stringify({ ok: true, checked: 'shepherd-staging-smoke-jev-preflight' }));
