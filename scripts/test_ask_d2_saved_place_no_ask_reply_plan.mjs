#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chatPlaceSearchSavedReplyFacts } from '../src/vacation/chat-place-search-when.mjs';
import { draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { classifyTurn } from '../src/vacation/turn-tags.mjs';
import { classifyVacationAppCustomerTurnTag } from '../src/vacation/vacation-app-turn-tag.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const DAY_REQUIRED_NOTES = /name the day \(required\)/i;

const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const placeTitle = 'Paia Fish Market Restaurant';
const customerTurn = 'save Paia Fish Market';

const placeSaveTag = classifyTurn({
  text: customerTurn,
  speaker: 'customer',
  direction: 'inbound',
  channel: 'vacation-app',
  payload: { contentTags: ['restaurants_food'] },
});
assert.equal(placeSaveTag.ask, false);
assert.notEqual(placeSaveTag.category, 'needs_ask');
assert.equal(placeSaveTag.category, 'travel_research');
assert.equal(placeSaveTag.tags.includes('restaurants_food'), true);

const { turnTag } = await classifyVacationAppCustomerTurnTag({
  requestText: customerTurn,
  tripId: '285c0510-1403-4609-bee7-66ae1636134b',
  placeSearchTurn: true,
  classification: { ok: true, intake: false, category: 'restaurant' },
  payload: {},
});
assert.equal(turnTag.ask, false);
assert.equal(turnTag.category, 'travel_research');

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
assert.equal(tripContext.chatPlaceSearch.unscheduled[0].notOnADay, true);
assert.equal(tripContext.unscheduledDayRule, undefined);

const system = replyRulesSystem({}, 'Maui', false, false, customerTurn, { tripContext });
assert.doesNotMatch(system, DAY_REQUIRED_NOTES);
assert.doesNotMatch(system, /includes lodgingAsk\./);
assert.doesNotMatch(system, /Tell the customer that for each of those places/);

const lodgedFacts = draftingFacts([], customerTurn, {
  things,
  statedLodgingArea: 'Paia',
  span: { spanLabel: 'Mar 10 through Mar 17' },
});
assert.equal(lodgedFacts.lodgingAsk, undefined);
assert.equal(lodgedFacts.needsCustomerInput, undefined);

const lodgedContext = await enrichDraftingTripContext({ ...lodgedFacts, lodging: 'Paia' }, {
  env: {},
  things,
  placeSearchReplyFacts: generated,
  savedStart,
  savedEnd,
});
assert.equal(lodgedContext.lodgingAsk, undefined);

const inTurnPlaceResults = [{
  name: placeTitle,
  title: placeTitle,
  sourceRef: { source: 'trip_thing', id: 'paia-in-turn-save' },
}];
const livePathContext = await enrichDraftingTripContext(draftingFacts(
  [{ role: 'customer', text: "add Mama's Fish House for Saturday" }],
  customerTurn,
  { things, span: { spanLabel: 'Mar 10 through Mar 17' } },
), {
  env: {},
  things,
  savedStart,
  savedEnd,
  inTurnPlaceResults,
});
assert.equal(livePathContext.chatPlaceSearch.unscheduled[0].notOnADay, true);
const livePathSystem = replyRulesSystem({}, 'Maui', false, false, customerTurn, { tripContext: livePathContext });
assert.doesNotMatch(livePathSystem, DAY_REQUIRED_NOTES);
assert.doesNotMatch(livePathSystem, /\bwhich day works best\b/i);
assert.match(livePathSystem, /not on a day/);

console.log(JSON.stringify({
  ok: true,
  checked: 'ask-d2-saved-place-no-ask-reply-plan',
  turnTagCategory: turnTag.category,
}));
