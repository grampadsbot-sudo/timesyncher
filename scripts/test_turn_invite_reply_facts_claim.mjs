#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
  replyActionClaimReason,
} from '../src/vacation/reply-action-claim.mjs';
import { applyTurnInviteReplyFacts, turnInviteReplyFacts } from '../src/vacation/turn-invite-reply-facts.mjs';

const inviteOk = {
  invite: { ok: true, code: 'collaborator_invite_sent', inviteeEmail: 'kim@example.com' },
};

const facts = turnInviteReplyFacts(inviteOk);
assert.equal(facts?.turnInvite?.ok, true);
assert.match(facts?.turnInvite?.detail || '', /emailed to kim@example\.com/i);
assert.match(facts?.turnInvite?.detail || '', /joins once they accept/i);

const tripContext = applyTurnInviteReplyFacts({ itinerary: [] }, inviteOk);
assert.equal(tripContext.turnInvite.inviteeEmail, 'kim@example.com');

const emailedReply = 'I emailed the invite to kim@example.com so she can accept and join.';
assert.equal(replyActionClaimReason(emailedReply, inviteOk, { activeCollaborators: [] }), '');

const pendingContext = { activeCollaborators: [] };
assert.equal(
  replyActionClaimReason('welcome, Kim!', inviteOk, pendingContext),
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
);
assert.equal(
  replyActionClaimReason('Kim joining the trip — great!', inviteOk, pendingContext),
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
);

const activeContext = { activeCollaborators: ['Kim Brooks'] };
assert.equal(replyActionClaimReason('welcome, Kim!', inviteOk, activeContext), '');
assert.equal(replyActionClaimReason('Kim is on the trip now.', inviteOk, activeContext), '');

const inviteFailed = { invite: { ok: false, code: 'send_failed', inviteeEmail: 'kim@example.com' } };
const failedFacts = turnInviteReplyFacts(inviteFailed);
assert.equal(failedFacts?.turnInvite?.ok, false);
assert.match(failedFacts?.turnInvite?.detail || '', /send_failed/);

console.log('test_turn_invite_reply_facts_claim: ok');
