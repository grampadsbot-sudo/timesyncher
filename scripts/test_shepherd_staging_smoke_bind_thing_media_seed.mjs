#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  buildSmokeBindThingMediaSeed,
  insertSmokeBindThingMediaSeed,
  seedEnvWithoutBlob,
} from './shepherd-staging-smoke-bind-thing-media-seed.mjs';
import { runBindThingMediaCacheCheck } from './shepherd-staging-smoke-bind-thing-media-cache.mjs';

const base = 'https://vacation-staging.timesyncher.com';
const seed = buildSmokeBindThingMediaSeed({ base });
assert.match(seed.seededUrl, new RegExp(seed.bindingId));
assert.match(seed.seededUrl, /raw=1/);
assert.equal(seed.bytes.length > 8, true);
assert.equal(seedEnvWithoutBlob({ BLOB_READ_WRITE_TOKEN: 'x', DATABASE_URL: 'postgres://u' }).BLOB_READ_WRITE_TOKEN, undefined);

const missingDb = await insertSmokeBindThingMediaSeed({ base, env: {} });
assert.equal(missingDb.ok, false);
assert.equal(missingDb.reason, 'bind_thing_media_seed_missing_database_url');

const noSeed = await runBindThingMediaCacheCheck({ BASE: base, env: {}, fetchImpl: async () => ({ status: 500, headers: { get: () => '' } }) });
assert.match(noSeed.check208.failReason, /bind_thing_media_seed_missing_database_url/);

console.log('shepherd bind-thing-media seed tests passed');
