#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  FIRST_INTAKE_GAP_INSTRUCTION,
  FIRST_INTAKE_QUESTION_INSTRUCTION,
  FIRST_INTAKE_VOICE_INSTRUCTION,
  firstIntakeReplyFacts,
  firstIntakeReplyPrompt,
} from '../src/vacation/first-intake-reply.mjs';
import { replyPlanFactsFromEntitlementRow } from '../src/vacation/reply-plan-entitlement.mjs';
import { intakeReplyBlock } from '../src/vacation/first-intake-gate.mjs';
import { appTextBanned } from '../src/vacation/live-app-turn.mjs';

const policyPattern = /\b(?:grant|granting)\s+(?:view|edit)\b|\bview or edit\b|\buntil you agree\b|\buntil they agree\b/i;

for (const text of [FIRST_INTAKE_VOICE_INSTRUCTION, FIRST_INTAKE_GAP_INSTRUCTION, FIRST_INTAKE_QUESTION_INSTRUCTION]) {
  assert.doesNotMatch(text, policyPattern, 'first-intake instruction must not carry consent-policy wording');
}

const ownerPlan = replyPlanFactsFromEntitlementRow({
  plan: 'single',
  status: 'active',
  metadata: { product: 'timesyncher_vacation_single' },
}, {
  TIMESYNCHER_SINGLE_NAME: 'TimeSyncher Vacation Single',
}, 'trip-spouse');

const facts = firstIntakeReplyFacts({
  customerTurn: 'Maui Nov 19-26 with my wife Kim.',
  tripTitle: 'Anniversary',
  roster: [{ name: 'Kim', role: 'collaborator' }],
  extractedDestination: 'Maui',
  customerName: 'Casey',
  savedStart: '2026-11-19',
  savedEnd: '2026-11-26',
  ownerPlan,
  tripId: 'trip-spouse',
});

const factsBlob = JSON.stringify(facts);
assert.doesNotMatch(factsBlob, policyPattern);
const prompt = firstIntakeReplyPrompt({
  customerTurn: 'Maui Nov 19-26 with my wife Kim.',
  tripTitle: 'Anniversary',
  wantedThings: [],
  roster: [{ name: 'Kim', role: 'collaborator' }],
  extractedDestination: 'Maui',
  customerName: 'Casey',
  savedStart: '2026-11-19',
  savedEnd: '2026-11-26',
  ownerPlan,
  tripId: 'trip-spouse',
});
assert.doesNotMatch(prompt, policyPattern);

const blocked = "I won't grant view or edit access until you both give the okay. Where are you staying?";
assert.equal(intakeReplyBlock(blocked, appTextBanned, facts, []), 'first_intake_reply_flagged');

console.log('test_first_intake_no_consent_policy: ok');
