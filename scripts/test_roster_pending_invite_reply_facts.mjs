#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
  replyActionClaimReason,
} from '../src/vacation/reply-action-claim.mjs';
import {
  applyPendingInviteReplyFacts,
  pendingInviteReplyFacts,
} from '../src/vacation/roster-pending-invite-reply-facts.mjs';

const rows = [
  { requested_for: 'Jamie Brooks', status: 'pending_payment', metadata: { email: 'jamie@example.com' } },
  { requested_for: '', status: 'pending_payment', metadata: { email: 'kim@example.com', displayName: 'Kim' } },
  { requested_for: 'Alex', status: 'pending_payment', metadata: { email: 'alex@example.com' } },
];

const facts = pendingInviteReplyFacts(rows);
assert.equal(facts.pendingInvitees.length, 3);
assert.deepEqual(
  facts.pendingInvitees.map((row) => row.status),
  ['pending', 'pending', 'pending'],
);
assert.ok(facts.pendingInvitees.some((row) => row.email === 'kim@example.com' && row.label === 'Kim'));

const tripContext = applyPendingInviteReplyFacts({ roster: 'Traveling: Morgan.' }, facts);
assert.equal(tripContext.pendingInvitees.length, 3);
assert.match(tripContext.rosterInviteRule || '', /pending/i);

const honest = 'Jamie, Kim, and Alex have pending invites — they are not on the trip until they accept.';
assert.equal(replyActionClaimReason(honest, null, { activeCollaborators: ['Morgan'] }), '');

const blocked = 'Welcome, Jamie! Jamie is joining the trip.';
assert.equal(
  replyActionClaimReason(blocked, null, { activeCollaborators: ['Morgan'] }),
  REPLY_ACTION_CLAIM_COLLABORATOR_NOT_ON_TRIP,
);

console.log('test_roster_pending_invite_reply_facts: ok');
