import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyAddBarBeforeOp,
  applyAssignmentCreateOnPayload,
  applyAssignmentMoveOnPayload,
  applySetTimeOp,
  buildItineraryEditAuthoritativeSystemExtra,
  dayNumbersForPlace,
  DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY,
  offlineParseItineraryEditIntent,
  placeAssignedOnDay,
  prepareChatItineraryEditForQueueTurn,
  resolveItineraryEditDayNumber,
  runChatItineraryEditTurn,
} from '../src/vacation/chat-itinerary-edit.mjs';
import { assignedDayNumbersForPlace, producedDemoLockedChatEditReply } from '../src/vacation/chat-itinerary-edit-day.mjs';
import { boundedAwait } from '../src/vacation/bounded-await.mjs';
import {
  assertChatEditPutStaysSmallUnderHugeOverrides,
  buildChatItineraryOverridesPutBody,
  mergeStoredChatItineraryScheduleOverride,
} from '../src/vacation/chat-itinerary-edit-day.mjs';
import { webAccessCookieName, webAccessTokenHash } from '../src/vacation/web-access.mjs';

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
const carboneStored = {
  'place:8977': {
    timeline: true,
    dayIds: [1250],
    perDaySchedule: { 1250: { startTime: '21:15' } },
  },
};
const barAdd = applyAddBarBeforeOp(
  {
    thingOverrides: structuredClone(carboneStored),
    places: [
      { id: 8977, name: 'Carbone' },
      { id: 9061, name: 'Zinc Bar', category: 'bar', lat: 40.7295, lng: -73.9992 },
    ],
    assignments: { 1250: [{ place_id: 8977 }] },
  },
  { barPlaceId: 9061, anchorPlaceId: 8977, dayId: 1250, anchorStartHHMM: '21:15', barDurationMin: 60 },
);
const barPut = buildChatItineraryOverridesPutBody({
  before: barAdd.before,
  after: barAdd.after,
  keys: barAdd.keys,
  stored: carboneStored,
});
assert.equal(barPut['place:8977'].perDaySchedule['1250'].startTime, '21:15');
assert.equal(barPut['place:9061'].perDaySchedule['1250'].startTime, '20:15');
const mergedPartial = mergeStoredChatItineraryScheduleOverride(
  multiDayStored['place:610'],
  { timeline: true, perDaySchedule: { 501: { startTime: '19:30' } } },
);
assert.equal(mergedPartial.perDaySchedule['502'].startTime, '19:00');

const seqPayload = () => ({
  trip: { id: 199 },
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
  putAssignmentMove: async ({ newDayId }) => {
    seqStored = applyAssignmentMoveOnPayload(seqStored, {
      placeId: 8977,
      fromDayId: 1250,
      toDayId: newDayId,
      assignmentId: seqStored.assignments[1250]?.[0]?.id ?? 8914,
    });
  },
  postDayAssignment: async ({ dayId, placeId }) => {
    seqStored = applyAssignmentCreateOnPayload(seqStored, { placeId, dayId });
  },
});
assert.equal((await runSeqTurn('Move Carbone to 9:15 PM on Day 1')).op, 'set_time');
assert.equal(seqStored.thingOverrides['place:8977'].perDaySchedule['1250'].startTime, '21:15');
assert.equal((await runSeqTurn('Add a bar hop before Carbone on Day 1')).op, 'add_bar_before');
assert.equal(seqStored.thingOverrides['place:8977'].perDaySchedule['1250'].startTime, '21:15');
assert.equal(seqPuts[1]['place:8977'].perDaySchedule['1250'].startTime, '21:15');
assert.equal(seqPuts[1]['place:9061'].perDaySchedule['1250'].startTime, '20:15');

const stalled = await boundedAwait(new Promise(() => {}), 40, () => 'fallback');
assert.equal(stalled, 'fallback');

function copyShapePayload() {
  return {
    trip: { id: 199 },
    days: [
      { id: 1250, day_number: 1, title: 'Day 1' },
      { id: 1251, day_number: 2, title: 'Day 2' },
    ],
    places: [
      { id: 8977, name: 'Carbone', lat: 40.726, lng: -73.9997, category: 'restaurant', place_time: '21:15' },
      { id: 9061, name: 'Zinc Bar', lat: 40.7295, lng: -73.9992, category: 'bar', description: 'jazz bar cocktails' },
    ],
    assignments: {
      1250: [{
        id: 8914, day_id: 1250, place_id: 8977, order_index: 3, place: { id: 8977, name: 'Carbone' },
      }],
      1251: [],
    },
    thingOverrides: {
      'place:8977': { timeline: true, dayIds: [1250], perDaySchedule: { 1250: { startTime: '21:15' } } },
    },
  };
}

let copyStored = copyShapePayload();
const copyEditEnv = { TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'chat-edit-copy-859' };
const copySession = 'mock-owner-session';
const copySessionHash = webAccessTokenHash(copySession, copyEditEnv);
const copyDb = async (parts, ...values) => {
  const sql = parts.join('?').replace(/\s+/g, ' ').trim();
  if (/^create |^alter /.test(sql)) return [];
  if (/from vacation_web_access_grants/.test(sql) && /session_token_hash/.test(sql)) {
    if (values.includes(copySessionHash)) {
      return [{
        id: 'grant-copy',
        trip_id: 'trip-copy-859',
        role: 'owner',
        owner_customer_id: 'owner-copy',
        status: 'accepted',
      }];
    }
    return [];
  }
  if (/from trips/.test(sql) && /customer_id/.test(sql)) return [{ customer_id: 'owner-copy' }];
  if (/update vacation_web_access_grants/.test(sql)) return [];
  if (/insert into chat_itinerary_edits/.test(sql)) return [];
  if (/insert into chat_itinerary_anchor_state/.test(sql)) return [];
  if (/anchor_place_id from chat_itinerary_anchor_state/.test(sql)) return [{ anchor_place_id: '8977' }];
  if (/from chat_itinerary_edits/.test(sql)) return [];
  throw new Error(`unexpected_mock_sql: ${sql}`);
};
const runCopyTurn = (customerTurn) => runChatItineraryEditTurn({
  db: copyDb,
  trip: { id: 'trip-copy-859', metadata: { sharedToken: copySlug } },
  customerTurn,
  httpReq: { headers: { cookie: `${webAccessCookieName()}=${encodeURIComponent(copySession)}` } },
  env: { ...copyEditEnv, CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  extractIntent: offlineParseItineraryEditIntent,
  fetchPayload: async () => structuredClone(copyStored),
  putOverrides: async ({ overrides }) => {
    mergeSharedOverrides(copyStored.thingOverrides, overrides);
  },
  putAssignmentMove: async ({ newDayId }) => {
    copyStored = applyAssignmentMoveOnPayload(copyStored, {
      placeId: 8977,
      fromDayId: 1250,
      toDayId: newDayId,
      assignmentId: 8914,
    });
  },
  postDayAssignment: async ({ dayId, placeId }) => {
    copyStored = applyAssignmentCreateOnPayload(copyStored, { placeId, dayId });
  },
});

assert.deepEqual(assignedDayNumbersForPlace(copyShapePayload(), 8977), [1]);
const turn1 = await runCopyTurn('Move Carbone to 8:30 PM on Day 2');
assert.equal(turn1.applied, true, turn1.reason);
assert.equal(turn1.op, 'set_time');
assert.ok(placeAssignedOnDay(copyStored, 8977, 1251));
assert.ok(!placeAssignedOnDay(copyStored, 8977, 1250));
const day2 = copyStored.days.find((d) => d.day_number === 2);
const day2Rows = buildDayTimeline(copyStored, day2);
const carboneRow = day2Rows.find((r) => r.place?.id === 8977);
assert.ok(carboneRow, 'Carbone on Day 2 timeline');
assert.equal(carboneRow.startLabel, '20:30');
const day1 = copyStored.days.find((d) => d.day_number === 1);
assert.ok(!buildDayTimeline(copyStored, day1).some((r) => r.place?.id === 8977));

const turn2 = await runCopyTurn('Add a bar hop at Zinc Bar before Carbone on Day 2');
assert.equal(turn2.applied, true, turn2.reason);
assert.equal(turn2.op, 'add_bar_before');
assert.ok(placeAssignedOnDay(copyStored, 9061, 1251));
const day2AfterBar = buildDayTimeline(copyStored, day2);
const zincRow = day2AfterBar.find((r) => r.place?.id === 9061);
assert.ok(zincRow, 'Zinc Bar on Day 2 timeline');
const carboneAfterBar = day2AfterBar.find((r) => r.place?.id === 8977);
assert.ok(day2AfterBar.indexOf(zincRow) < day2AfterBar.indexOf(carboneAfterBar));
assert.equal(copyStored.thingOverrides['place:9061'].perDaySchedule['1251'].startTime, '19:30');

const trekBase = String(process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://travel.timesyncher.com').replace(/\/+$/, '');
const oversizeLogs = [];
const origConsoleError = console.error;
const origFetch = globalThis.fetch;
console.error = (...args) => { oversizeLogs.push(args); origConsoleError(...args); };
try {
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes('/overrides') && init?.method === 'PUT') return { ok: false, status: 413, text: async () => 'request entity too large' };
    if (href.includes('/assignments/') && init?.method === 'PUT') return { ok: true, status: 200, json: async () => ({}) };
    if (href.includes('/api/shared/') && (!init?.method || init.method === 'GET')) return { ok: true, status: 200, json: async () => copyShapePayload() };
    return origFetch(url, init);
  };
  const queueOversize = await prepareChatItineraryEditForQueueTurn({
    db: copyDb,
    trip: { id: 'trip-copy-859', metadata: { sharedToken: copySlug } },
    tripId: 'trip-copy-859',
    seat: null,
    requestText: 'Move Carbone to 8:30 PM on Day 2',
    turnId: 'turn-oversize-859',
    httpReq: { headers: { cookie: `${webAccessCookieName()}=${encodeURIComponent(copySession)}` } },
    env: { ...copyEditEnv, CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1', TIMESYNCHER_TREK_PUBLIC_BASE_URL: trekBase },
  });
  assert.equal(queueOversize.itineraryEditResult?.client?.reason, 'edit_failed');
  const logged = oversizeLogs.find((args) => args[0] === 'chat_itinerary_edit_failed');
  assert.ok(logged);
  assert.match(String(logged[1]), /trek_edit_write_failed 413/);
  assert.equal(logged[2], 'status=413');
} finally { console.error = origConsoleError; globalThis.fetch = origFetch; }

const bulkMb = 'x'.repeat(10 * 1024 * 1024);
await assertChatEditPutStaysSmallUnderHugeOverrides((extra) => runChatItineraryEditTurn({
  db: copyDb,
  trip: { id: 'trip-copy-859', metadata: { sharedToken: copySlug } },
  customerTurn: 'Move Carbone to 8:30 PM on Day 2',
  httpReq: { headers: { cookie: `${webAccessCookieName()}=${encodeURIComponent(copySession)}` } },
  env: { ...copyEditEnv, CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  extractIntent: offlineParseItineraryEditIntent,
  putAssignmentMove: async ({ newDayId }) => {
    copyStored = applyAssignmentMoveOnPayload(copyStored, { placeId: 8977, fromDayId: 1250, toDayId: newDayId, assignmentId: 8914 });
  },
  postDayAssignment: async ({ dayId, placeId }) => {
    copyStored = applyAssignmentCreateOnPayload(copyStored, { placeId, dayId });
  },
  ...extra,
}), {
  payload: {
    ...copyShapePayload(),
    thingOverrides: {
      ...copyShapePayload().thingOverrides,
      'place:6999': { evidenceDossier: { pages: [{ body: bulkMb }] } },
    },
  },
});

const queueSource = fs.readFileSync(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8');
assert.match(queueSource, /createBoundedRewriteClaim/);
assert.match(queueSource, /createBoundedReplyShipGate/);

const demoSlug = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';
const lockedPrep = await prepareChatItineraryEditForQueueTurn({
  db: async () => [],
  trip: { id: 'trip-lock-905', metadata: { sharedToken: demoSlug } },
  tripId: 'trip-lock-905',
  seat: null,
  requestText: 'Add a bar hop before Carbone that night.',
  httpReq: { headers: {} },
  env: {},
});
assert.equal(lockedPrep.itineraryEditResult?.reason, 'demo_locked');
assert.equal(lockedPrep.itineraryEditCannedReply, DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY);
assert.equal(lockedPrep.itineraryEditAuthoritative, '');
assert.doesNotMatch(lockedPrep.itineraryEditCannedReply, /saved record|unscheduled items|isn't on a specific day|Carbone isn't|trip website|AUTHORITATIVE_SYSTEM/i);
const queueRoute = fs.readFileSync(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8');
assert.match(queueRoute, /itineraryEditCannedReply/);
assert.match(queueRoute, /producedDemoLockedChatEditReply/);
assert.doesNotMatch(queueRoute, /buildItineraryEditDemoLockedAuthoritativeSystemExtra/);
const cannedBranch = queueRoute.match(/if \(itineraryEditCannedReply\) produced = producedDemoLockedChatEditReply\(itineraryEditCannedReply\);/);
assert.ok(cannedBranch);
const produced = producedDemoLockedChatEditReply(DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY);
assert.equal(produced.reply, DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY);
assert.equal(produced.jev?.jevRan, false);
assert.equal(produced.jev?.reason, 'demo_locked_chat_edit');
assert.equal(produced.model, null);

console.log('test_chat_itinerary_edit_905: ok');
