#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
  replyActionClaimReason,
} from '../src/vacation/reply-action-claim.mjs';

const inviteOk = {
  invite: { ok: true, code: 'collaborator_invite_sent', inviteeEmail: 'kim@example.com', inviteeName: 'Kim' },
};
const pendingContext = { activeCollaborators: [], pendingInviteeNames: ['Kim'] };
const activeContext = { activeCollaborators: ['Kim Brooks'], pendingInviteeNames: ['Kim'] };

assert.equal(
  replyActionClaimReason('Welcome aboard — you land at 3pm.', inviteOk, pendingContext),
  '',
);
assert.equal(
  replyActionClaimReason('Welcome to Maui!', inviteOk, pendingContext),
  '',
);
assert.equal(
  replyActionClaimReason('Welcome, Kim!', inviteOk, pendingContext),
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
);
assert.equal(
  replyActionClaimReason('Kim has joined the trip.', inviteOk, pendingContext),
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
);
assert.equal(replyActionClaimReason('Welcome, Kim!', inviteOk, activeContext), '');
assert.equal(replyActionClaimReason('Kim has joined the trip.', inviteOk, activeContext), '');

console.log('test_reply_action_claim_arrival_welcome: ok');
