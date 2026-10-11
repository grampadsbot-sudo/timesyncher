#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  acceptEulaPersistent,
  createOnboardingSessionPersistent,
} from '../src/onboarding/eula-persistent-core.mjs';
import { DatabaseJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { handleEulaStoreDbSql } from './fixtures/eula-store-db-sql.mjs';
import {
  eulaStoreObjectKey,
  eulaVacationSessionId,
  readEulaReceiptDocument,
  listEulaStoreObjectKeysForSession,
  requireEulaStorePrefix,
  runEulaReadbackGate,
  harnessBlobListCallCount,
  resetHarnessBlobListCallCount,
} from './shepherd-staging-smoke-eula-readback.mjs';
import { SMOKE_FAIL_CLOSED_GO } from './shepherd-staging-smoke-plan.mjs';

const eulaStore = {};
const db = (strings, ...values) => {
  const text = strings.join(' ').replace(/\s+/g, ' ').trim();
  const handled = handleEulaStoreDbSql(text, values, eulaStore);
  if (handled !== undefined) return handled;
  throw new Error(`unexpected sql: ${text}`);
};
useVacationDatabase(db);
process.env.DATABASE_URL = 'postgres://eula-readback-smoke/local';
process.env.TIMESYNCHER_EULA_VERSION = '2026-06-terms-advisory-only';
process.env.TIMESYNCHER_EULA_BLOB_PREFIX = 'timesyncher-eula-test';

const store = new DatabaseJsonStore({ prefix: 'timesyncher-eula-test' });
const sessionToken = 'readback-token-1';
const sessionId = eulaVacationSessionId(sessionToken);
await createOnboardingSessionPersistent(store, {
  sessionId,
  clientKey: `vacation-onboarding:${sessionToken}`,
  clientLabel: 'Readback Owner',
  contact: { email: 'readback@example.com' },
  selectedFunctionality: ['vacation_planning_onboarding'],
  google: {},
  eula: { version: '2026-06-terms-advisory-only', text: 'Readback gate terms.' },
});
await acceptEulaPersistent(store, sessionId, { acceptedByName: 'Readback Owner', checkboxConfirmed: true });

resetHarnessBlobListCallCount();
const receiptDoc = await readEulaReceiptDocument(db, sessionId, process.env);
assert.ok(receiptDoc?.receiptSha256);
assert.equal(harnessBlobListCallCount(), 0);
const gate = await runEulaReadbackGate({ db, sessionToken, env: process.env });
assert.equal(gate.pass, true);
assert.equal(gate.blobListCalls, 0);
assert.equal(gate.receiptKey, eulaStoreObjectKey(sessionId, 'receipt', process.env));
assert.ok(gate.eulaStoreKeysForSession.includes(gate.receiptKey));

const missingGate = await runEulaReadbackGate({ db, sessionToken: 'no-such-token', env: process.env });
assert.equal(missingGate.pass, false);
assert.ok(missingGate.eulaStoreKeyDiag);
assert.equal(missingGate.eulaStoreKeyDiag.expectedReceiptKey, eulaStoreObjectKey('vacation-no-such-token', 'receipt', process.env));
const listed = await listEulaStoreObjectKeysForSession(db, sessionId, process.env);
assert.ok(listed.keys.includes(gate.receiptKey));

assert.throws(
  () => requireEulaStorePrefix({}),
  /TIMESYNCHER_EULA_BLOB_PREFIX is required/,
);
assert.throws(
  () => eulaStoreObjectKey(sessionId, 'receipt', {}),
  /TIMESYNCHER_EULA_BLOB_PREFIX is required/,
);
const noPrefixGate = await runEulaReadbackGate({
  db,
  sessionToken,
  env: { ...process.env, TIMESYNCHER_EULA_BLOB_PREFIX: '' },
});
assert.equal(noPrefixGate.pass, false);
assert.match(noPrefixGate.validation.errors.join(' '), /TIMESYNCHER_EULA_BLOB_PREFIX is required/);

assert.ok(SMOKE_FAIL_CLOSED_GO.includes('EULA'));

const planText = await import('node:fs').then((fs) => fs.readFileSync(new URL('./shepherd-staging-smoke-plan.mjs', import.meta.url), 'utf8'));
assert.match(planText, /'EULA'/);

useVacationDatabase(null);
console.log('shepherd eula readback gate test passed');
