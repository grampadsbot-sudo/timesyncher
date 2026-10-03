#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chatPlaceSearchSavedReplyFacts } from '../src/vacation/chat-place-search-when.mjs';
import { draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { classifyVacationAppCustomerTurnTag } from '../src/vacation/vacation-app-turn-tag.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const LODGING_ASK_RULE = /includes lodgingAsk\. Ask the customer where they are staying, in your own words\./;
const DAY_REQUIRED_NOTES = /name the day \(required\)/i;

const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const placeTitle = 'Paia Fish Market Restaurant';
const customerTurn = 'save Paia Fish Market';

const { turnTag } = await classifyVacationAppCustomerTurnTag({
  requestText: customerTurn,
  tripId: '285c0510-1403-4609-bee7-66ae1636134b',
  placeSearchTurn: true,
  webResearchTurn: false,
  classification: { ok: true, intake: false },
  payload: {},
});
assert.equal(turnTag.ask, false);
assert.notEqual(turnTag.category, 'needs_ask');

const things = [
  { title: "Mama's Fish House", whenLabel: 'Saturday', customerWhen: '', category: 'restaurant' },
  { title: placeTitle, whenLabel: '', customerWhen: '', category: 'restaurant' },
];
const generated = chatPlaceSearchSavedReplyFacts([{ title: placeTitle }], savedStart, savedEnd);
const tripContext = await enrichDraftingTripContext(draftingFacts(
  [{ role: 'customer', text: "add Mama's Fish House for Saturday" }],
  customerTurn,
  { things, span: { spanLabel: 'Mar 10 through Mar 17' } },
), {
  env: {},
  things,
  placeSearchReplyFacts: generated,
  savedStart,
  savedEnd,
});
assert.equal(tripContext.lodging, undefined);
assert.equal(tripContext.lodgingAsk, undefined);
assert.equal(tripContext.needsCustomerInput, undefined);
assert.match(String(tripContext.unscheduledDayRule || ''), /not on a day/);

const system = replyRulesSystem({}, 'Maui', false, false, customerTurn, { tripContext });
assert.doesNotMatch(system, LODGING_ASK_RULE);
assert.doesNotMatch(system, DAY_REQUIRED_NOTES);
assert.match(system, /Tell the customer that for each of those places/);

const withLodging = await enrichDraftingTripContext({
  ...draftingFacts([], customerTurn, { things }),
  lodging: 'Paia',
}, {
  env: {},
  things,
  placeSearchReplyFacts: generated,
  savedStart,
  savedEnd,
});
assert.equal(withLodging.lodging, 'Paia');
assert.equal(withLodging.lodgingAsk, undefined);
const lodgedSystem = replyRulesSystem({}, 'Maui', false, false, customerTurn, { tripContext: withLodging });
assert.doesNotMatch(lodgedSystem, LODGING_ASK_RULE);

console.log(JSON.stringify({
  ok: true,
  checked: 'ask-d2-saved-place-no-ask-reply-plan',
  turnTagCategory: turnTag.category,
}));
