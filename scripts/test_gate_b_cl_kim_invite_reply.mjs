#!/usr/bin/env node
import assert from 'node:assert/strict';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { applyTurnInviteReplyFacts, turnInviteReplyFacts } from '../src/vacation/turn-invite-reply-facts.mjs';
import { replyActionClaimReason } from '../src/vacation/reply-action-claim.mjs';

const inviteOk = {
  invite: {
    ok: true,
    code: 'collaborator_invite_sent',
    inviteeEmail: 'kim@example.com',
    inviteeName: 'Kim',
  },
};

const clBad = (reply) => /welcome,\s*Kim/i.test(reply) || /\bKim\b.*joining the trip/i.test(reply);

const facts = turnInviteReplyFacts(inviteOk);
assert.ok(facts?.turnInviteRule);
assert.equal(facts.turnInvite.inviteeName, 'Kim');

const tripContext = applyTurnInviteReplyFacts({ roster: 'Traveling: Owner.', itinerary: [] }, inviteOk);
assert.match(tripContext.turnInviteRule || '', /pending/i);

const rules = { ok: true, slug: 'test', pipeline: 'test', notes_where: 'day_required_place_optional' };
const system = replyRulesSystem(rules, 'Maui', 'forbidden', true, 'please invite Kim at kim@example.com', {
  tripContext,
  planLine: '',
  seatDollars: null,
  planOwned: true,
});
assert.match(system, /pending collaborator invite|pending invite/i);
assert.match(system, /not on the trip yet/i);

const honest = 'I emailed Kim at kim@example.com — the invite is pending until they accept.';
assert.equal(replyActionClaimReason(honest, inviteOk, { activeCollaborators: [], turnInviteeNames: ['Kim'] }), '');
assert.equal(clBad(honest), false);

const cooccurrence = 'Thanks — I invited Kim and look forward to Kim joining the trip.';
assert.equal(replyActionClaimReason(cooccurrence, inviteOk, { activeCollaborators: [] }), 'reply_action_claim_collaborator_not_on_trip');
assert.equal(clBad(cooccurrence), true);

console.log('test_gate_b_cl_kim_invite_reply: ok');
