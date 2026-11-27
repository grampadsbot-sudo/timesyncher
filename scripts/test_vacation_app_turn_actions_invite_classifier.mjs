#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runVacationAppTurnActions } from '../src/vacation/vacation-app-turn-actions.mjs';

const session = { id: 'session-1', customer_id: 'owner-1' };
const requestText = 'My sister Ana is coming. Her email is ana@example.com.';

const inferred = await runVacationAppTurnActions({
  db: {},
  session,
  tripId: 'trip-1',
  requestText,
  classification: {
    ok: true,
    inviteeName: 'Ana',
    inviteeEmail: 'ana@example.com',
    roster: [{ name: 'Ana', role: 'collaborator' }],
  },
  openSeats: async () => assert.fail('Contact details and roster data cannot send an invite.'),
});
assert.deepEqual(inferred, {});

const explicitSendRequestSpan = 'Please send a collaborator invite to ana@example.com.';
const missingName = await runVacationAppTurnActions({
  db: {},
  session,
  tripId: 'trip-1',
  requestText: explicitSendRequestSpan,
  classification: {
    ok: true,
    understanding: { sendCollaboratorInvite: { name: '', email: 'ana@example.com', explicitSendRequestSpan } },
  },
});
assert.equal(missingName.invite.ok, false);
assert.equal(missingName.invite.code, 'missing_invitee_name');
assert.equal(missingName.invite.inviteeEmail, 'ana@example.com');

console.log('test_vacation_app_turn_actions_invite_classifier: ok');
