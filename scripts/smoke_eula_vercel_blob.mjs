import { readFileSync } from 'node:fs';
import { DatabaseJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import {
  acceptEulaPersistent,
  activationStatusPersistent,
  createOnboardingSessionPersistent,
} from '../src/onboarding/eula-persistent-core.mjs';

if (!process.env.DATABASE_URL && !process.env.NEON_DATABASE_URL) {
  throw new Error('DATABASE_URL or NEON_DATABASE_URL is required');
}
const prefix = process.env.TIMESYNCHER_EULA_BLOB_PREFIX || `timesyncher-eula-smoke-${Date.now()}`;
const store = new DatabaseJsonStore({ prefix });
const eulaText = readFileSync('public/legal/terms-2026-06-advisory-only.md', 'utf8');
const sessionId = `db-smoke-${Date.now()}`;
await createOnboardingSessionPersistent(store, {
  sessionId,
  clientKey: 'telegram:6373624711',
  clientLabel: 'C D',
  contact: { email: 'test-customer@example.com', phone: '+15551234567' },
  selectedFunctionality: ['email_handling', 'calendar_management'],
  google: { accountEmail: 'test-customer@example.com', gmailPolicy: 'read_only' },
  eula: { version: '2026-06-terms-advisory-only', text: eulaText },
}, new Date('2026-04-27T19:40:00Z'));
const { receipt, receiptWrite, acceptanceCopy } = await acceptEulaPersistent(store, sessionId, { acceptedByName: 'C D DB Smoke', checkboxConfirmed: true }, new Date('2026-04-27T19:41:00Z'));
const status = await activationStatusPersistent(store, 'telegram:6373624711', '2026-06-terms-advisory-only');
if (!status.ok) throw new Error(`activation failed: ${status.errors.join(', ')}`);
console.log(JSON.stringify({ ok: true, prefix, sessionId, receiptSha256: receipt.receiptSha256, receiptKey: receiptWrite.key, acceptanceCopyKey: acceptanceCopy.key, activationStatus: status }, null, 2));
