#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chatPlaceSearchSavedReplyFacts } from '../src/vacation/chat-place-search-when.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { draftingFacts } from '../src/vacation/live-app-turn.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const LODGING_ASK_RULE = /includes lodgingAsk\. Ask the customer where they are staying, in your own words\./;
const FLIGHT_ASK_RULE = /includes flightAsk\. Ask the customer about their flights, in your own words\./;
const GENERIC_STILL_NEEDED = /customer input that is still needed|Ask for that in your own words/i;

const lodgingFacts = draftingFacts([], 'We arrive Friday.', {
  things: [{ title: 'Swim', category: 'activity' }],
  gapAnswerTurn: true,
  gapFilledThisTurn: 'who',
  lastAskedGap: 'who',
  destination: 'Maui',
  start: '2027-03-10',
  span: { start: '2027-03-10' },
  party: { primary: { name: 'Ada' } },
});
assert.equal(lodgingFacts.lodgingAsk, true);
const lodgingGap = replyRulesSystem({}, 'Maui', 'forbidden', false, 'We arrive Friday.', { tripContext: lodgingFacts });
assert.match(lodgingGap, LODGING_ASK_RULE);
assert.doesNotMatch(lodgingGap, FLIGHT_ASK_RULE);
assert.doesNotMatch(lodgingGap, GENERIC_STILL_NEEDED);

const nonLodgingGap = draftingFacts([], 'We arrive Friday.', {
  things: [{ title: 'Kona house', category: 'hotel', metadata: { customerStatedLodging: true } }],
  needsCustomerInput: ['car'],
});
assert.equal(Object.hasOwn(nonLodgingGap, 'lodgingAsk'), false);
const nonLodgingPrompt = replyRulesSystem({}, 'Maui', 'forbidden', false, 'We arrive Friday.', { tripContext: nonLodgingGap });
assert.doesNotMatch(nonLodgingPrompt, LODGING_ASK_RULE);

const flightAsk = replyRulesSystem({}, 'Maui', 'forbidden', false, 'We land Tuesday.', {
  tripContext: {
    itinerary: ['Swim: Monday'],
    dates: '',
    roster: '',
    flightAsk: 'missing',
  },
});
assert.match(flightAsk, FLIGHT_ASK_RULE);
assert.doesNotMatch(flightAsk, LODGING_ASK_RULE);
assert.doesNotMatch(flightAsk, GENERIC_STILL_NEEDED);

const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const placeTitle = 'Paia Fish Market Restaurant';
const generated = chatPlaceSearchSavedReplyFacts([{ title: placeTitle }], savedStart, savedEnd);
const d2TripContext = await enrichDraftingTripContext({
  itinerary: [placeTitle],
  lodging: 'Paia',
  askRoster: true,
}, {
  env: {},
  placeSearchReplyFacts: generated,
  savedStart,
  savedEnd,
});
const d2System = replyRulesSystem({}, 'Maui', false, false, 'save Paia Fish Market', { tripContext: d2TripContext });
assert.doesNotMatch(d2System, LODGING_ASK_RULE);
assert.doesNotMatch(d2System, FLIGHT_ASK_RULE);
assert.doesNotMatch(d2System, GENERIC_STILL_NEEDED);

const lodgingPresent = replyRulesSystem({}, 'Maui', 'forbidden', false, 'save Paia Fish Market', {
  tripContext: {
    itinerary: ['Paia Fish Market: not on a day'],
    lodging: 'Paia',
    dates: 'Saved trip dates: Mar 10 through Mar 17.',
    roster: 'Traveling: Ada.',
  },
});
assert.doesNotMatch(lodgingPresent, LODGING_ASK_RULE);
assert.doesNotMatch(lodgingPresent, FLIGHT_ASK_RULE);
assert.doesNotMatch(lodgingPresent, GENERIC_STILL_NEEDED);

console.log(JSON.stringify({
  ok: true,
  checked: 'vacation-per-fact-ask-reply-rules',
}));
