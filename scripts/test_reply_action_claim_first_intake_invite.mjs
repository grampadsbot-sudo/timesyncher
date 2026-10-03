#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assertCustomerReplyShippable } from '../src/vacation/reply-id-citation.mjs';
import { replyActionClaimReason } from '../src/vacation/reply-action-claim.mjs';
import { firstIntakeReplyFacts } from '../src/vacation/first-intake-reply.mjs';
import { applyCustomerInputToFirstIntakeFacts, firstIntakeLodgingCustomerInput } from '../src/vacation/first-intake-customer-input.mjs';
import { testSingleOwnerPlan } from './fixtures/reply-plan-test-fixtures.mjs';

const stagingClaim = "I'll go ahead and add your wife as a collaborator on the trip.";
const askInvite = "I'm putting together your Maui trip from Wednesday, March 10 to Wednesday, March 17, 2027 — seven nights with your wife. What is her name and email so I can invite her?";
const offerOnly = "Nico can be invited when you are ready. What is still open about dinner the day you land?";

assert.equal(replyActionClaimReason(stagingClaim, null), 'reply_action_claim_unbacked');
assert.throws(
  () => assertCustomerReplyShippable(stagingClaim, 'trip-1', {}),
  (error) => error?.name === 'reply_action_claim_blocked',
);
assert.equal(replyActionClaimReason(askInvite, null), '');
assert.equal(replyActionClaimReason(offerOnly, null), '');
assert.equal(assertCustomerReplyShippable(askInvite, 'trip-1', {}), askInvite);

const intake = {
  customerTurn: 'Maui March 10-17 2027 with my wife',
  roster: [{ name: 'my wife', role: 'collaborator' }],
  extractedDestination: 'Maui',
  savedStart: '2027-03-10',
  savedEnd: '2027-03-17',
  ownerPlan: testSingleOwnerPlan,
  tripId: 'a8da6c05-e5b4-42d5-91fe-4dfdc91d3045',
};
const facts = applyCustomerInputToFirstIntakeFacts(
  firstIntakeReplyFacts(intake),
  firstIntakeLodgingCustomerInput([], []),
);
assert.equal(facts.shape, 'voice-note');
assert.equal(facts.invite_contact_needed, true);
assert.equal(facts.lodgingAsk, true);
assert.equal(facts.collaborators, undefined);
assert.equal(facts.gaps[0], 'lodging');
assert.ok(facts.gaps.includes('invite_contact'));

console.log('test_reply_action_claim_first_intake_invite: ok');
