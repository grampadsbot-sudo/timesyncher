#!/usr/bin/env node
import assert from 'node:assert/strict';
import { firstIntakeReplyFacts, intakeReplyBlock } from '../src/vacation/first-intake-reply.mjs';
import { appTextBanned } from '../src/vacation/live-app-turn.mjs';
import { inTurnPlaceReplyViolation } from '../src/vacation/chat-place-search.mjs';
import { replyPlanFactsFromEntitlementRow } from '../src/vacation/reply-plan-entitlement.mjs';

const STAGING_TURN_ID = 'a68dc1a0-6ac9-4079-81bd-7adf7c3b7086';
const CUSTOMER_TURN = 'Maui March 10-17 2027 with my wife';
const CLASSIFIER_START = '2027-03-10';
const CLASSIFIER_END = '2027-03-17';
const STAGING_FLAGGED_DRAFT = "Shepherd, I'm building your Maui itinerary for Wednesday, March 10 through Wednesday, March 17, 2027, with you and your wife. I can add your wife when you agree. I will not grant view or edit until you agree. Where are you staying?";

const planEnv = {
  TIMESYNCHER_SINGLE_NAME: 'TimeSyncher Vacation Single',
  TIMESYNCHER_UNLIMITED_NAME: 'TimeSyncher Vacation Year',
};
const ownerPlan = replyPlanFactsFromEntitlementRow({
  plan: 'single',
  status: 'active',
  metadata: { product: 'timesyncher_vacation_single' },
}, planEnv, '5ce5eb7d-10f9-4022-ae4b-85620a616116');

const stagingFactsBeforeFix = {
  shape: 'gaps',
  customer_said: CUSTOMER_TURN,
  customer_name: 'Shepherd',
  where: 'Maui',
  who: ['wife'],
  gaps: ['when', 'lodging', 'plans'],
  when_relative: false,
};
assert.equal(
  intakeReplyBlock(STAGING_FLAGGED_DRAFT, appTextBanned, stagingFactsBeforeFix, [STAGING_TURN_ID]),
  'first_intake_reply_flagged',
);

const facts = firstIntakeReplyFacts({
  customerTurn: CUSTOMER_TURN,
  tripTitle: CUSTOMER_TURN,
  roster: [{ name: 'wife', role: 'collaborator' }],
  extractedDestination: 'Maui',
  customerName: 'Shepherd',
  savedStart: CLASSIFIER_START,
  savedEnd: CLASSIFIER_END,
  ownerPlan,
  tripId: '5ce5eb7d-10f9-4022-ae4b-85620a616116',
});
assert.equal(facts.shape, 'voice-note');
assert.equal(facts.start, CLASSIFIER_START);
assert.equal(facts.end, CLASSIFIER_END);
assert.equal(facts.weekday, 'Wednesday');
assert.equal(facts.end_weekday, 'Wednesday');
assert.deepEqual(facts.gaps, ['lodging', 'plans']);
assert.equal(
  intakeReplyBlock(STAGING_FLAGGED_DRAFT, appTextBanned, facts, [STAGING_TURN_ID]),
  '',
);

const tavilyPlaceResults = [
  {
    name: 'Maui Events Calendar | Maui Now',
    title: 'Maui Events Calendar | Maui Now',
    sourceRef: { id: 'https://mauinow.com/events', source: 'tavily' },
  },
];
const inventedWeb = inTurnPlaceReplyViolation(
  'You might catch live Hawaiian music or cultural performances at Whalers Village, just a short walk down the beach path.',
  tavilyPlaceResults,
);
assert.equal(inventedWeb?.status, 'unsourced_place');
assert.ok(inventedWeb?.invented?.includes('Whalers Village'));

console.log(JSON.stringify({
  ok: true,
  checked: 'first-intake-maui-staging',
  stagingTurnId: STAGING_TURN_ID,
  classifierStart: CLASSIFIER_START,
  classifierEnd: CLASSIFIER_END,
  stagingFlaggedDraft: STAGING_FLAGGED_DRAFT,
}));
