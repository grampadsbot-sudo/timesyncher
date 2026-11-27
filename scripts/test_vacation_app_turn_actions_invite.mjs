import assert from 'node:assert/strict';

import { runVacationAppTurnActions } from '../src/vacation/vacation-app-turn-actions.mjs';

const session = { id: 'session-1', customer_id: 'owner-1' };
const requestText = 'Please send Alex a collaborator invite at alex@example.com.';
const classification = {
  ok: true,
  understanding: { sendCollaboratorInvite: { name: 'Alex', email: 'alex@example.com', explicitSendRequestSpan: requestText } },
};

const success = await runVacationAppTurnActions({
  db: {},
  session,
  tripId: 'trip-1',
  requestText,
  classification,
  openSeats: async () => [{ name: 'Alex', email: 'alex@example.com', emailStatus: 'sent' }],
});
assert.deepEqual(success.invite, {
  ok: true,
  code: 'collaborator_invite_sent',
  inviteeEmail: 'alex@example.com',
  inviteeName: 'Alex',
});

const sendFailed = await runVacationAppTurnActions({
  db: {},
  session,
  tripId: 'trip-1',
  requestText,
  classification,
  openSeats: async () => {
    throw new Error('resend unavailable');
  },
});
assert.equal(sendFailed.invite.ok, false);
assert.equal(sendFailed.invite.code, 'send_failed');
assert.equal(sendFailed.invite.inviteeEmail, 'alex@example.com');

console.log('vacation app turn actions invite passed');
