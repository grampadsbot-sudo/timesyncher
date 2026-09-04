import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CURRENT_EULA_VERSION } from '../src/onboarding/current-eula-text.mjs';
import { acceptEulaPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import {
  ensureVacationEulaSession,
  vacationEulaStatus,
} from '../src/vacation/onboarding.mjs';

const env = {
  TIMESYNCHER_ONBOARDING_STORE: mkdtempSync(join(tmpdir(), 'timesyncher-vacation-eula-')),
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
  TIMESYNCHER_TELEGRAM_BOT_USERNAME: 'TimeSyncherVacationStagingBot',
};

const row = {
  id: 'onboarding-session-1',
  token: 'tok_customer_123',
  telegram_deep_link: 'https://t.me/TimeSyncherVacationStagingBot?start=tok_customer_123',
  email: 'synthetic-customer@example.com',
  phone: '+15551230000',
  first_name: 'Synthetic',
  last_name: 'Customer',
  display_name: 'Synthetic Customer',
};

const eula = await ensureVacationEulaSession(row, { env });
assert.equal(eula.status, 'pending');
assert.equal(eula.sessionId, 'vacation-tok_customer_123');
assert.equal(
  eula.acceptUrl,
  'https://vacation-staging.timesyncher.com/accept/vacation-tok_customer_123',
);

const store = createPersistentStoreFromEnv(env);
await acceptEulaPersistent(
  store,
  eula.sessionId,
  { acceptedByName: 'Synthetic Customer', checkboxConfirmed: true },
  new Date('2026-09-04T17:20:00Z'),
);

const accepted = await vacationEulaStatus(row, env);
assert.equal(accepted.ok, true);
assert.equal(accepted.status, 'accepted');
assert.equal(accepted.requiredEulaVersion, CURRENT_EULA_VERSION);
assert.match(accepted.receiptSha256, /^[a-f0-9]{64}$/);

console.log('vacation onboarding EULA canonical-version regression passed');
