import assert from 'node:assert/strict';
import {
  assertHighAuthorityActionAllowed,
  blockHighAuthorityRequest,
  classifyHighAuthorityRequest,
} from '../src/safety/high-authority-actions.mjs';

const blockedExamples = [
  ['book it', 'booking_or_reservation'],
  ['send the email', 'email_send'],
  ['accept the terms', 'terms_acceptance'],
  ['cancel the reservation', 'cancellation_or_reschedule'],
  ['move my calendar event', 'calendar_write'],
  ['message the hotel and confirm with the vendor', 'outbound_message'],
  ['buy this excursion', 'purchase_or_payment'],
  ['change my subscription settings', 'account_change'],
];

for (const [text, expectedKind] of blockedExamples) {
  const result = blockHighAuthorityRequest(text, {});
  assert.equal(result.blocked, true, `${text} should be blocked`);
  assert.ok(result.kinds.includes(expectedKind), `${text} should include ${expectedKind}`);
  assert.match(result.message, /advisory-only/);
}

const allowedPlanning = classifyHighAuthorityRequest('compare three hotels and draft a recommendation');
assert.equal(allowedPlanning.blocked, false);

assert.throws(
  () => assertHighAuthorityActionAllowed('email_send', {}),
  /high-authority action blocked: email_send/,
);

assert.doesNotThrow(() => assertHighAuthorityActionAllowed('email_send', { TIMESYNCHER_ALLOW_HIGH_AUTHORITY_ACTIONS: 'true' }));

console.log(JSON.stringify({ ok: true, blockedExamples: blockedExamples.length }, null, 2));
