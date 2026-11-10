import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applySetTimeOp,
  buildItineraryEditAuthoritativeSystemExtra,
  dayNumbersForPlace,
  offlineParseItineraryEditIntent,
  resolveItineraryEditDayNumber,
  runChatItineraryEditTurn,
} from '../src/vacation/chat-itinerary-edit.mjs';
import {
  buildChatItineraryOverridesPutBody,
  mergeStoredChatItineraryScheduleOverride,
} from '../src/vacation/chat-itinerary-edit-day.mjs';
import { webAccessCookieName } from '../src/vacation/web-access.mjs';

const copySlug = 'chat-edit-copy-a47f5a7f2150c5e887a81972';

function mergeSharedOverrides(thingOverrides, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!value || typeof value !== 'object' || !Object.keys(value).length) {
      delete thingOverrides[key];
      continue;
    }
    const prior = { ...(thingOverrides[key] || {}) };
    thingOverrides[key] = { ...prior, ...value };
    if (value.perDaySchedule && typeof value.perDaySchedule === 'object') {
      thingOverrides[key].perDaySchedule = { ...(prior.perDaySchedule || {}), ...value.perDaySchedule };
    }
  }
}
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

const multiDayStored = {
  'place:610': {
    timeline: true,
    dayIds: [501, 502],
    perDaySchedule: {
      501: { startTime: '18:00', duration: '90' },
      502: { startTime: '19:00', duration: '120' },
    },
  },
};
const dayOneOnly = applySetTimeOp(
  { thingOverrides: structuredClone(multiDayStored) },
  { placeId: 610, dayId: 501, timeHHMM: '19:30' },
);
const dayOnePut = buildChatItineraryOverridesPutBody({
  before: dayOneOnly.before,
  after: dayOneOnly.after,
  keys: dayOneOnly.keys,
  stored: multiDayStored,
});
assert.equal(dayOnePut['place:610'].perDaySchedule['501'].startTime, '19:30');
assert.equal(dayOnePut['place:610'].perDaySchedule['502'].startTime, '19:00');
const mergedPartial = mergeStoredChatItineraryScheduleOverride(
  multiDayStored['place:610'],
  { timeline: true, perDaySchedule: { 501: { startTime: '19:30' } } },
);
assert.equal(mergedPartial.perDaySchedule['502'].startTime, '19:00');

const seqPayload = () => ({
  days: [{ id: 1250, day_number: 1, title: 'Day 1' }],
  places: [
    { id: 8977, name: 'Carbone', lat: 40.726, lng: -73.9997, category: 'restaurant', place_time: '19:00' },
    { id: 9061, name: 'Zinc Bar', lat: 40.7295, lng: -73.9992, category: 'bar', description: 'jazz bar cocktails' },
  ],
  assignments: { 1250: [{ place_id: 8977, place: { id: 8977, name: 'Carbone' }, order_index: 0 }] },
  thingOverrides: { 'place:8977': { timeline: true } },
});
let seqStored = seqPayload();
const seqPuts = [];
const seqDb = async (parts) => {
  const sql = parts.join('?').replace(/\s+/g, ' ').trim();
  if (/^create |^alter |^insert |^update /.test(sql)) return [];
  if (/^select \* from vacation_web_access_grants/.test(sql)) {
    return [{ id: 'grant-seq', role: 'owner', owner_customer_id: 'owner-seq' }];
  }
  if (/^select customer_id from trips/.test(sql)) return [{ customer_id: 'owner-seq' }];
  if (/^select anchor_place_id from chat_itinerary_anchor_state/.test(sql)) return [{ anchor_place_id: '8977' }];
  if (/^select \* from chat_itinerary_edits/.test(sql)) return [];
  throw new Error(`unexpected_mock_sql: ${sql}`);
};
const runSeqTurn = (customerTurn) => runChatItineraryEditTurn({
  db: seqDb,
  trip: { id: 'trip-seq-925', metadata: { sharedToken: copySlug } },
  customerTurn,
  httpReq: { headers: { cookie: `${webAccessCookieName()}=mock-owner-session` } },
  env: { CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  extractIntent: offlineParseItineraryEditIntent,
  fetchPayload: async () => structuredClone(seqStored),
  putOverrides: async ({ overrides }) => {
    seqPuts.push(structuredClone(overrides));
    mergeSharedOverrides(seqStored.thingOverrides, overrides);
  },
});
assert.equal((await runSeqTurn('Move Carbone to 9:15 PM on Day 1')).op, 'set_time');
assert.equal(seqStored.thingOverrides['place:8977'].perDaySchedule['1250'].startTime, '21:15');
assert.equal((await runSeqTurn('Add a bar hop before Carbone on Day 1')).op, 'add_bar_before');
assert.equal(seqStored.thingOverrides['place:8977'].perDaySchedule['1250'].startTime, '21:15');
assert.deepEqual(Object.keys(seqPuts[1]), ['place:9061']);

console.log('test_chat_itinerary_edit_905: ok');
