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

function intakeFacts(input, savedThings = []) {
  const customerInput = firstIntakeLodgingCustomerInput(savedThings, input.wantedThings || []);
  return applyCustomerInputToFirstIntakeFacts(firstIntakeReplyFacts(input), customerInput);
}

assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /When lodgingAsk is true/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /Never ask a second question/);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /one or two questions/i);

const inviteInput = {
  customerTurn: 'Maui March 10-17 2027 with my wife',
  extractedDestination: 'Maui',
  savedStart: '2027-03-10',
  savedEnd: '2027-03-17',
  ownerPlan,
  tripId,
  roster: [{ name: 'my wife', role: 'collaborator' }],
};
const inviteGap = firstIntakeLodgingCustomerInput([], []);
assert.equal(inviteGap.lodgingAsk, true);
const inviteFacts = intakeFacts(inviteInput);
assert.equal(inviteFacts.lodgingAsk, true);
assert.deepEqual(inviteFacts.needsCustomerInput, ['lodging']);
assert.equal(inviteFacts.invite_contact_needed, true);
assert.equal(inviteFacts.gaps[0], 'lodging');
assert.ok(inviteFacts.gaps.includes('invite_contact'));
const invitePrompt = firstIntakeReplyPrompt(inviteInput);
assert.match(invitePrompt, /"lodgingAsk":true/);
assert.doesNotMatch(invitePrompt, /invite/);
assert.match(invitePrompt, /"gaps":\["lodging"\]/);
assert.match(invitePrompt, /ask where they are staying/i);
assert.match(invitePrompt, /Never ask a second question/);

const payload = { liveTranscript: {} };
attachFirstIntakeCustomerInputPayload(payload, inviteGap);
const signals = persistedLodgingAskSignals(payload, {});
assert.equal(signals.persistedLodgingAsk, true);
assert.equal(signals.lodgingAsk, true);
assert.deepEqual(signals.needsCustomerInput, ['lodging']);

const lodgedInput = {
  ...inviteInput,
  wantedThings: [{ name: 'Kihei condo', kind: 'hotel' }],
};
const withLodging = firstIntakeLodgingCustomerInput([], lodgedInput.wantedThings);
assert.equal(Object.hasOwn(withLodging, 'lodgingAsk'), false);
const lodgedFacts = intakeFacts(lodgedInput);
assert.equal(lodgedFacts.lodgingAsk, undefined);
assert.equal(lodgedFacts.gaps[0], 'plans');
assert.ok(lodgedFacts.gaps.includes('invite_contact'));
const lodgedPrompt = firstIntakeReplyPrompt(lodgedInput);
assert.doesNotMatch(lodgedPrompt, /"lodgingAsk":true/);

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
const lodgingOnlyFacts = intakeFacts(lodgingOnlyInput);
assert.equal(lodgingOnlyFacts.shape, 'voice-note');
assert.equal(lodgingOnlyFacts.lodgingAsk, true);
assert.equal(lodgingOnlyFacts.invite_contact_needed, undefined);
assert.equal(lodgingOnlyFacts.gaps[0], 'lodging');
const lodgingOnlyPrompt = firstIntakeReplyPrompt(lodgingOnlyInput);
assert.match(lodgingOnlyPrompt, /"lodgingAsk":true/);
assert.doesNotMatch(lodgingOnlyPrompt, /"invite_contact_needed":true/);
assert.match(lodgingOnlyPrompt, /ask where they are staying/i);

const datesMissingInput = {
  customerTurn: 'Maui with my wife',
  extractedDestination: 'Maui',
  ownerPlan,
  tripId,
  roster: [{ name: 'my wife', role: 'collaborator' }],
};
const datesMissingFacts = intakeFacts(datesMissingInput);
assert.equal(datesMissingFacts.lodgingAsk, true);
assert.equal(datesMissingFacts.invite_contact_needed, true);
assert.equal(datesMissingFacts.gaps[0], 'when');
const datesMissingPrompt = firstIntakeReplyPrompt(datesMissingInput);
assert.match(datesMissingPrompt, /"gaps":\["when"/);

const voicePersistGap = firstIntakeLodgingCustomerInput([], lodgingOnlyInput.wantedThings);
const voicePayload = { liveTranscript: {} };
attachFirstIntakeCustomerInputPayload(voicePayload, voicePersistGap);
assert.equal(persistedLodgingAskSignals(voicePayload, {}).persistedLodgingAsk, true);
assert.match(firstIntakeReplyPrompt(lodgingOnlyInput), /ask where they are staying/i);

console.log('test_first_intake_lodging_ask: ok');
