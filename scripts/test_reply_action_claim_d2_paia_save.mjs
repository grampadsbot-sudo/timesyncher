#!/usr/bin/env node
/**
 * Live D-d2 prompt at f0123cb for trip d3e19eb8-56c4-45a3-8cf0-008b99b9366e,
 * customer turn 95db8a4a-8a91-4d3b-8f3d-f8a4766db2c8, "save Paia Fish Market".
 * Vercel log on dpl_3iNwjxDhuQ4WC75HVRqebf5vQxwH:
 * {"reason":"reply_action_claim_unscheduled_place_day","tripId":"d3e19eb8-56c4-45a3-8cf0-008b99b9366e"}
 * Paia was saved with no day. The draft named a weekday. Rebuilt from the smoke
 * turns (hi, Maui March 10-17 2027 with my wife, add Mama's Fish House for Saturday,
 * save Paia Fish Market) and the f0123cb reply facts path.
 *
 * The in-turn save lists only Paia, so applyInTurnCitablePlaces drops Mama's
 * Saturday from the itinerary. That weekday stays in recent_turns from d1.
 * Before the fix the system still said to use a day already on the saved trip
 * record and to keep an activity on the day already named. After the fix those
 * lines are absent whenever a saved place is not on a day.
 */
import assert from 'node:assert/strict';
import { chatPlaceSearchSavedReplyFacts } from '../src/vacation/chat-place-search-when.mjs';
import { annotateLiveTurnGapAnswer, mergeSavedTripGapFields } from '../src/vacation/gap-ask-reply-context.mjs';
import { completeRosterParty, draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { replyRequestBody, replyRulesSystem } from './vacation-app-reply-rules.mjs';

const customerTurn = 'save Paia Fish Market';
const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const priorTurns = [
  { role: 'customer', text: 'hi' },
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
const span = {
  start: savedStart,
  end: savedEnd,
  spanLabel: 'Wed Mar 10\u2013Wed Mar 17 2027',
};
const saved = {
  destination: 'Maui',
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
  inTurnPlaceResults: [{
    name: 'Paia Fish Market Restaurant',
    title: 'Paia Fish Market Restaurant',
    sourceRef: { source: 'trip_thing', id: '95db8a4a-8a91-4d3b-8f3d-f8a4766db2c8' },
  }],
});
const rules = { ok: true, notes_where: 'day_only_place_optional' };
const system = replyRulesSystem(rules, 'Maui', 'forbidden', false, customerTurn, { tripContext });
const request = replyRequestBody({
  rules,
  customerTurn,
  stage: 'vacation_conversation',
  screen: 'vacation-app',
  modelTier: 2,
  responseModel: 'qwen/qwen3-235b-a22b-2507',
  destination: 'Maui',
  memory: priorTurns,
  upsell: 'forbidden',
  tripContext,
});
const savedRecord = JSON.parse(system.slice(system.indexOf('Saved trip record: ') + 'Saved trip record: '.length).split('\n')[0]);
const paiaLine = 'Paia Fish Market Restaurant: not on a day';
const absent = [
  'use only a day that is already on the saved trip record',
  'Do not move an activity off the day already named.',
  'name the day (required)',
];
const violations = absent.filter((line) => system.includes(line));
assert.deepEqual(violations, []);
assert.equal(system.includes('A saved place that is not on a day stays off every weekday. A weekday already used by a different activity is not a day for that place.'), true);
assert.deepEqual(savedRecord.itinerary, [paiaLine]);
assert.equal(savedRecord.notCitableAsResult.includes("Mama's Fish House"), true);
assert.equal(savedRecord.chatPlaceSearch.unscheduled[0].title, 'Paia Fish Market Restaurant');
assert.equal(savedRecord.chatPlaceSearch.unscheduled[0].notOnADay, true);
assert.equal(savedRecord.chatPlaceSearch.unscheduled[0].whenLabel, undefined);
assert.equal(JSON.stringify(savedRecord.itinerary).includes('Paia Fish Market Restaurant: Saturday'), false);
assert.equal(request.recent_turns.some((turn) => turn.text === "add Mama's Fish House for Saturday"), true);
assert.equal(request.customer_turn, customerTurn);

console.log(JSON.stringify({
  ok: true,
  checked: 'd2-paia-save-prompt-facts',
  customerTurnId: '95db8a4a-8a91-4d3b-8f3d-f8a4766db2c8',
  tripId: 'd3e19eb8-56c4-45a3-8cf0-008b99b9366e',
}));
