import assert from 'node:assert/strict';
import fs, { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createChatEditCopyAcceptance } from './acceptance-chat-edit-copy-server.mjs';
import { buildChatItineraryOverridesPutBody } from '../src/vacation/chat-itinerary-edit-day.mjs';
import { applySetTimeOp } from '../src/vacation/chat-itinerary-edit.mjs';
import {
  offlineParseItineraryEditIntent,
  resolvePlaceByQuery,
  runChatItineraryEditTurn,
} from '../src/vacation/chat-itinerary-edit.mjs';
import { webAccessCookieName, webAccessTokenHash } from '../src/vacation/web-access.mjs';
import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
import { placeAssignedOnDay } from '../src/vacation/chat-itinerary-edit-assignment.mjs';

const copySlug = 'chat-edit-copy-a47f5a7f2150c5e887a81972';
const nycSharedFixture = JSON.parse(
  fs.readFileSync(new URL('./fixtures/nyc-screen-trip99-live-shared-api.json', import.meta.url), 'utf8'),
);
const nycCarbone = nycSharedFixture.places.find((p) => /carbone/i.test(p.name || ''));
const nycDay2 = nycSharedFixture.days.find((d) => Number(d.day_number) === 2);
const nycSetTime = applySetTimeOp(nycSharedFixture, {
  placeId: nycCarbone.id,
  dayId: nycDay2.id,
  timeHHMM: '20:30',
});
const nycPut = buildChatItineraryOverridesPutBody({
  before: nycSetTime.before,
  after: nycSetTime.after,
  keys: nycSetTime.keys,
  stored: nycSharedFixture.thingOverrides,
});
assert.equal(Object.keys(nycPut).length, 1, 'PUT must include only touched override keys');
assert.ok(nycPut[`place:${nycCarbone.id}`]);
assert.equal(
  Buffer.byteLength(JSON.stringify({ overrides: nycPut }), 'utf8') < 16 * 1024,
  true,
  'PUT body must stay small on full NYC override map',
);

function copyShapePayload() {
  return {
    trip: { id: 200 },
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
const copyEditEnv = { TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'acceptance-859-copy' };
const copySession = 'acceptance-copy-session';
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

const mergeSharedOverrides = (thingOverrides, patch) => {
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
};

function issueCopyTripPayload() {
  return {
    trip: { id: 199 },
    days: [
      { id: 1242, day_number: 1, title: 'Day 1' },
      { id: 1243, day_number: 2, title: 'Day 2' },
    ],
    places: [
      { id: 8883, name: 'Carbone', lat: 40.726, lng: -73.9997, category: 'restaurant', place_time: '21:15' },
      { id: 8967, name: 'Zinc Bar', lat: 40.7295, lng: -73.9992, category: 'bar', description: 'jazz bar cocktails' },
    ],
    assignments: {
      1242: [{
        id: 8001, day_id: 1242, place_id: 8883, order_index: 3, place: { id: 8883, name: 'Carbone' },
      }],
      1243: [],
    },
    thingOverrides: {
      'place:8883': { timeline: true, dayIds: [1242], perDaySchedule: { 1242: { startTime: '21:15' } } },
    },
  };
}

const issueStored = issueCopyTripPayload();
assert.equal(resolvePlaceByQuery(issueStored, 'Carbone').place.id, 8883);
assert.equal(resolvePlaceByQuery(issueStored, 'Zinc Bar').place.id, 8967);

const runIssueCopyTurn = (customerTurn) => runChatItineraryEditTurn({
  db: copyDb,
  trip: { id: 'trip-copy-859', metadata: { sharedToken: copySlug } },
  customerTurn,
  httpReq: { headers: { cookie: `${webAccessCookieName()}=${encodeURIComponent(copySession)}` } },
  env: { ...copyEditEnv, CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  extractIntent: offlineParseItineraryEditIntent,
  fetchPayload: async () => structuredClone(issueStored),
  putOverrides: async ({ overrides }) => {
    mergeSharedOverrides(issueStored.thingOverrides, overrides);
  },
  putAssignmentMove: async ({ newDayId }) => {
    const { applyAssignmentMoveOnPayload } = await import('../src/vacation/chat-itinerary-edit-assignment.mjs');
    Object.assign(issueStored, applyAssignmentMoveOnPayload(issueStored, {
      placeId: 8883,
      fromDayId: 1242,
      toDayId: newDayId,
      assignmentId: 8001,
    }));
  },
  postDayAssignment: async ({ dayId, placeId }) => {
    const { applyAssignmentCreateOnPayload } = await import('../src/vacation/chat-itinerary-edit-assignment.mjs');
    Object.assign(issueStored, applyAssignmentCreateOnPayload(issueStored, { placeId, dayId }));
  },
});

const issueDay2 = issueStored.days.find((d) => d.day_number === 2);
const issueTurn1 = await runIssueCopyTurn('Move Carbone to 8:30 PM on Day 2');
assert.equal(issueTurn1.applied, true, issueTurn1.reason || issueTurn1.replyContext);
assert.ok(placeAssignedOnDay(issueStored, 8883, issueDay2.id));
const issueCarboneRow = buildDayTimeline(issueStored, issueDay2).find((r) => r.place?.id === 8883);
assert.equal(issueCarboneRow?.startLabel, '20:30');

const issueTurn2 = await runIssueCopyTurn('Add a bar hop at Zinc Bar before Carbone on day 2.');
assert.equal(issueTurn2.applied, true, issueTurn2.reason || issueTurn2.replyContext);
assert.ok(placeAssignedOnDay(issueStored, 8967, issueDay2.id));

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
    const { applyAssignmentMoveOnPayload } = await import('../src/vacation/chat-itinerary-edit-assignment.mjs');
    copyStored = applyAssignmentMoveOnPayload(copyStored, {
      placeId: 8977,
      fromDayId: 1250,
      toDayId: newDayId,
      assignmentId: 8914,
    });
  },
  postDayAssignment: async ({ dayId, placeId }) => {
    const { applyAssignmentCreateOnPayload } = await import('../src/vacation/chat-itinerary-edit-assignment.mjs');
    copyStored = applyAssignmentCreateOnPayload(copyStored, { placeId, dayId });
  },
});

const turn1 = await runCopyTurn('Move Carbone to 8:30 PM on Day 2');
assert.equal(turn1.applied, true, turn1.reason || turn1.replyContext);
assert.equal(turn1.op, 'set_time');
const day2 = copyStored.days.find((d) => d.day_number === 2);
assert.ok(placeAssignedOnDay(copyStored, 8977, day2.id));
const carboneRow = buildDayTimeline(copyStored, day2).find((r) => r.place?.id === 8977);
assert.ok(carboneRow);
assert.equal(carboneRow.startLabel, '20:30');

const turn2 = await runCopyTurn('Add a bar hop at Zinc Bar before Carbone on day 2.');
assert.equal(turn2.applied, true, turn2.reason || turn2.replyContext);
assert.equal(turn2.op, 'add_bar_before');
assert.ok(placeAssignedOnDay(copyStored, 9061, day2.id));

const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'acceptance-859-copy-'));
writeFileSync(path.join(fixtureDir, 'chat-edit-copy-shared.json'), JSON.stringify(copyStored));
const harness = await createChatEditCopyAcceptance({
  checkout: process.cwd(),
  fixtureDir,
  cfg: { copy_shared_token: copySlug, throwaway_trip_id: 'trip-copy-859' },
  env: { TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'acceptance-859-copy' },
});
assert.equal(harness.slug, copySlug);
const harnessTurn = await harness.handleVacationItineraryPost({
  tripId: 'trip-copy-859',
  text: 'Move Carbone to 8:30 PM on Day 2',
});
assert.equal(harnessTurn.ok, true);
assert.equal(harnessTurn.itineraryEdit?.applied, true);

console.log('test_acceptance_859_chat_edit_put_small: ok');
