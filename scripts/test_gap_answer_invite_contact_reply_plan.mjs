#!/usr/bin/env node
import assert from 'node:assert/strict';
import { draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const INVITE_ASK_RULE = /includes inviteContactAsk\. Ask for the collaborator name and email/;
const LODGING_ASK_RULE = /includes lodgingAsk\./;

const customerTurn = "We're staying at the Hyatt Regency Maui in Kaanapali.";
const things = [
  { title: "Mama's Fish House", whenLabel: 'Saturday', category: 'restaurant' },
];

const facts = draftingFacts(
  [{ role: 'customer', text: 'Maui trip for me and my wife.' }],
  customerTurn,
  {
    things,
    span: { spanLabel: 'Mar 10 through Mar 17', start: '2027-03-10' },
    destination: 'Maui',
    lastAskedGap: 'lodging',
    invite_contact_needed: true,
    gapAnswerTurn: true,
    gapFilledThisTurn: 'lodging',
    statedLodgingArea: 'Hyatt Regency Maui in Kaanapali',
    party: { primary: { name: 'Alex' } },
  },
);

assert.equal(facts.lodgingAsk, undefined);
assert.equal(facts.inviteContactAsk, true);
assert.equal(facts.invite_contact_needed, true);
assert.deepEqual(facts.needsCustomerInput, ['invite_contact']);

const tripContext = await enrichDraftingTripContext(facts, {
  env: {},
  things,
  savedStart: '2027-03-10',
  savedEnd: '2027-03-17',
});

const system = replyRulesSystem({}, 'Maui', false, false, customerTurn, { tripContext });
assert.match(system, INVITE_ASK_RULE);
assert.doesNotMatch(system, LODGING_ASK_RULE);
assert.match(system, /"inviteContactAsk":true/);

console.log(JSON.stringify({
  ok: true,
  checked: 'gap-answer-invite-contact-reply-plan',
}));
