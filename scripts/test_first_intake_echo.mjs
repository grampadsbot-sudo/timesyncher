import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bakeoffTierModels } from './vacation-app-reply-rules.mjs';
import {
  FIRST_INTAKE_GAP_INSTRUCTION,
  FIRST_INTAKE_VOICE_INSTRUCTION,
  firstIntakeReplyFacts,
  intakeReplyBlock,
  weekdayForIso,
  whenRelativeToToday,
} from '../src/vacation/first-intake-reply.mjs';
import { replyPlanFactsFromEntitlementRow } from '../src/vacation/reply-plan-entitlement.mjs';
import { liveTurnRecord } from '../src/vacation/live-app-turn.mjs';
import { appReplyTelemetry } from '../src/vacation/reply-telemetry.mjs';
import { authorPeopleFromTrip, turnAuthorLabel } from '../src/vacation/turn-author.mjs';

const root = new URL('../', import.meta.url);
const plans = JSON.parse(await readFile(new URL('content/plans.json', root), 'utf8'));
const route = await readFile(new URL('routes/vacation-itinerary.mjs', root), 'utf8');
const page = await readFile(new URL('vacation-app.html', root), 'utf8');
const planEnv = {
  TIMESYNCHER_SINGLE_NAME: 'TimeSyncher Vacation Single',
  TIMESYNCHER_UNLIMITED_NAME: 'TimeSyncher Vacation Year',
};
const tiers = bakeoffTierModels();
const today = '2026-10-01';
const tripId = 'niag5k2tq';
const singlePlan = replyPlanFactsFromEntitlementRow({
  plan: 'single',
  status: 'active',
  metadata: { product: 'timesyncher_vacation_single' },
}, planEnv, tripId);
const ownerId = 'owner-customer-0001';
const collabId = 'collab-customer-0002';

assert.equal(weekdayForIso('2032-09-23'), 'Thursday');
assert.equal(whenRelativeToToday('2032-09-23', today), false);
assert.equal(whenRelativeToToday('2027-09-01', today), true);
assert.equal(plans.timesyncher_vacation_single.plan_id, 'timesyncher_vacation_single');
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /unlimited\s+\S*\s*vacations?/i);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /Offer to add each person in collaborators/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /exactly one question/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /already have access/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /two or three gap questions/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /who is coming/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /second person/);

const said = 'Bristol and Calvin are coming to the coast for the dates in the facts. We have a house and a swim planned. '.repeat(3);
const facts = firstIntakeReplyFacts({
  customerTurn: said,
  tripTitle: tripId,
  extractedDestination: 'the coast',
  wantedThings: [{ name: 'swim', kind: 'activity', who: 'Bristol' }],
  roster: [
    { name: 'Bristol', role: 'collaborator' },
    { name: 'Calvin', role: 'collaborator' },
  ],
  savedStart: '2032-09-23',
  savedEnd: '2032-09-30',
  customerName: 'Ada Lovelace',
  today,
  ids: [tripId, ownerId],
  ownerPlan: singlePlan,
  tripId,
});
assert.equal(facts.shape, 'voice-note');
assert.equal(facts.weekday, 'Thursday');
assert.equal(facts.end_weekday, weekdayForIso('2032-09-30'));
assert.equal(facts.when_relative, false);
assert.equal(facts.customer_name, 'Ada Lovelace');
assert.deepEqual(facts.collaborators, ['Bristol', 'Calvin']);
assert.equal(facts.plan.plan_id, plans.timesyncher_vacation_single.plan_id);
assert.equal(facts.plan.plan_name, 'TimeSyncher Vacation Single');
assert.equal(JSON.stringify(facts).includes(tripId), false);
assert.equal(JSON.stringify(facts).includes(ownerId), false);
assert.equal(intakeReplyBlock('See you Wednesday. What time do you land?', () => '', facts, []), 'first_intake_reply_flagged');
assert.equal(intakeReplyBlock('We can go next September. What time do you land?', () => '', facts, []), 'first_intake_reply_flagged');
assert.equal(intakeReplyBlock('Bristol and Cal can join. What time do you land?', () => '', facts, []), 'first_intake_reply_flagged');
assert.equal(intakeReplyBlock('I can add Bristol and Calvin. What about the flight? What about the car?', () => '', facts, []), 'first_intake_reply_flagged');
assert.equal(intakeReplyBlock(`${tripId} is all set. What time do you land?`, () => '', facts, [tripId]), 'first_intake_reply_flagged');
assert.equal(intakeReplyBlock('Calvin already has access. What time do you land?', () => '', facts, []), 'first_intake_reply_flagged');
assert.equal(intakeReplyBlock('It is just you and him. What time do you land?', () => '', facts, []), 'first_intake_reply_flagged');
assert.equal(intakeReplyBlock('I can add Bristol and Calvin, and I will not grant access until you agree. The plan id is timesyncher_vacation_single. What time do you land?', () => '', facts, [tripId]), '');

const gaps = firstIntakeReplyFacts({
  customerTurn: 'Maybe a trip sometime.',
  customerName: tripId,
  ids: [tripId],
  today,
});
assert.equal(gaps.shape, 'gaps');
assert.equal(gaps.customer_name, undefined);
assert.equal(JSON.stringify(gaps).includes(tripId), false);
assert.equal(intakeReplyBlock('Where are you going?', () => '', gaps, []), 'first_intake_reply_flagged');
assert.equal(intakeReplyBlock('I can start a short draft from what you said. Where are you going? How long will you be away? Who is coming? A voice note would help.', () => '', gaps, [tripId]), '');

const stored = liveTurnRecord({
  turnIndex: 4,
  role: 'app',
  modality: 'text',
  text: 'The draft is underway. What time do you land?',
  at: '2026-10-01T00:00:00.000Z',
  latencyMs: 12,
  sessionE2eMs: 20,
  jev: { jevRan: true, modelTier: 2, jevLatencyMs: 41, responseModel: tiers[2] },
  model: { called: true, responseModel: tiers[2], modelTier: 2, genLatencyMs: 88 },
});
const telemetry = appReplyTelemetry(stored);
assert.equal(telemetry.jevLatencyMs, 41);
assert.equal(telemetry.tier, 2);
assert.equal(telemetry.modelId, tiers[2]);
assert.equal(telemetry.generationMs, 88);
assert.doesNotMatch(telemetry.modelId, /gpt-.*mini/i);
assert.equal(route.includes('...appReplyTelemetry(appLive)'), true);
assert.equal(route.includes('authorId: session.customer_id'), true);
assert.equal(route.includes('viewerId: session.customer_id'), true);
assert.match(page, /turn\.authorLabel/);
assert.doesNotMatch(page, /authorLabel \|\| \(user \? 'You'/);
assert.match(route, /authorPeopleFromTrip/);
assert.match(route, /authorLabelReason/);

const people = authorPeopleFromTrip(
  { primary: { name: 'Ada Lovelace' }, seats: [{ id: collabId, displayName: 'Nico Hale' }] },
  [],
  ownerId,
);
const ownerVoice = {
  speaker: 'customer',
  direction: 'inbound',
  authorId: ownerId,
  authorName: 'Ada Lovelace',
  payload: { liveTranscript: { speakerName: 'Ada Lovelace', modality: 'voice' } },
};
const collab = { viewerId: collabId, customerName: 'Nico Hale', seat: { displayName: 'Nico Hale' } };
const ownerSeenByCollab = turnAuthorLabel(ownerVoice, collab, people);
assert.equal(ownerSeenByCollab.label, 'Ada');
assert.equal(ownerSeenByCollab.reason, '');
const ownTurn = turnAuthorLabel({ speaker: 'customer', direction: 'inbound', authorId: collabId, authorName: 'Nico Hale' }, collab, people);
assert.equal(ownTurn.label, 'You');
assert.equal(ownTurn.reason, '');
assert.equal(turnAuthorLabel({ speaker: 'app', direction: 'outbound', authorName: 'Ada Lovelace' }, collab, people).label, 'TimeSyncher');
const unnamed = turnAuthorLabel({ speaker: 'customer', direction: 'inbound', authorId: 'someone-else' }, collab, people);
assert.equal(unnamed.label, '');
assert.equal(unnamed.reason, 'author_name_missing');
assert.notEqual(unnamed.label, 'You');
assert.equal(turnAuthorLabel({ speaker: 'customer', direction: 'inbound', authorId: ownerId, authorName: 'Ada Lovelace' }, { viewerId: ownerId, customerName: 'Ada Lovelace' }, people).label, 'You');

console.log('first intake echo passed');
