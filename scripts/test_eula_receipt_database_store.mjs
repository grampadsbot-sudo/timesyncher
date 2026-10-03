import assert from 'node:assert/strict';
import {
  acceptEulaPersistent,
  activationStatusPersistent,
  createOnboardingSessionPersistent,
} from '../src/onboarding/eula-persistent-core.mjs';
import { DatabaseJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { handleEulaStoreDbSql } from './fixtures/eula-store-db-sql.mjs';

const eulaStore = {};
const db = (strings, ...values) => {
  const text = strings.join(' ').replace(/\s+/g, ' ').trim();
  const handled = handleEulaStoreDbSql(text, values, eulaStore);
  if (handled !== undefined) return handled;
  throw new Error(`unexpected sql in eula receipt db test: ${text}`);
};

useVacationDatabase(db);
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://eula-receipt-db-test/local';

const store = new DatabaseJsonStore({ prefix: 'timesyncher-eula-test' });
const sessionId = 'receipt-db-session-1';
const eulaText = 'Receipt database store terms.';
await createOnboardingSessionPersistent(store, {
  sessionId,
  clientKey: 'vacation-onboarding:token-1',
  clientLabel: 'Ada Owner',
  contact: { email: 'ada@example.com' },
  selectedFunctionality: ['vacation_planning_onboarding'],
  google: {},
  eula: { version: '2026-06-terms-advisory-only', text: eulaText },
});

await acceptEulaPersistent(store, sessionId, {
  acceptedByName: 'Ada Owner',
  checkboxConfirmed: true,
});

const status = await activationStatusPersistent(
  store,
  'vacation-onboarding:token-1',
  '2026-06-terms-advisory-only',
);
assert.equal(status.ok, true, JSON.stringify(status));

eulaStore['timesyncher-eula-fail/sessions/fail-session.json'] = {
  sessionId: 'fail-session',
  clientKey: 'vacation-onboarding:fail',
  clientLabel: 'Fail',
  contact: {},
  selectedFunctionality: ['vacation_planning_onboarding'],
  google: {},
  eula: { version: '2026-06-terms-advisory-only', text: eulaText },
  status: 'pending',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};
const failingDb = (strings, ...values) => {
  const text = strings.join(' ').replace(/\s+/g, ' ').trim();
  if (/insert into eula_store_objects/i.test(text)) throw new Error('database write failed');
  const handled = handleEulaStoreDbSql(text, values, eulaStore);
  if (handled !== undefined) return handled;
  throw new Error(`unexpected sql in eula receipt fail test: ${text}`);
};
useVacationDatabase(failingDb);
const failStore = new DatabaseJsonStore({ prefix: 'timesyncher-eula-fail' });

await assert.rejects(
  () => acceptEulaPersistent(failStore, 'fail-session', {
    acceptedByName: 'Ada Owner',
    checkboxConfirmed: true,
  }),
  /database write failed/,
);

useVacationDatabase(null);
process.stdout.write('eula receipt database store test passed\n');
