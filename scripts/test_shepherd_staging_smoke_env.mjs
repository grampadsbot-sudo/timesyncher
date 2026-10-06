#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ensureShepherdStagingSmokeEnv,
  unwrapVercelEnvString,
} from './shepherd-staging-smoke-env.mjs';

assert.equal(unwrapVercelEnvString('"postgresql://user:pass@host/db"'), 'postgresql://user:pass@host/db');
assert.equal(unwrapVercelEnvString('plain-value'), 'plain-value');
assert.equal(unwrapVercelEnvString(''), '');

const env = {
  VERCEL_TOKEN: 'vt_test',
  TIMESYNCHER_HARNESS_STUB_OUTBOUND: '1',
  OPENROUTER_API_KEY: 'router-local',
  TIMESYNCHER_COUPON_HASH_SALT: 'salt-local',
  TIMESYNCHER_COLLABORATOR_NAME: 'collab-local',
  TIMESYNCHER_EULA_BLOB_PREFIX: 'eula/local',
};
const quotedDb = '"postgresql://quoted:secret@neon/db"';
const fetchImpl = async (url) => {
  const href = String(url);
  if (href.includes('/v1/projects/') && href.includes('/env/1aaOv6d2efkLmXJA')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ key: 'DATABASE_URL', value: quotedDb }),
    };
  }
  throw new Error(`unexpected fetch ${href}`);
};

await ensureShepherdStagingSmokeEnv({ env, fetchImpl });
assert.equal(env.DATABASE_URL, 'postgresql://quoted:secret@neon/db');
assert.equal(env.NEON_DATABASE_URL, env.DATABASE_URL);

const source = readFileSync(new URL('./shepherd-staging-smoke-env.mjs', import.meta.url), 'utf8');
assert.match(source, /unwrapVercelEnvString/);

console.log('shepherd staging smoke env tests passed');
