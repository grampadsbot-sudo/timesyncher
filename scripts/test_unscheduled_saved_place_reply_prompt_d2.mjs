#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chatPlaceSearchSavedReplyFacts } from '../src/vacation/chat-place-search-when.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const placeTitle = 'Paia Fish Market Restaurant';

const generated = chatPlaceSearchSavedReplyFacts([{ title: placeTitle }], savedStart, savedEnd);
assert.ok(generated?.chatPlaceSearch?.unscheduled?.length === 1);

const tripContext = await enrichDraftingTripContext({
  itinerary: [placeTitle],
}, {
  env: {},
  placeSearchReplyFacts: generated,
  savedStart,
  savedEnd,
});

const system = replyRulesSystem({}, 'Maui', false, false, 'save Paia Fish Market', { tripContext });
const factsPrefix = system.slice(0, system.indexOf('Saved trip record:'));
const saved = system.slice(system.indexOf('Saved trip record:'));
const record = JSON.parse(saved.slice('Saved trip record: '.length).split('\n')[0]);

assert.equal(record.itinerary[0], `${placeTitle}: not on a day`);
assert.equal(record.chatPlaceSearch.unscheduled[0].title, placeTitle);
assert.equal(record.chatPlaceSearch.unscheduled[0].notOnADay, true);

const locationClarifyInvite = /\b(which|what)\s+(location|branch)\b/i;
const matchClarifyInvite = /name the matches/i;
const savedPlaceClarifyInvite = /customer input that is still needed|Ask for that in your own words/i;

assert.doesNotMatch(factsPrefix, locationClarifyInvite);
assert.doesNotMatch(factsPrefix, matchClarifyInvite);
assert.doesNotMatch(factsPrefix, savedPlaceClarifyInvite);
assert.match(factsPrefix, /Each place in unscheduled is not on a day/);
assert.match(factsPrefix, /Tell the customer that for each of those places/);

console.log(JSON.stringify({
  ok: true,
  checked: 'unscheduled-saved-place-reply-prompt-d2',
  place: placeTitle,
}));
