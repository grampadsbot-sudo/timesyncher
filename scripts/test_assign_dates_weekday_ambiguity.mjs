#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assignDates, assignDatesScheduling, sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';
import {
  REPLY_ACTION_CLAIM_UNSCHEDULED_PLACE_DAY,
  replyActionClaimReason,
} from '../src/vacation/reply-action-claim.mjs';
import { chatPlaceSearchSavedReplyFacts } from '../src/vacation/chat-place-search-when.mjs';

function addDay(iso) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const mauiTrip = [];
for (let cursor = '2027-03-10'; cursor <= '2027-03-17'; cursor = addDay(cursor)) mauiTrip.push(cursor);

assert.deepEqual(
  assignDates({ whenLabel: 'Saturday', customerWhen: '' }, 2027, mauiTrip),
  ['2027-03-13'],
);
assert.deepEqual(
  assignDates({ whenLabel: 'Saturday dinner', customerWhen: '' }, 2027, mauiTrip),
  ['2027-03-13'],
);

const twoSaturdayTrip = [];
for (let cursor = '2027-03-06'; twoSaturdayTrip.length < 14; cursor = addDay(cursor)) {
  twoSaturdayTrip.push(cursor);
}
const ambiguous = assignDatesScheduling({ whenLabel: 'Saturday dinner', customerWhen: '' }, 2027, twoSaturdayTrip);
assert.deepEqual(ambiguous.dates, []);
assert.equal(ambiguous.weekdayAmbiguous, true);
assert.equal(ambiguous.candidateDates.length, 2);

const facts = chatPlaceSearchSavedReplyFacts([
  { title: 'Farmers market', whenLabel: 'Saturday dinner', customerWhen: '' },
], twoSaturdayTrip[0], twoSaturdayTrip[twoSaturdayTrip.length - 1]);
const unscheduled = facts.chatPlaceSearch.unscheduled[0];
assert.equal(unscheduled.title, 'Farmers market');
assert.equal(unscheduled.whenLabel, 'Saturday dinner');
assert.equal(unscheduled.weekdayAmbiguous, true);
assert.deepEqual(unscheduled.candidateDates, ambiguous.candidateDates);
assert.match(facts.chatPlaceSearch.weekdayAmbiguityRule || '', /ask which day/i);

const sharedAmbiguous = sharedTripFromIntake({
  trip: { id: 'trip-ambig', start_date: twoSaturdayTrip[0], end_date: twoSaturdayTrip[twoSaturdayTrip.length - 1] },
  things: [{
    id: 'farmers',
    title: 'Farmers market',
    category: 'restaurant',
    source: 'brave',
    metadata: { whenLabel: 'Saturday dinner', customerWhen: '' },
  }],
});
const place = sharedAmbiguous.places[0];
const dayIds = sharedAmbiguous.thingOverrides[`place:${place.id}`]?.dayIds || [];
assert.deepEqual(dayIds, []);

assert.equal(
  replyActionClaimReason(
    'I added Farmers market to Saturday for you.',
    null,
    { unscheduledChatPlaceTitles: ['Farmers market'] },
  ),
  REPLY_ACTION_CLAIM_UNSCHEDULED_PLACE_DAY,
);

console.log('test_assign_dates_weekday_ambiguity: ok');
