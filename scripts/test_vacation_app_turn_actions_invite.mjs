import assert from 'node:assert/strict';

import { runVacationAppTurnActions } from '../src/vacation/vacation-app-turn-actions.mjs';

const session = { id: 'session-1', customer_id: 'owner-1' };
const requestText = 'Please add Alex, alex@example.com to the trip.';

const success = await runVacationAppTurnActions({
  db: {},
  session,
  tripId: 'trip-1',
  requestText,
  openSeats: async () => [{ name: 'Alex', email: 'alex@example.com', emailStatus: 'sent' }],
});
assert.deepEqual(success.invite, {
  ok: true,
  code: 'collaborator_invite_sent',
  inviteeEmail: 'alex@example.com',
});

const sendFailed = await runVacationAppTurnActions({
  db: {},
  session,
  tripId: 'trip-1',
  requestText,
  openSeats: async () => {
    throw new Error('resend unavailable');
  },
});
assert.equal(sendFailed.invite.ok, false);
assert.equal(sendFailed.invite.code, 'send_failed');
assert.equal(sendFailed.invite.inviteeEmail, 'alex@example.com');

console.log('vacation app turn actions invite passed');
