#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runVacationAppTurnActions } from '../src/vacation/vacation-app-turn-actions.mjs';

const session = { id: 'session-1', customer_id: 'owner-1' };
const requestText = 'my wife Kim, kim.rivera.sct@agentmail.to';

const success = await runVacationAppTurnActions({
  db: {},
  session,
  tripId: 'trip-1',
  requestText,
  classification: {
    inviteeName: 'Kim',
    inviteeEmail: 'kim.rivera.sct@agentmail.to',
  },
  openSeats: async () => [{ name: 'Kim', email: 'kim.rivera.sct@agentmail.to', emailStatus: 'sent' }],
});
assert.deepEqual(success.invite, {
  ok: true,
  code: 'collaborator_invite_sent',
  inviteeEmail: 'kim.rivera.sct@agentmail.to',
  inviteeName: 'Kim',
});

const missingName = await runVacationAppTurnActions({
  db: {},
  session,
  tripId: 'trip-1',
  requestText,
  classification: {
    inviteeName: '',
    inviteeEmail: 'kim.rivera.sct@agentmail.to',
  },
});
assert.equal(missingName.invite.ok, false);
assert.equal(missingName.invite.code, 'missing_invitee_name');
assert.equal(missingName.invite.inviteeEmail, 'kim.rivera.sct@agentmail.to');

console.log('test_vacation_app_turn_actions_invite_classifier: ok');
