#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  FIRST_INTAKE_VOICE_INSTRUCTION,
  firstIntakeReplyFacts,
  firstIntakeReplyPrompt,
} from '../src/vacation/first-intake-reply.mjs';
import {
  applyCustomerInputToFirstIntakeFacts,
  attachFirstIntakeCustomerInputPayload,
  firstIntakeLodgingCustomerInput,
} from '../src/vacation/first-intake-customer-input.mjs';
import { persistedLodgingAskSignals } from './shepherd-staging-smoke-grader-lib.mjs';
import { testSingleOwnerPlan } from './fixtures/reply-plan-test-fixtures.mjs';

const ownerPlan = testSingleOwnerPlan;
const tripId = 'a8da6c05-e5b4-42d5-91fe-4dfdc91d3045';
const baseVoice = {
  customerTurn: 'Maui March 10-17 2027 with my wife',
  extractedDestination: 'Maui',
  savedStart: '2027-03-10',
  savedEnd: '2027-03-17',
  ownerPlan,
  tripId,
};

assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /When lodgingAsk is true/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /both lodgingAsk and invite_contact_needed/);

const inviteInput = {
  ...baseVoice,
  roster: [{ name: 'my wife', role: 'collaborator' }],
};
const inviteGap = firstIntakeLodgingCustomerInput([], []);
assert.equal(inviteGap.lodgingAsk, true);
const inviteFacts = applyCustomerInputToFirstIntakeFacts(firstIntakeReplyFacts(inviteInput), inviteGap);
assert.equal(inviteFacts.lodgingAsk, true);
assert.deepEqual(inviteFacts.needsCustomerInput, ['lodging']);
assert.equal(inviteFacts.invite_contact_needed, true);
const invitePrompt = firstIntakeReplyPrompt(inviteInput);
assert.match(invitePrompt, /"lodgingAsk":true/);
assert.match(invitePrompt, /"invite_contact_needed":true/);
assert.match(invitePrompt, /ask where they are staying/i);
assert.match(invitePrompt, /name and email/i);

const payload = { liveTranscript: {} };
attachFirstIntakeCustomerInputPayload(payload, inviteGap);
const signals = persistedLodgingAskSignals(payload, {});
assert.equal(signals.persistedLodgingAsk, true);
assert.equal(signals.lodgingAsk, true);
assert.deepEqual(signals.needsCustomerInput, ['lodging']);

const lodgingOnlyInput = {
  customerTurn: [
    'We are heading to the Big Island of Hawaii for the dates in the facts.',
    'Nico wants gardens and Tess wants a swim later if the beach is windy.',
    'Mara does not want two big activities stacked on the same day.',
    'Groceries the day we land, then a quiet dinner.',
    'That is the rough shape, and I can fill in more after this note.',
  ].join(' '),
  tripTitle: 'Hawaii trip',
  ownerPlan,
  tripId,
  extractedDestination: 'Big Island of Hawaii',
  savedStart: '2032-09-23',
  savedEnd: '2032-09-30',
  wantedThings: [
    { name: 'gardens', kind: 'activity', who: 'Nico' },
    { name: 'swim', kind: 'activity', who: 'Tess' },
  ],
  roster: [
    { name: 'Nico', role: 'collaborator', email: 'nico@example.com' },
    { name: 'Tess', role: 'collaborator', email: 'tess@example.com' },
    { name: 'Mara', role: 'collaborator', email: 'mara@example.com' },
  ],
};
const lodgingOnlyGap = firstIntakeLodgingCustomerInput([], lodgingOnlyInput.wantedThings);
const lodgingOnlyFacts = applyCustomerInputToFirstIntakeFacts(firstIntakeReplyFacts(lodgingOnlyInput), lodgingOnlyGap);
assert.equal(lodgingOnlyFacts.shape, 'voice-note');
assert.equal(lodgingOnlyFacts.lodgingAsk, true);
assert.equal(lodgingOnlyFacts.invite_contact_needed, undefined);
const lodgingOnlyPrompt = firstIntakeReplyPrompt(lodgingOnlyInput);
assert.match(lodgingOnlyPrompt, /"lodgingAsk":true/);
assert.doesNotMatch(lodgingOnlyPrompt, /"invite_contact_needed":true/);
assert.match(lodgingOnlyPrompt, /ask where they are staying/i);

const withLodging = firstIntakeLodgingCustomerInput(
  [],
  [{ name: 'Kihei condo', kind: 'hotel' }],
);
assert.equal(Object.hasOwn(withLodging, 'lodgingAsk'), false);
const lodgedFacts = applyCustomerInputToFirstIntakeFacts(firstIntakeReplyFacts({
  ...lodgingOnlyInput,
  wantedThings: [{ name: 'Kihei condo', kind: 'hotel' }, ...lodgingOnlyInput.wantedThings],
}), withLodging);
assert.equal(lodgedFacts.lodgingAsk, undefined);
const lodgedPrompt = firstIntakeReplyPrompt({
  ...lodgingOnlyInput,
  wantedThings: [{ name: 'Kihei condo', kind: 'hotel' }, ...lodgingOnlyInput.wantedThings],
});
assert.doesNotMatch(lodgedPrompt, /"lodgingAsk":true/);

console.log('test_first_intake_lodging_ask: ok');
