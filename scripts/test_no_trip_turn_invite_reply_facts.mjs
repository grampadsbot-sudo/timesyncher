#!/usr/bin/env node
import assert from 'node:assert/strict';
import { noTripReplyBlock } from '../src/vacation/no-trip-starter-reply.mjs';
import { testSingleOwnerPlan } from './fixtures/reply-plan-test-fixtures.mjs';

const inviteOk = {
  invite: { ok: true, code: 'collaborator_invite_sent', inviteeEmail: 'jamie@example.com' },
};

function starterFacts(turnActionResults) {
  const ownerPlan = testSingleOwnerPlan;
  const facts = {
    shape: 'no-trip',
    customer_said: 'Please invite Jamie at jamie@example.com',
    customer_name: 'Morgan',
    missing_where: true,
    missing_when: true,
    gaps: ['where', 'when'],
    plan: {
      purchased_plan: ownerPlan.checkout_plan,
      plan_id: ownerPlan.plan_id,
      plan_name: ownerPlan.plan_name,
      plan_owned: true,
      order_bump_owned: false,
    },
  };
  if (turnActionResults?.invite?.ok) {
    facts.turnInvite = {
      ok: true,
      code: 'collaborator_invite_sent',
      inviteeEmail: 'jamie@example.com',
      detail: 'emailed to jamie@example.com; joins once they accept',
    };
  }
  return facts;
}

const facts = starterFacts(inviteOk);
assert.equal(facts.turnInvite?.ok, true);
assert.match(facts.turnInvite?.detail || '', /pending|accept|emailed/i);

const honestReply = 'I emailed Jamie an invite at jamie@example.com — it is pending until they accept. Where are you going and when?';
assert.equal(noTripReplyBlock(honestReply, () => '', facts), '');

console.log('test_no_trip_turn_invite_reply_facts: ok');
