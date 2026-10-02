#!/usr/bin/env node
import assert from 'node:assert/strict';
import { firstIntakeReplyFacts, intakeReplyBlockReasons } from '../src/vacation/first-intake-reply.mjs';
import { inTurnPlaceReplyViolation } from '../src/vacation/chat-place-search.mjs';
import { chatPlaceSearchSavedReplyFacts } from '../src/vacation/chat-place-search-when.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { intakeSharedResponse } from '../src/vacation/shared-trip-handler.mjs';
import { testSingleOwnerPlan } from './fixtures/reply-plan-test-fixtures.mjs';

const customerTurn = 'Maui March 10-17 2027 with my wife';
const savedStart = '2027-03-10';
const savedEnd = '2027-03-17';
const customerName = 'a2 220af47';

function intakeInput(roster) {
  return {
    customerTurn,
    roster,
    extractedDestination: 'Maui',
    savedStart,
    savedEnd,
    customerName,
    ownerPlan: testSingleOwnerPlan,
    tripId: '285c0510-1403-4609-bee7-66ae1636134b',
  };
}

const ownerRoster = [{ name: 'wife', role: 'owner', age: null }];
const collaboratorRoster = [{ name: 'wife', role: 'collaborator', age: null }];
const ownerFacts = firstIntakeReplyFacts(intakeInput(ownerRoster));
const collaboratorFacts = firstIntakeReplyFacts(intakeInput(collaboratorRoster));
assert.equal(ownerFacts.shape, 'voice-note');
assert.equal(collaboratorFacts.shape, 'voice-note');
assert.deepEqual(ownerFacts.who, ['wife']);
assert.deepEqual(ownerFacts.collaborators, collaboratorFacts.collaborators);
assert.deepEqual(ownerFacts.gaps, collaboratorFacts.gaps);
const oneQuestion = 'I am building your Maui trip from Wednesday, March 10 to Wednesday, March 17, 2027, seven nights with your wife. I can add your wife. Where are you staying?';
assert.deepEqual(intakeReplyBlockReasons(oneQuestion, () => '', ownerFacts, []), []);

const selfFacts = firstIntakeReplyFacts({
  ...intakeInput([{ name: customerName, role: 'owner', age: null }]),
});
assert.equal(selfFacts.shape, 'gaps');
assert.equal(selfFacts.who, undefined);

const paiaResults = [
  { name: 'Paia Fish Market Restaurant', title: 'Paia Fish Market Restaurant' },
  { name: 'Paia Fish Market South Side', title: 'Paia Fish Market South Side' },
  { name: "Mama's Fish House", title: "Mama's Fish House" },
];
const datedReply = "Shepherd, you're set for Maui from March 10–17, 2027. Paia Fish Market South Side is saved and not on a day yet.";
assert.equal(inTurnPlaceReplyViolation(datedReply, paiaResults), null);
const bareMonth = inTurnPlaceReplyViolation('We ate at March after the market.', paiaResults);
assert.equal(bareMonth?.invented?.includes('March'), true);
const invented = inTurnPlaceReplyViolation('Try lunch at Secret Taco Cove near the hotel.', paiaResults);
assert.equal(invented?.status, 'unsourced_place');
assert.ok(invented?.invented?.includes('Secret Taco Cove'));

const replyFacts = {
  itinerary: ['Paia Fish Market South Side'],
  chatPlaceSearch: {
    scheduled: [],
    unscheduled: [{ title: 'Paia Fish Market South Side', notOnADay: true }],
    unscheduledDayRule: 'Each place in unscheduled is not on a day. Tell the customer that for each of those places.',
  },
  unscheduledDayRule: 'Each place in unscheduled is not on a day. Tell the customer that for each of those places.',
};
const system = replyRulesSystem({}, 'Maui', false, false, 'save Paia Fish Market', { tripContext: replyFacts });
const saved = system.slice(system.indexOf('Saved trip record:'));
const record = JSON.parse(saved.slice('Saved trip record: '.length).split('\n')[0]);
assert.equal(record.chatPlaceSearch.unscheduled[0].title, 'Paia Fish Market South Side');
assert.equal(record.chatPlaceSearch.unscheduled[0].notOnADay, true);
assert.match(system.slice(0, system.indexOf('Saved trip record:')), /Tell the customer that for each of those places/);

const generated = chatPlaceSearchSavedReplyFacts([
  { title: 'Paia Fish Market Restaurant' },
  { title: 'Paia Fish Market South Side' },
  { title: "Mama's Fish House" },
], savedStart, savedEnd);
const staged = await enrichDraftingTripContext({
  itinerary: [
    'Paia Fish Market Restaurant',
    'Paia Fish Market South Side',
    "Mama's Fish House: Saturday",
  ],
}, { env: {}, placeSearchReplyFacts: generated });
assert.deepEqual(staged.itinerary, [
  'Paia Fish Market Restaurant: not on a day',
  'Paia Fish Market South Side: not on a day',
  "Mama's Fish House: Saturday",
]);
const stagedSystem = replyRulesSystem({}, 'Maui', false, false, 'save Paia Fish Market', { tripContext: staged });
const stagedSaved = stagedSystem.slice(stagedSystem.indexOf('Saved trip record:'));
const stagedRecord = JSON.parse(stagedSaved.slice('Saved trip record: '.length).split('\n')[0]);
assert.equal(stagedRecord.itinerary[1], 'Paia Fish Market South Side: not on a day');
assert.equal(stagedRecord.chatPlaceSearch.unscheduled[1].notOnADay, true);
assert.equal(stagedRecord.chatPlaceSearch.unscheduled.some((row) => row.title === "Mama's Fish House"), false);
assert.match(stagedSystem.slice(0, stagedSystem.indexOf('Saved trip record:')), /Tell the customer that for each of those places/);

const tripId = '285c0510-1403-4609-bee7-66ae1636134b';
const slug = intakeShareSlug(tripId);
const trip = {
  id: tripId,
  title: 'Maui',
  destination: 'Maui',
  start_date: new Date('2027-03-10T00:00:00.000Z'),
  end_date: new Date('2027-03-17T00:00:00.000Z'),
  metadata: { publicSlug: slug, intakeShare: 'true' },
};
const things = [
  {
    id: '8bc21a74-9643-4472-b12d-bfb829dc0506',
    category: 'restaurant',
    title: "Mama's Fish House",
    description: '',
    metadata: { whenLabel: 'Saturday', customerWhen: '', source: 'chat_extraction', askWhichDay: false },
    ratings: {},
    location: {},
    source: '',
    starts_at: new Date('2027-03-13T12:00:00.000Z'),
  },
  {
    id: 'starts-only-paia',
    category: 'restaurant',
    title: 'Starts Only Cafe',
    description: '',
    metadata: { whenLabel: '', customerWhen: '', source: 'chat_extraction', askWhichDay: false },
    ratings: {},
    location: {},
    source: '',
    starts_at: '2027-03-13T12:00:00Z',
  },
];
const db = async (strings) => {
  const sql = strings.join(' ');
  if (/from trips/i.test(sql)) return [trip];
  if (/from trip_things/i.test(sql)) return things.map((row) => ({ ...row, metadata: { ...row.metadata } }));
  return [];
};
const shared = await intakeSharedResponse(slug, db);
function datesFor(title) {
  const place = shared.places.find((item) => item.name === title);
  assert.ok(place, title);
  const ids = shared.thingOverrides[`place:${place.id}`].dayIds;
  return shared.days.filter((day) => ids.includes(day.id)).map((day) => day.date);
}
assert.deepEqual(datesFor("Mama's Fish House"), ['2027-03-13']);
assert.deepEqual(datesFor('Starts Only Cafe'), ['2027-03-13']);

console.log(JSON.stringify({
  ok: true,
  checked: 'staging-smoke-r21-inputs',
  intakeShape: ownerFacts.shape,
  unscheduled: record.chatPlaceSearch.unscheduled[0].title,
  day: '2027-03-13',
}));
