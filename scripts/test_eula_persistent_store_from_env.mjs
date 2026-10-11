import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createPersistentStoreFromEnv,
  DatabaseJsonStore,
  LocalJsonStore,
} from '../src/onboarding/eula-persistent-store.mjs';

const base = {
  BLOB_READ_WRITE_TOKEN: undefined,
  VERCEL_BLOB_STORE_ID: undefined,
  DATABASE_URL: undefined,
  NEON_DATABASE_URL: undefined,
  VERCEL: undefined,
  VERCEL_ENV: undefined,
  NODE_ENV: undefined,
  TIMESYNCHER_ONBOARDING_STORE: undefined,
};

assert.throws(
  () => createPersistentStoreFromEnv({ ...base, VERCEL: '1' }),
  /EULA receipt store requires DATABASE_URL/,
);

assert.throws(
  () => createPersistentStoreFromEnv({ ...base, NODE_ENV: 'production' }),
  /EULA receipt store requires DATABASE_URL/,
);

const storeDir = await mkdtemp(path.join(tmpdir(), 'eula-store-env-'));
try {
  const local = createPersistentStoreFromEnv({
    ...base,
    TIMESYNCHER_ONBOARDING_STORE: storeDir,
  });
  assert.ok(local instanceof LocalJsonStore);

  const testLocal = createPersistentStoreFromEnv({
    ...base,
    NODE_ENV: 'test',
  });
  assert.ok(testLocal instanceof LocalJsonStore);

  const dbStore = createPersistentStoreFromEnv({
    ...base,
    DATABASE_URL: 'postgres://eula-store-env/local',
  });
  assert.ok(dbStore instanceof DatabaseJsonStore);
} finally {
  await rm(storeDir, { recursive: true, force: true });
}

process.stdout.write('eula persistent store from env test passed\n');
