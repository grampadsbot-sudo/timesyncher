import { readFileSync } from 'node:fs';
import { PostgresJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import {
  acceptEulaPersistent,
  activationStatusPersistent,
  createOnboardingSessionPersistent,
} from '../src/onboarding/eula-persistent-core.mjs';

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) throw new Error('DATABASE_URL, NEON_DATABASE_URL, or POSTGRES_URL is required');

const store = new PostgresJsonStore(process.env);
const eulaText = readFileSync('public/legal/terms-2026-06-advisory-only.md', 'utf8');
const sessionId = `postgres-smoke-${Date.now()}`;
const clientKey = `postgres-smoke:${sessionId}`;

await createOnboardingSessionPersistent(store, {
  sessionId,
  clientKey,
  clientLabel: 'Postgres EULA Smoke',
  contact: { email: 'smoke@example.com', phone: '+15555555555' },
  selectedFunctionality: ['vacation_planning_onboarding'],
  google: {},
  eula: { version: '2026-06-terms-advisory-only', text: eulaText },
}, new Date('2026-04-27T19:40:00Z'));

const { receipt } = await acceptEulaPersistent(store, sessionId, {
  acceptedByName: 'Postgres EULA Smoke',
  checkboxConfirmed: true,
}, new Date('2026-04-27T19:41:00Z'));

const status = await activationStatusPersistent(store, clientKey, '2026-06-terms-advisory-only');
if (!status.ok) throw new Error(`activation failed: ${status.errors.join(', ')}`);

console.log(JSON.stringify({ ok: true, sessionId, receiptSha256: receipt.receiptSha256, activationStatus: status }, null, 2));
