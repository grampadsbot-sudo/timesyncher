import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acceptEula,
  activationStatus,
  createOnboardingSession,
  loadSession,
  receiptPath,
  readJson,
  validateReceiptForActivation,
} from '../src/onboarding/eula-backend-core.mjs';

const store = mkdtempSync(join(tmpdir(), 'timesyncher-eula-store-'));
const eulaText = readFileSync('public/legal/terms-2026-06-advisory-only.md', 'utf8');
const session = createOnboardingSession(store, {
  sessionId: 'backend-smoke-session',
  clientKey: 'telegram:6373624711',
  clientLabel: 'C D',
  contact: { email: 'test-customer@example.com', phone: '+15551234567' },
  selectedFunctionality: ['email_handling', 'calendar_management', 'notes'],
  google: { accountEmail: 'test-customer@example.com', gmailPolicy: 'read_only', calendarPolicy: 'tentative_holds' },
  eula: { version: '2026-06-terms-advisory-only', text: eulaText },
});
if (loadSession(store, session.sessionId).status !== 'pending') throw new Error('session did not persist');
const { receipt } = acceptEula(store, session.sessionId, { acceptedByName: 'C D Backend Smoke', checkboxConfirmed: true, userAgent: 'backend-smoke' }, new Date('2026-04-27T18:50:00Z'));
const accepted = loadSession(store, session.sessionId);
if (accepted.status !== 'accepted') throw new Error('session not accepted');
const storedReceipt = readJson(receiptPath(store, session.sessionId));
const validation = validateReceiptForActivation({ session: accepted, receipt: storedReceipt, requiredEulaVersion: '2026-06-terms-advisory-only' });
if (!validation.ok) throw new Error(`activation validation failed: ${validation.errors.join(', ')}`);
const status = activationStatus(store, 'telegram:6373624711', '2026-06-terms-advisory-only');
if (!status.ok) throw new Error(`activationStatus failed: ${status.errors.join(', ')}`);
const stale = activationStatus(store, 'telegram:6373624711', '2026-06-ga-v1');
if (stale.ok) throw new Error('stale terms version should not activate');
console.log(JSON.stringify({ ok: true, store, receiptSha256: receipt.receiptSha256, activationStatus: status }, null, 2));
