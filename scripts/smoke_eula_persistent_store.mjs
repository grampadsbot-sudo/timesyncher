import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import {
  acceptEulaPersistent,
  activationStatusPersistent,
  createOnboardingSessionPersistent,
  loadSessionPersistent,
} from '../src/onboarding/eula-persistent-core.mjs';

const store = new LocalJsonStore(mkdtempSync(join(tmpdir(), 'timesyncher-eula-persistent-')));
const eulaText = readFileSync('public/legal/eula-2026-04-initial-draft.md', 'utf8');
await createOnboardingSessionPersistent(store, {
  sessionId: 'persistent-smoke-session',
  clientKey: 'telegram:6373624711',
  clientLabel: 'C D',
  contact: { email: 'test-customer@example.com', phone: '+15551234567' },
  selectedFunctionality: ['email_handling', 'calendar_management'],
  google: { accountEmail: 'test-customer@example.com', gmailPolicy: 'read_only' },
  eula: { version: '2026-04-initial-draft', text: eulaText },
}, new Date('2026-04-27T19:30:00Z'));
const pending = await loadSessionPersistent(store, 'persistent-smoke-session');
if (pending.status !== 'pending') throw new Error('session not persisted');
const { receipt } = await acceptEulaPersistent(store, 'persistent-smoke-session', { acceptedByName: 'C D', checkboxConfirmed: true }, new Date('2026-04-27T19:31:00Z'));
const status = await activationStatusPersistent(store, 'telegram:6373624711', '2026-04-initial-draft');
if (!status.ok) throw new Error(`activation failed: ${status.errors.join(', ')}`);
const stale = await activationStatusPersistent(store, 'telegram:6373624711', '2026-06-ga-v1');
if (stale.ok) throw new Error('stale EULA version should fail');
console.log(JSON.stringify({ ok: true, receiptSha256: receipt.receiptSha256, activationStatus: status }, null, 2));
