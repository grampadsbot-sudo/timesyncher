#!/usr/bin/env node
import assert from 'node:assert/strict';
import { replyRulesSystem } from '../scripts/vacation-app-reply-rules.mjs';
import {
  attachIntakeItineraryFromReply,
  writeIntakeItineraryFromChat,
} from '../routes/vacation-itinerary.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { assignDatesScheduling } from '../src/vacation/intake-shared-trip.mjs';
import { tripDateWindow } from '../src/vacation/intake-weekday-dates.mjs';
import { enrichDraftingTripContext } from '../src/vacation/reply-trip-context-facts.mjs';
import { intakeSharedResponse } from '../src/vacation/shared-trip-handler.mjs';

const OPENROUTER_KEYS = ['OPENROUTER_API_KEY', 'TIMESYNCHER_OPENROUTER_API_KEY', 'JEV_OPENROUTER_API_KEY'];
const savedKeys = Object.fromEntries(OPENROUTER_KEYS.map((key) => [key, process.env[key]]));
for (const key of OPENROUTER_KEYS) delete process.env[key];

function localDate(year, month, day) {
  return new Date(year, month - 1, day);
}

function chatDb(trip) {
  const things = [];
  const db = async (strings, ...values) => {
    const sql = strings.join(' ');
    if (/count\(\*\)/i.test(sql) && /trip_things/i.test(sql)) return [{ n: things.length }];
    if (/insert into trip_things/i.test(sql)) {
      const row = {
        id: `thing-${things.length + 1}`,
        trip_id: values[0],
        category: values[1],
        title: values[2],
        description: values[3] || '',
        metadata: values[4] && typeof values[4] === 'object' ? values[4] : {},
        location: {},
        ratings: {},
        source: '',
        starts_at: values[5] ?? null,
      };
      things.push(row);
      return [{ id: row.id }];
    }
    if (/update trip_things/i.test(sql)) {
      const startsAt = values[0] ?? null;
      const patch = values.find((value) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'whenLabel'));
      const id = values[values.length - 1];
      const row = things.find((item) => item.id === id);
      if (row) {
        row.starts_at = startsAt;
        if (patch) row.metadata = { ...row.metadata, ...patch };
      }
      return [];
    }
    if (/from trip_things/i.test(sql)) return things.map((row) => ({ ...row, metadata: { ...row.metadata } }));
    if (/update trips/i.test(sql)) return [];
    if (/publicSlug/i.test(sql)) return [trip];
    if (/start_date/i.test(sql) && /from trips/i.test(sql)) {
      return [{ start_date: trip.start_date, end_date: trip.end_date }];
    }
    if (/destination/i.test(sql) && /from trips/i.test(sql)) {
      return [{ destination: trip.destination, metadata: trip.metadata }];
    }
    return [];
  };
  return { db, things };
}

function tripRow(id, start, end) {
  return {
    id,
    title: 'Maui',
    destination: 'Maui',
    start_date: start,
    end_date: end,
    metadata: { publicSlug: intakeShareSlug(id), intakeShare: 'true' },
  };
}

function dayIdsFor(shared, title) {
  const place = shared.places.find((item) => item.name === title);
  assert.ok(place, title);
  const ids = shared.thingOverrides[`place:${place.id}`]?.dayIds || [];
  const dates = shared.days.filter((day) => ids.includes(day.id)).map((day) => day.date);
  return { ids, dates };
}

const saturdayThings = [
  { name: "Mama's Fish House", kind: 'restaurant', who: '', when: 'Saturday' },
  { name: 'Paia Fish Market', kind: 'restaurant', who: '', when: '' },
];

const followTrip = tripRow(
  '5ce5eb7d-10f9-4022-ae4b-85620a616116',
  localDate(2027, 3, 10),
  localDate(2027, 3, 17),
);
assert.equal(followTrip.start_date.getHours(), 0);
assert.equal(tripDateWindow(followTrip).start, '2027-03-10');
assert.equal(tripDateWindow(followTrip).end, '2027-03-17');

const follow = chatDb(followTrip);
await attachIntakeItineraryFromReply(
  follow.db,
  followTrip.id,
  "add Mama's Fish House for Saturday",
  {},
  '',
  saturdayThings,
);

const mama = follow.things.find((row) => row.title === "Mama's Fish House");
const paia = follow.things.find((row) => row.title === 'Paia Fish Market');
assert.equal(mama.metadata.source, 'chat_extraction');
assert.equal(mama.metadata.whenLabel, 'Saturday');
assert.equal(mama.metadata.customerWhen, '');
assert.equal(mama.metadata.askWhichDay, false);
assert.equal(mama.starts_at, '2027-03-13T12:00:00.000Z');
assert.equal(paia.metadata.source, 'chat_extraction');
assert.equal(paia.metadata.whenLabel, '');
assert.equal(paia.starts_at, null);
assert.equal(paia.metadata.askWhichDay, false);

const shared = await intakeSharedResponse(intakeShareSlug(followTrip.id), follow.db);
assert.equal(shared.trip.start_date, '2027-03-10');
assert.equal(shared.trip.end_date, '2027-03-17');
assert.deepEqual(dayIdsFor(shared, "Mama's Fish House").dates, ['2027-03-13']);
assert.deepEqual(dayIdsFor(shared, 'Paia Fish Market').dates, []);

const wantedThings = saturdayThings.map((thing) => ({ ...thing, source: 'chat_extraction' }));
const replyFacts = await enrichDraftingTripContext({ itinerary: [] }, {
  wantedThings,
  savedStart: followTrip.start_date,
  savedEnd: followTrip.end_date,
  env: {},
});
const unscheduled = replyFacts.chatPlaceSearch.unscheduled;
assert.equal(unscheduled.length, 1);
assert.equal(unscheduled[0].title, 'Paia Fish Market');
assert.equal(unscheduled[0].notOnADay, true);
assert.equal(replyFacts.unscheduledDayRule, 'Each place in unscheduled is not on a day yet.');
assert.deepEqual(replyFacts.chatPlaceSearch.scheduled[0].dates, ['2027-03-13']);
const system = replyRulesSystem({}, 'Maui', false, false, 'add Paia Fish Market', { tripContext: replyFacts });
assert.match(system, /not on a day yet/);

const stringTrip = tripRow('6ce5eb7d-10f9-4022-ae4b-85620a616116', '2027-03-10', '2027-03-17');
const created = chatDb(stringTrip);
await writeIntakeItineraryFromChat(created.db, stringTrip.id, 'Maui week', saturdayThings, {
  searchImpl: async () => ({ ok: true }),
});
const createdMama = created.things.find((row) => row.title === "Mama's Fish House");
assert.equal(createdMama.metadata.source, 'chat_extraction');
assert.equal(createdMama.starts_at, '2027-03-13T12:00:00.000Z');
const createdShared = await intakeSharedResponse(intakeShareSlug(stringTrip.id), created.db);
assert.deepEqual(dayIdsFor(createdShared, "Mama's Fish House").dates, ['2027-03-13']);

const ambiguousStart = localDate(2027, 3, 6);
const ambiguousEnd = localDate(2027, 3, 19);
const ambiguousWindow = tripDateWindow({ start_date: ambiguousStart, end_date: ambiguousEnd });
const ambiguousSchedule = assignDatesScheduling(
  { whenLabel: 'Saturday', customerWhen: '' },
  ambiguousWindow.year,
  ambiguousWindow.tripDates,
);
assert.equal(ambiguousSchedule.weekdayAmbiguous, true);
assert.equal(ambiguousSchedule.candidateDates.length, 2);

const ambiguousTrip = tripRow('7ce5eb7d-10f9-4022-ae4b-85620a616116', ambiguousStart, ambiguousEnd);
const ambiguous = chatDb(ambiguousTrip);
await attachIntakeItineraryFromReply(
  ambiguous.db,
  ambiguousTrip.id,
  "add Mama's Fish House for Saturday",
  {},
  '',
  [{ name: "Mama's Fish House", kind: 'restaurant', who: '', when: 'Saturday' }],
);
const ambiguousMama = ambiguous.things[0];
assert.equal(ambiguousMama.starts_at, null);
assert.equal(ambiguousMama.metadata.askWhichDay, true);
assert.deepEqual(ambiguousMama.metadata.candidateDates, ambiguousSchedule.candidateDates);
const ambiguousShared = await intakeSharedResponse(intakeShareSlug(ambiguousTrip.id), ambiguous.db);
assert.deepEqual(dayIdsFor(ambiguousShared, "Mama's Fish House").dates, []);

for (const key of OPENROUTER_KEYS) {
  if (savedKeys[key] === undefined) delete process.env[key];
  else process.env[key] = savedKeys[key];
}

console.log(JSON.stringify({
  ok: true,
  checked: 'chat-extraction-saturday-day',
  saturday: '2027-03-13',
  ambiguous: ambiguousSchedule.candidateDates,
}));
