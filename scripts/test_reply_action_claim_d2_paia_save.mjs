#!/usr/bin/env node
/**
 * D-d2 repro: staging deploy dpl_3iNwjxDhuQ4WC75HVRqebf5vQxwH (app f0123cb),
 * trip d3e19eb8-56c4-45a3-8cf0-008b99b9366e, customer turn
 * 95db8a4a-8a91-4d3b-8f3d-f8a4766db2c8 — "save Paia Fish Market" returned HTTP 502
 * with error reply_action_claim_blocked and an empty reply after the place saved.
 *
 * Root cause: invite-action claim detection treated any "I've added …" reply that also
 * mentioned wife/husband as an unbacked collaborator invite, including truthful save
 * acknowledgments that name the party. firstIntakeModelFacts (#191) is not on this path;
 * vacationAppReplyClaimContext supplies unscheduledChatPlaceTitles only.
 */
import assert from 'node:assert/strict';
import { assertCustomerReplyShippable } from '../src/vacation/reply-id-citation.mjs';
import { replyActionClaimReason } from '../src/vacation/reply-action-claim.mjs';
const placeTitle = 'Paia Fish Market Restaurant';
const claimContext = {
  activeCollaborators: [],
  rosterMemberNames: [],
  turnInviteeNames: [],
  unscheduledChatPlaceTitles: [placeTitle],
};

const stagingBlocked = "I've added Paia Fish Market Restaurant to your Maui trip for you and your wife — it's saved but not on a day yet.";
const stillBlocked = "I'll go ahead and add your wife as a collaborator on the trip.";
const allowed = 'Paia Fish Market Restaurant is saved and not on a day yet.';

assert.equal(replyActionClaimReason(stagingBlocked, {}, claimContext), '');
assert.equal(assertCustomerReplyShippable(stagingBlocked, 'd3e19eb8-56c4-45a3-8cf0-008b99b9366e', {}, claimContext), stagingBlocked);
assert.equal(replyActionClaimReason(allowed, {}, claimContext), '');
assert.equal(replyActionClaimReason(stillBlocked, {}, claimContext), 'reply_action_claim_unbacked');

console.log(JSON.stringify({
  ok: true,
  checked: 'reply-action-claim-d2-paia-save',
  customerTurnId: '95db8a4a-8a91-4d3b-8f3d-f8a4766db2c8',
  tripId: 'd3e19eb8-56c4-45a3-8cf0-008b99b9366e',
}));
