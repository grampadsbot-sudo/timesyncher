import { readFileSync } from 'node:fs';
import { VercelBlobStore } from '../src/onboarding/eula-persistent-store.mjs';
import {
  acceptEulaPersistent,
  activationStatusPersistent,
  createOnboardingSessionPersistent,
} from '../src/onboarding/eula-persistent-core.mjs';

if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required');
const prefix = process.env.TIMESYNCHER_EULA_BLOB_PREFIX || `timesyncher-eula-smoke-${Date.now()}`;
const store = new VercelBlobStore({ prefix });
const eulaText = readFileSync('public/legal/eula-2026-04-initial-draft.md', 'utf8');
const sessionId = `blob-smoke-${Date.now()}`;
await createOnboardingSessionPersistent(store, {
  sessionId,
  clientKey: 'telegram:6373624711',
  clientLabel: 'C D',
  contact: { email: 'test-customer@example.com', phone: '+15551234567' },
  selectedFunctionality: ['email_handling', 'calendar_management'],
  google: { accountEmail: 'test-customer@example.com', gmailPolicy: 'read_only' },
  eula: { version: '2026-04-initial-draft', text: eulaText },
}, new Date('2026-04-27T19:40:00Z'));
const { receipt, receiptWrite, acceptanceCopy } = await acceptEulaPersistent(store, sessionId, { acceptedByName: 'C D Blob Smoke', checkboxConfirmed: true }, new Date('2026-04-27T19:41:00Z'));
const status = await activationStatusPersistent(store, 'telegram:6373624711', '2026-04-initial-draft');
if (!status.ok) throw new Error(`activation failed: ${status.errors.join(', ')}`);
console.log(JSON.stringify({ ok: true, prefix, sessionId, receiptSha256: receipt.receiptSha256, receiptUrl: receiptWrite.url, acceptanceCopyUrl: acceptanceCopy.url, activationStatus: status }, null, 2));
