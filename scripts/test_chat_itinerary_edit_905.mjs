import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applySetTimeOp,
  buildItineraryEditAuthoritativeSystemExtra,
  dayNumbersForPlace,
  offlineParseItineraryEditIntent,
  resolveItineraryEditDayNumber,
} from '../src/vacation/chat-itinerary-edit.mjs';
import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';

const craigTurn = "Please change Carbone's dinner time to 8:30 PM in the itinerary.";
const craigParsed = offlineParseItineraryEditIntent(craigTurn);
assert.equal(craigParsed.op, 'set_time');
assert.match(craigParsed.placeQuery, /carbone/i);

const trip = {
  days: [{ id: 1242, day_number: 1, title: 'Tue Jun 23' }],
  places: [
    { id: 8883, name: 'Carbone', category: 'restaurant' },
    { id: 8890, name: 'Blue Note', category: 'venue' },
  ],
  assignments: {
    1242: [
      { place_id: 8883, order_index: 4, place: { id: 8883, name: 'Carbone' } },
      { place_id: 8890, order_index: 5, place: { id: 8890, name: 'Blue Note' } },
    ],
  },
  thingOverrides: {
    'place:8883': { timeline: true, dayIds: [1242], perDaySchedule: { 1242: { startTime: '19:00' } } },
    'place:8890': { timeline: true, dayIds: [1242], perDaySchedule: { 1242: { startTime: '20:30' } } },
  },
};
assert.deepEqual(dayNumbersForPlace(trip, 8883), [1]);
assert.equal(resolveItineraryEditDayNumber({
  payload: trip, place: trip.places[0], intent: craigParsed, customerTurn: craigTurn,
}).dayNumber, 1);

const authExtra = buildItineraryEditAuthoritativeSystemExtra({
  applied: true, op: 'set_time', placeName: 'Carbone', dayNumber: 1, oldTime: '19:00', newTime: '20:30',
}, trip);
assert.match(authExtra, /AUTHORITATIVE_SYSTEM/);
assert.match(authExtra, /Never say chat cannot edit/);

const merged = { ...trip, thingOverrides: applySetTimeOp(trip, { placeId: 8883, dayId: 1242, timeHHMM: '20:30' }).thingOverrides };
const rows = buildDayTimeline(merged, merged.days[0]);
assert.ok(rows.find((r) => r.place?.id === 8883)?.conflictWith);
assert.ok(rows.find((r) => r.place?.id === 8890)?.conflictWith);

const barTurn = 'Add a bar hop before Carbone that night.';
const barParsed = offlineParseItineraryEditIntent(barTurn);
assert.equal(barParsed.op, 'add_bar_before');
assert.equal(resolveItineraryEditDayNumber({
  payload: merged,
  place: merged.places.find((p) => /carbone/i.test(p.name)),
  intent: barParsed,
  customerTurn: barTurn,
}).dayNumber, 1);

assert.equal(resolveItineraryEditDayNumber({
  payload: {
    days: [{ id: 1, day_number: 1 }, { id: 2, day_number: 2 }],
    places: [{ id: 9, name: 'Split Place' }],
    assignments: { 1: [{ place_id: 9 }], 2: [{ place_id: 9 }] },
    thingOverrides: { 'place:9': { timeline: true, dayIds: [1, 2] } },
  },
  place: { id: 9, name: 'Split Place' },
  intent: { op: 'set_time', dayNumber: null },
  customerTurn: 'move Split Place to 7 pm',
}).reason, 'ambiguous_day');

const vacationAppHtml = fs.readFileSync(new URL('../vacation-app.html', import.meta.url), 'utf8');
const vacationAppRequest = fs.readFileSync(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
assert.match(vacationAppRequest, /CHAT_SEND_TIMEOUT_MS\s*:\s*90_000/);
assert.match(vacationAppRequest, /That took too long — please try again/);
assert.match(vacationAppRequest, /initialTripIdFromSearch/);
assert.match(vacationAppHtml, /resolveCurrentTripId/);
assert.match(fs.readFileSync(new URL('../src/vacation/reply-trip-context-facts.mjs', import.meta.url), 'utf8'), /applyItineraryEditAuthoritativeReplyFacts/);
assert.match(fs.readFileSync(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8'), /itineraryEditAuthoritative/);
assert.match(fs.readFileSync(new URL('../src/vacation/chat-itinerary-edit-intent.mjs', import.meta.url), 'utf8'), /if \(offline\.op !== 'none'\) return offline/);

console.log('test_chat_itinerary_edit_905: ok');
