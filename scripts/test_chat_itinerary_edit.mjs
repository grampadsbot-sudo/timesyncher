import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  applyAddBarBeforeOp,
  applySetTimeOp,
  loadChatItineraryEditConfig,
  offlineParseItineraryEditIntent,
  resolvePlaceByQuery,
  selectNearestBarBeforeAnchor,
  shareSlugEditGuardDecision,
} from '../src/vacation/chat-itinerary-edit.mjs';
import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';

function verifyBarBeforeAnchorOnDay(payload, { anchorName, dayNumber, anchorHHMM }) {
  const day = payload.days?.find((d) => Number(d.day_number) === Number(dayNumber));
  if (!day) return { ok: false };
  const entries = buildDayTimeline(payload, day);
  const anchor = resolvePlaceByQuery(payload, anchorName);
  const anchorEntry = entries.find((e) => String(e.place?.id) === String(anchor.place?.id));
  const barEntry = entries.find((e) => /bar|cocktail|wine bar|pub/i.test(`${e.place?.name || ''} ${e.place?.category || ''}`));
  if (!anchorEntry || !barEntry) return { ok: false };
  if (anchorEntry.startLabel !== anchorHHMM && anchorEntry.startLabel !== '20:30') return { ok: false };
  return { ok: entries.indexOf(barEntry) < entries.indexOf(anchorEntry) };
}
import { webAccessCookieName, webAccessTokenHash } from '../src/vacation/web-access.mjs';
import { runChatItineraryEditTurn } from '../src/vacation/chat-itinerary-edit.mjs';

const chatEditTripId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee8611';
const chatEditOwnerId = '22222222-2222-2222-2222-222222222222';
const chatEditEnv = { TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'chat-itinerary-edit-861-salt' };
const copySlug = 'chat-edit-copy-a47f5a7f2150c5e887a81972';

function makeChatItineraryEditDbStub({ sessionToken, edits = [] } = {}) {
  const sessionHash = webAccessTokenHash(sessionToken, chatEditEnv);
  const storedEdits = edits;
  return async (strings, ...values) => {
    const query = String(strings.raw ? strings.raw.join('?') : strings);
    if (/create table if not exists vacation_web_access_grants/i.test(query)) return [];
    if (/alter table vacation_web_access_grants/i.test(query)) return [];
    if (/create unique index if not exists vacation_web_access_active_email_idx/i.test(query)) return [];
    if (/from vacation_web_access_grants/i.test(query) && /session_token_hash/i.test(query)) {
      if (values.includes(sessionHash)) {
        return [{
          id: 'grant-861',
          trip_id: chatEditTripId,
          owner_customer_id: chatEditOwnerId,
          role: 'owner',
          status: 'accepted',
        }];
      }
      return [];
    }
    if (/from trips/i.test(query) && /customer_id/i.test(query)) {
      return [{ customer_id: chatEditOwnerId }];
    }
    if (/update vacation_web_access_grants/i.test(query)) return [];
    if (/create table if not exists chat_itinerary_edits/i.test(query)) return [];
    if (/create table if not exists chat_itinerary_anchor_state/i.test(query)) return [];
    if (/from chat_itinerary_edits/i.test(query) && /order by created_at desc/i.test(query)) {
      const tripId = values.find((v) => v === chatEditTripId);
      if (!tripId) return [];
      if (!storedEdits.length) return [];
      return [storedEdits[storedEdits.length - 1]];
    }
    if (/insert into chat_itinerary_edits/i.test(query)) {
      const tripId = values[0];
      const shareSlug = values[1];
      const beforeJson = values[4];
      const afterJson = values[5];
      storedEdits.push({
        trip_id: tripId,
        share_slug: shareSlug,
        before_json: beforeJson,
        after_json: afterJson,
        created_at: new Date().toISOString(),
      });
      return [];
    }
    if (/insert into chat_itinerary_anchor_state/i.test(query)) return [];
    throw new Error(`unexpected query in chat itinerary edit db stub: ${query}`);
  };
}

function miniPayload() {
  return {
    days: [{ id: 502, day_number: 2, title: 'Day 2' }],
    places: [
      {
        id: 610,
        name: 'Carbone',
        lat: 40.726,
        lng: -73.9997,
        category: 'restaurant',
        place_time: '19:00',
      },
      {
        id: 689,
        name: 'Zinc Bar',
        lat: 40.7295,
        lng: -73.9992,
        category: 'bar',
        description: 'jazz bar cocktails',
      },
      {
        id: 670,
        name: 'Amelie Bistro & Wine Bar',
        lat: 40.8,
        lng: -73.97,
        category: 'wine bar',
      },
    ],
    assignments: {
      502: [
        {
          place_id: 610,
          place: { id: 610, name: 'Carbone' },
          order_index: 0,
        },
      ],
    },
    thingOverrides: {
      'place:610': {
        timeline: true,
        dayIds: [502],
        perDaySchedule: {
          502: { startTime: '19:00', duration: '120 min' },
        },
      },
    },
  };
}

assert.equal(shareSlugEditGuardDecision('8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y').ok, false);
assert.equal(shareSlugEditGuardDecision('8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y').reason, 'demo_locked');
const cfg = loadChatItineraryEditConfig();
const fakeAllow = { allowlist: ['8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y', 'copy-slug-test'], demoLocked: cfg.demoLocked };
assert.equal(shareSlugEditGuardDecision('8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y', fakeAllow).ok, false);
assert.equal(shareSlugEditGuardDecision('copy-slug-test', fakeAllow).ok, true);
assert.equal(shareSlugEditGuardDecision('not-listed', fakeAllow).ok, false);

const payload = miniPayload();
const resolved = resolvePlaceByQuery(payload, 'Carbone');
assert.equal(resolved.status, 'ok');
assert.equal(resolved.place.id, 610);
const ambiguous = resolvePlaceByQuery({ places: [{ id: 1, name: 'Carbone A' }, { id: 2, name: 'Carbone B' }] }, 'Carbone');
assert.equal(ambiguous.status, 'ambiguous');

const setTime = applySetTimeOp(payload, { placeId: 610, dayId: 502, timeHHMM: '20:30' });
assert.deepEqual(Object.keys(setTime.before), ['place:610']);
assert.equal(setTime.thingOverrides['place:610'].perDaySchedule['502'].startTime, '20:30');
assert.equal(setTime.thingOverrides['place:611'], undefined);

const barPick = selectNearestBarBeforeAnchor(
  { ...payload, thingOverrides: setTime.thingOverrides },
  payload.places.find((p) => p.id === 610),
  502,
);
assert.equal(barPick.id, 689);

const withDinner = { ...payload, thingOverrides: setTime.thingOverrides };
const barApplied = applyAddBarBeforeOp(withDinner, {
  barPlaceId: 689,
  anchorPlaceId: 610,
  dayId: 502,
  anchorStartHHMM: '20:30',
  barDurationMin: 60,
});
withDinner.thingOverrides = barApplied.thingOverrides;
withDinner.assignments = {
  ...withDinner.assignments,
  502: [
    ...withDinner.assignments[502],
    { place_id: 689, place: { id: 689, name: 'Zinc Bar' }, order_index: 1 },
  ],
};
withDinner.thingOverrides['place:689'].timeline = true;
const verify = verifyBarBeforeAnchorOnDay(withDinner, {
  anchorName: 'Carbone',
  dayNumber: 2,
  anchorHHMM: '20:30',
});
assert.equal(verify.ok, true);

const parsed = offlineParseItineraryEditIntent('move dinner at Carbone to 8:30 PM on Day 2');
assert.equal(parsed.op, 'set_time');
assert.match(parsed.placeQuery, /Carbone/i);

const noAccess = await runChatItineraryEditTurn({
  db: null,
  trip: { id: 'trip-1', metadata: { sharedToken: 'lane-test-slug' } },
  customerTurn: 'move dinner at Carbone to 8:30 PM on Day 2',
  httpReq: { headers: {} },
  env: { CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  fetchPayload: async () => miniPayload(),
  putOverrides: async ({ overrides }) => { putBody = overrides; },
  extractIntent: offlineParseItineraryEditIntent,
});
assert.equal(noAccess.applied, false);
assert.equal(noAccess.reason, 'web_edit_access_required');

const topLevelAllowlisted = await runChatItineraryEditTurn({
  db: null,
  trip: { id: 'trip-1', metadata: null, shareToken: 'lane-test-slug' },
  customerTurn: 'move dinner at Carbone to 8:30 PM on Day 2',
  httpReq: { headers: {} },
  env: { CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  fetchPayload: async () => miniPayload(),
  putOverrides: async () => {},
  extractIntent: offlineParseItineraryEditIntent,
});
assert.equal(topLevelAllowlisted.applied, false);
assert.equal(topLevelAllowlisted.reason, 'web_edit_access_required');

const topLevelDemoLocked = await runChatItineraryEditTurn({
  db: null,
  trip: { id: 'trip-1', metadata: null, shareToken: '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y' },
  customerTurn: 'move dinner at Carbone to 8:30 PM on Day 2',
  httpReq: { headers: {} },
  env: { CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  fetchPayload: async () => miniPayload(),
  putOverrides: async () => {},
  extractIntent: offlineParseItineraryEditIntent,
});
assert.equal(topLevelDemoLocked.applied, false);
assert.equal(topLevelDemoLocked.reason, 'demo_locked');

const configText = fs.readFileSync(new URL('../config/chat-itinerary-edit-trips.json', import.meta.url), 'utf8');
assert.match(configText, /demo_locked/);
assert.doesNotMatch(configText, /8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y.*allowlist/);

const queueSource = fs.readFileSync(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8');
assert.match(queueSource, /prepareChatItineraryEditForQueueTurn/);

const requestJs = fs.readFileSync(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
assert.match(requestJs, /itineraryEdit/);

const undoParsed = offlineParseItineraryEditIntent('please undo that last change');
assert.equal(undoParsed.op, 'undo');

const ownerSession = 'chat-edit-owner-session-861';
const ownerHttpReq = {
  headers: { cookie: `${webAccessCookieName()}=${encodeURIComponent(ownerSession)}` },
};
const chatEditTrip = { id: chatEditTripId, metadata: { sharedToken: copySlug } };
let liveOverrides = structuredClone(miniPayload().thingOverrides);
const fetchLivePayload = async () => ({
  ...miniPayload(),
  thingOverrides: structuredClone(liveOverrides),
});
let lastPutOverrides = null;
const capturePutOverrides = async ({ overrides }) => {
  lastPutOverrides = structuredClone(overrides);
  liveOverrides = structuredClone(overrides);
};

const nothingUndoDb = makeChatItineraryEditDbStub({ sessionToken: ownerSession });
const nothingUndo = await runChatItineraryEditTurn({
  db: nothingUndoDb,
  trip: chatEditTrip,
  customerTurn: 'undo',
  httpReq: ownerHttpReq,
  env: { ...chatEditEnv, CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  fetchPayload: fetchLivePayload,
  putOverrides: capturePutOverrides,
  extractIntent: offlineParseItineraryEditIntent,
});
assert.equal(nothingUndo.applied, false);
assert.equal(nothingUndo.reason, 'nothing_to_undo');
assert.deepEqual(nothingUndo.client, { applied: false, reason: 'nothing_to_undo' });
assert.equal(lastPutOverrides, null);

liveOverrides = structuredClone(miniPayload().thingOverrides);
lastPutOverrides = null;
const setTimeDb = makeChatItineraryEditDbStub({ sessionToken: ownerSession });
const setTimeTurn = await runChatItineraryEditTurn({
  db: setTimeDb,
  trip: chatEditTrip,
  customerTurn: 'move dinner at Carbone to 8:30 PM on Day 2',
  turnId: 'turn-set-time-861',
  httpReq: ownerHttpReq,
  env: { ...chatEditEnv, CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  fetchPayload: fetchLivePayload,
  putOverrides: capturePutOverrides,
  extractIntent: offlineParseItineraryEditIntent,
});
assert.equal(setTimeTurn.applied, true);
assert.equal(setTimeTurn.op, 'set_time');
assert.equal(liveOverrides['place:610'].perDaySchedule['502'].startTime, '20:30');

const undoTurn = await runChatItineraryEditTurn({
  db: setTimeDb,
  trip: chatEditTrip,
  customerTurn: 'undo',
  httpReq: ownerHttpReq,
  env: { ...chatEditEnv, CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  fetchPayload: fetchLivePayload,
  putOverrides: capturePutOverrides,
  extractIntent: offlineParseItineraryEditIntent,
});
assert.equal(undoTurn.applied, true);
assert.equal(undoTurn.op, 'undo');
assert.deepEqual(undoTurn.client, { applied: true, op: 'undo' });
assert.equal(lastPutOverrides['place:610'].perDaySchedule['502'].startTime, '19:00');

const undoDemoLocked = await runChatItineraryEditTurn({
  db: null,
  trip: { id: chatEditTripId, metadata: { sharedToken: '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y' } },
  customerTurn: 'undo',
  httpReq: ownerHttpReq,
  env: { CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' },
  fetchPayload: async () => miniPayload(),
  putOverrides: async () => {},
  extractIntent: offlineParseItineraryEditIntent,
});
assert.equal(undoDemoLocked.applied, false);
assert.equal(undoDemoLocked.reason, 'demo_locked');

console.log('test_chat_itinerary_edit: ok');
