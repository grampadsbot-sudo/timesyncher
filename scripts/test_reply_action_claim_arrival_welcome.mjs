#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
  replyActionClaimReason,
} from '../src/vacation/reply-action-claim.mjs';

const inviteOk = {
  invite: { ok: true, code: 'collaborator_invite_sent', inviteeEmail: 'kim@example.com' },
};
const pendingContext = { activeCollaborators: [] };

assert.equal(
  replyActionClaimReason('Welcome aboard — you land at 3pm.', inviteOk, pendingContext),
  '',
);
assert.equal(
  replyActionClaimReason('Got it — landing at 3pm works.', inviteOk, pendingContext),
  '',
);

assert.equal(
  replyActionClaimReason('Kim has joined the trip.', inviteOk, pendingContext),
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
);

console.log('test_reply_action_claim_arrival_welcome: ok');
