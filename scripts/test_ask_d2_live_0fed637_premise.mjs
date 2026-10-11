#!/usr/bin/env node
/**
 * ASK-d2 repro at 0fed637. Staging trip a9832c18-32fa-4a99-926b-98dd306e8b44,
 * customer turn 80059df2-a044-4e43-8205-5ba80bdb3726, request e0198eef-8445-4a09-80b6-4e77ddac38b5.
 * Customer text "save Paia Fish Market". Stored turnTag travel_research, ask false.
 * Stored jev routeType notes_where, needsDayForNote 0.32, model tier 2
 * qwen/qwen3-235b-a22b-2507. Things on the trip at reply time are Mama's Fish House
 * (Saturday) and Paia Fish Market Restaurant (no day). The live reply asked which
 * afternoon to drop in.
 *
 * Rebuilds the system and user messages callOpenRouterTieredChat sends for that turn.
 */
import assert from 'node:assert/strict';
import { chatPlaceSearchSavedReplyFacts } from '../src/vacation/chat-place-search-when.mjs';
import { annotateLiveTurnGapAnswer, mergeSavedTripGapFields } from '../src/vacation/gap-ask-reply-context.mjs';
import { completeRosterParty, draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { placeResultExtra } from '../src/vacation/provider-result-context.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { loadVacationAppReplyRules, replyRequestBody, replyRulesSystem } from './vacation-app-reply-rules.mjs';

const customerTurn = 'save Paia Fish Market';
const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const paiaId = 'f9d0cc63-157c-4afc-aa2c-a0f7bfe8e7e0';
const priorTurns = [
  { role: 'customer', text: 'Maui March 10-17 2027 with my wife' },
  { role: 'customer', text: "add Mama's Fish House for Saturday" },
];
const things = [
  {
    title: "Mama's Fish House",
    category: 'restaurant',
    who: '',
    whenLabel: 'Saturday',
    customerWhen: '',
    notes: ["add Mama's Fish House for Saturday"],
  },
  {
    title: 'Paia Fish Market Restaurant',
    category: 'restaurant',
    who: '',
    whenLabel: '',
    customerWhen: '',
    notes: [],
    sourceRef: { id: 'loc4DKZTNV325I2EAJ44QKQTHDDDYBYCKK4BGBM64BQ=', source: 'brave' },
  },
];
const placeSearchReplyFacts = chatPlaceSearchSavedReplyFacts(
  [{ title: 'Paia Fish Market Restaurant', whenLabel: '', customerWhen: '' }],
  savedStart,
  savedEnd,
);
const inTurnPlaceResults = [{
  name: 'Paia Fish Market Restaurant',
  title: 'Paia Fish Market Restaurant',
  sourceRef: { source: 'trip_thing', id: paiaId },
}];
const span = {
  start: savedStart,
  end: savedEnd,
  spanLabel: 'Wed Mar 10\u2013Wed Mar 17 2027',
};
const saved = {
  destination: 'Maui',
  start: '2027-03-10T00:00:00.000Z',
  end: '2027-03-17T00:00:00.000Z',
  party: {
    editors: [],
    primary: { name: 'D Trip', role: 'Owner' },
    sources: [],
    viewers: [],
    collaborators: [],
    preference_subjects: [],
  },
  planOwned: false,
  things,
  rule: '',
};
const party = completeRosterParty({
  party: saved.party,
  customerName: 'D Trip',
  turns: [...priorTurns, { role: 'customer', text: customerTurn }],
  roster: [],
  rosterError: null,
});
const merged = annotateLiveTurnGapAnswer({
  destination: saved.destination,
  start: span.start,
  end: span.end,
  span,
  things,
  party,
  planOwned: false,
  rule: '',
  ...mergeSavedTripGapFields(saved),
}, saved, { wantedThings: [] });
const facts = draftingFacts(priorTurns, customerTurn, merged);
const tripContext = await enrichDraftingTripContext(facts, {
  things,
  env: {},
  placeSearchReplyFacts,
  savedStart,
  savedEnd,
  wantedThings: [],
  inTurnPlaceResults,
});
const rules = await loadVacationAppReplyRules({});
const jev = {
  jevRan: true,
  modelTier: 2,
  routeType: 'notes_where',
  extraContext: {
    routeType: 'notes_where',
    needsDayForNote: 0.32,
    modelTierScore: 0.72,
    modelTierConfidence: 0.28,
  },
  via: 'openrouter-decisions',
  responseModel: 'qwen/qwen3-235b-a22b-2507',
};
const systemExtra = [
  tripContext.roster || '',
  'When you list who is coming, name every traveler in the saved roster. Do not add a name that is not in that roster.',
  placeResultExtra(inTurnPlaceResults),
].filter(Boolean).join(' ');
const request = replyRequestBody({
  rules,
  jev,
  customerTurn,
  stage: 'vacation_conversation',
  screen: 'vacation-app',
  modelTier: jev.modelTier,
  responseModel: jev.responseModel,
  destination: 'Maui',
  memory: priorTurns.map((turn) => ({ role: turn.role, text: turn.text })),
  upsell: 'forbidden',
  tripContext,
  planTable: null,
});
const messages = [
  {
    role: 'system',
    content: `${replyRulesSystem(rules, 'Maui', 'forbidden', false, customerTurn, { tripContext, planOwned: false })}${systemExtra ? `\n\n${systemExtra}` : ''}`,
  },
  { role: 'user', content: JSON.stringify(request) },
];
const stored = messages.map((message) => message.content).join('\n');
console.log(JSON.stringify({ storedPrompt: messages }, null, 2));

const solicitations = [
  [/needsDayForNote/, 'needsDayForNote'],
  [/notes_where/, 'notes_where route'],
  [/day_only_place_optional|day_required_place_optional/, 'day-required notes_where value'],
  [/name the day/i, 'name the day'],
  [/\bwhich day\b/i, 'which day'],
  [/Day is required/i, 'Day is required'],
  [/ask which day/i, 'ask which day'],
  [/Ask the customer for anything they haven't said/, 'ask for anything unsaid'],
  [/Tell the customer that for each of those places/, 'unscheduled day imperative'],
];
const violations = solicitations.filter(([pattern]) => pattern.test(stored)).map(([, label]) => label);
assert.equal(tripContext.chatPlaceSearch.unscheduled[0].notOnADay, true);
assert.match(stored, /Paia Fish Market Restaurant: not on a day/);
assert.deepEqual(violations, []);
