#!/usr/bin/env node
/**
 * INV-CLAIM(b) repro at 68d3ff0. Seeded from staging trip b0ab0d92-f9ff-42ae-93ea-4020b191f3b4,
 * owner shepherd-inv-68d3ff0-1791016759517@resend.dev, customer "Inv Claim".
 * First intake turn 41f26e9a-2e4c-4927-b8a1-934674d10259 stored roster
 * [{ name: "my wife", role: "collaborator" }] and customerInputState lodgingAsk.
 * Gap-answer turn 89467a7c-5038-4b9f-973d-08eee13e0b62, request 1a233371-fc0d-448d-bb44-9f8fb7f47432,
 * text "We're staying at the Hyatt Regency Maui in Kaanapali.", intake true, firstIntake false,
 * roster [], wantedThings [{ kind: "hotel", name: "Hyatt Regency Maui", source: "chat_extraction" }].
 * App reply 26597f70-7cf5-4ffd-8396-aa14f319a64d was inserted at 08:40:07.169Z.
 * Hyatt thing a99b7de7-238e-4782-9642-9e948d57b8fb was inserted at 08:40:07.844Z, after that reply.
 * Prompt-time things are therefore empty. Prompt-time lastAskedGap is lodging: the row now says
 * plans, and that value is what this turn's persist wrote. invite_contact_needed stayed true.
 *
 * Expected to fail at 68d3ff0. Not listed in scripts/offline-tests.txt.
 */
import assert from 'node:assert/strict';
import { annotateLiveTurnGapAnswer, mergeSavedTripGapFields } from '../src/vacation/gap-ask-reply-context.mjs';
import { completeRosterParty, draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const customerTurn = "We're staying at the Hyatt Regency Maui in Kaanapali.";
const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const wantedThings = [{
  who: '',
  kind: 'hotel',
  name: 'Hyatt Regency Maui',
  when: '',
  source: 'chat_extraction',
}];
const saved = {
  destination: 'Maui',
  start: '2027-03-10T00:00:00.000Z',
  end: '2027-03-17T00:00:00.000Z',
  party: {
    editors: [],
    primary: { name: 'Inv Claim', role: 'Owner' },
    sources: [],
    viewers: [],
    collaborators: [],
    preference_subjects: [],
  },
  planOwned: false,
  things: [],
  lastAskedGap: 'lodging',
  invite_contact_needed: true,
  lodgingAsk: true,
  needsCustomerInput: ['lodging'],
  statedLodgingArea: '',
};

const span = {
  start: savedStart,
  end: savedEnd,
  spanLabel: 'Wed Mar 10\u2013Wed Mar 17 2027',
};
const party = completeRosterParty({
  party: saved.party,
  customerName: 'Inv Claim',
  turns: [
    { role: 'customer', text: 'Maui March 10-17 2027 with my wife' },
    { role: 'customer', text: customerTurn },
  ],
  roster: [],
  rosterError: null,
});
const merged = annotateLiveTurnGapAnswer({
  destination: saved.destination,
  start: span.start,
  end: span.end,
  span,
  things: saved.things,
  party,
  planOwned: false,
  ...mergeSavedTripGapFields(saved),
}, saved, { wantedThings });

assert.equal(merged.gapAnswerTurn, true);
assert.equal(merged.gapFilledThisTurn, 'lodging');
assert.equal(merged.invite_contact_needed, true);
assert.equal(merged.lastAskedGap, 'lodging');

const facts = draftingFacts(
  [{ role: 'customer', text: 'Maui March 10-17 2027 with my wife' }],
  customerTurn,
  merged,
);
const tripContext = await enrichDraftingTripContext(facts, {
  things: merged.things,
  env: {},
  placeSearchReplyFacts: null,
  savedStart,
  savedEnd,
  wantedThings,
});
const rules = { ok: true, notes_where: 'day_only_place_optional' };
const system = replyRulesSystem(rules, 'Maui', 'forbidden', false, customerTurn, { tripContext });

const violations = [];
if (facts.inviteContactAsk !== true) violations.push(`facts.inviteContactAsk=${String(facts.inviteContactAsk)}`);
if (!/includes inviteContactAsk\. Ask for the collaborator name and email/.test(system)) {
  violations.push('prompt missing invite-contact ask');
}
if (Array.isArray(facts.gaps) && facts.gaps.includes('plans') && !facts.gaps.includes('invite_contact')) {
  violations.push(`facts.gaps=${JSON.stringify(facts.gaps)}`);
}
assert.deepEqual(violations, []);
