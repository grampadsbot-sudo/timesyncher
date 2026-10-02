#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assertCustomerReplyShippable } from '../src/vacation/reply-id-citation.mjs';
import { failReplyActionClaim, replyActionClaimReason } from '../src/vacation/reply-action-claim.mjs';

const claim = "I've added Kim Brooks as a collaborator for the trip.";
const failure = "I couldn't send the invite to Kim yet — you can add her from Settings when you're ready.";
const successFacts = { invite: { ok: true, code: 'collaborator_invite_sent', inviteeEmail: 'kim@example.com' } };
const viewClaim = 'Kim will see these on the trip site once she accepts.';

assert.equal(replyActionClaimReason(claim, null), 'reply_action_claim_unbacked');
assert.equal(replyActionClaimReason(claim, { collaboratorInvite: { ok: false } }), 'reply_action_claim_unbacked');
assert.equal(replyActionClaimReason(claim, successFacts), '');
assert.equal(replyActionClaimReason(failure, null), '');
assert.equal(replyActionClaimReason(viewClaim, null), 'reply_action_claim_unbacked');
assert.equal(replyActionClaimReason(viewClaim, successFacts), '');
assert.equal(replyActionClaimReason('They can now view the itinerary.', null), 'reply_action_claim_unbacked');
assert.throws(
  () => assertCustomerReplyShippable(claim, 'trip-1', null),
  (error) => error?.name === 'reply_action_claim_blocked' && error.reason === 'reply_action_claim_unbacked',
);
assert.equal(assertCustomerReplyShippable(claim, 'trip-1', successFacts), claim);
assert.equal(assertCustomerReplyShippable(failure, 'trip-1', null), failure);

assert.throws(
  () => failReplyActionClaim('reply_action_claim_unbacked', 'trip-1'),
  (error) => error?.name === 'reply_action_claim_blocked',
);

console.log('test_reply_action_claim: ok');
