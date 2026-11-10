import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyAddBarBeforeOp,
  applyAssignmentCreateOnPayload,
  applyAssignmentMoveOnPayload,
  applySetTimeOp,
  coalesceChatItineraryEditIntent,
  DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY,
  loadChatItineraryEditConfig,
  normalizeItineraryPlaceQuery,
  offlineParseItineraryEditIntent,
  prepareChatItineraryEditForQueueTurn,
  resolvePlaceByQuery,
  runChatItineraryEditTurn,
  selectNearestBarBeforeAnchor,
  shareSlugEditGuardDecision,
} from '../src/vacation/chat-itinerary-edit.mjs';

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
import { webAccessCookieName, webAccessTokenHash } from '../src/vacation/web-access.mjs';

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
      const beforeJson = typeof values[4] === 'string' ? JSON.parse(values[4]) : values[4];
      const afterJson = typeof values[5] === 'string' ? JSON.parse(values[5]) : values[5];
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
    if (/from chat_itinerary_anchor_state/i.test(query) && /anchor_place_id/i.test(query)) return [];
    throw new Error(`unexpected query in chat itinerary edit db stub: ${query}`);
  };
}

function miniPayload() {
  return {
    trip: { id: 199 },
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

const moveDay2 = offlineParseItineraryEditIntent('Move Carbone to 8:30 PM on Day 2');
assert.equal(moveDay2.op, 'set_time');
assert.equal(moveDay2.placeQuery, 'Carbone');
assert.equal(moveDay2.dayNumber, 2);
assert.equal(parseTime(moveDay2.time), '20:30');

const barBefore = offlineParseItineraryEditIntent('Add a bar hop at Zinc Bar before Carbone on Day 2');
assert.equal(barBefore.op, 'add_bar_before');
assert.match(barBefore.placeQuery, /Carbone/i);

assert.equal(normalizeItineraryPlaceQuery('Move Carbone'), 'carbone');
const coalesced = coalesceChatItineraryEditIntent(
  { op: 'none' },
  moveDay2,
);
assert.deepEqual(coalesced, moveDay2);
const coalescedMerge = coalesceChatItineraryEditIntent(
  { op: 'set_time', placeQuery: '', dayNumber: null, time: '8:30 PM' },
  moveDay2,
);
assert.equal(coalescedMerge.placeQuery, 'Carbone');
assert.equal(coalescedMerge.dayNumber, 2);

function parseTime(raw) {
  const m = String(raw || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  const mer = m[3];
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

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
assert.equal(topLevelDemoLocked.reason, 'demo_locked');
assert.equal(topLevelDemoLocked.applied, false);
const configText = fs.readFileSync(new URL('../config/chat-itinerary-edit-trips.json', import.meta.url), 'utf8');
assert.match(configText, /demo_locked/);
assert.doesNotMatch(configText, /8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y.*allowlist/);

const demoSlug = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';
assert.ok(cfg.demoLocked.includes(demoSlug));
assert.ok(!cfg.allowlist.includes(demoSlug));
assert.ok(cfg.allowlist.includes(copySlug));
assert.equal(shareSlugEditGuardDecision(demoSlug, { allowlist: [demoSlug], demoLocked: [] }).reason, 'demo_locked');

const turns = [
  ['set_time', 'move dinner at Carbone to 8:30 PM on Day 2'],
  ['add_bar_before', 'add a bar before dinner at Carbone, on Day 2'],
  ['undo', 'undo the last itinerary change'],
];
const authenticatedHeaders = { cookie: `${webAccessCookieName()}=mock-owner-session` };
const slugFields = ['sharedToken', 'shareToken', 'publicSlug', 'source_token', 'slug'];
const lockedTrips = slugFields.flatMap((field) => [
  { id: 'trip-1', metadata: { [field]: demoSlug } },
  { id: 'trip-1', [field]: demoSlug },
]);
lockedTrips.push({ id: 'trip-1', share_token: demoSlug });
for (const [op, customerTurn] of turns) {
  assert.equal(offlineParseItineraryEditIntent(customerTurn).op, op);
  for (const trip of lockedTrips) {
    for (const headers of [{}, authenticatedHeaders, { 'x-timesyncher-web-access-token': 'mock-owner-session' }]) {
      const stored = miniPayload();
      const before = structuredClone(stored);
      const calls = [];
      const result = await runChatItineraryEditTurn({
        trip, customerTurn, httpReq: { headers }, env: {},
        db: async () => { calls.push('db'); throw new Error('locked_trip_db_access'); },
        fetchPayload: async () => { calls.push('fetch'); return stored; },
        putOverrides: async () => { calls.push('put'); },
        extractIntent: async () => { calls.push('intent'); return offlineParseItineraryEditIntent(customerTurn); },
      });
      assert.equal(result.applied, false, op);
      assert.equal(result.reason, 'demo_locked', op);
      assert.equal(result.client.reason, 'demo_locked', op);
      assert.equal(result.replyContext, '', op);
      assert.deepEqual(calls, [], op);
      assert.deepEqual(stored, before, op);
    }
  }
}

for (const [op, customerTurn] of turns) {
  let stored = miniPayload();
  const original = structuredClone(stored);
  const writes = [];
  const audit = [];
  const db = async (parts, ...values) => {
    const sql = parts.join('?').replace(/\s+/g, ' ').trim();
    if (/^create |^alter /.test(sql)) return [];
    if (/^select \* from vacation_web_access_grants/.test(sql)) {
      return [{ id: 'grant-1', role: 'owner', owner_customer_id: 'owner-1' }];
    }
    if (/^update vacation_web_access_grants/.test(sql)) return [];
    if (/^select customer_id from trips/.test(sql)) return [{ customer_id: 'owner-1' }];
    if (/^select \* from chat_itinerary_edits/.test(sql)) {
      return [{ before_json: { 'place:610': { perDaySchedule: { 502: { startTime: '18:30' } } }, 'place:689': {} } }];
    }
    if (/^insert into chat_itinerary_edits/.test(sql)) { audit.push(values); return []; }
    if (/^insert into chat_itinerary_anchor_state/.test(sql)) return [];
    if (/^select anchor_place_id from chat_itinerary_anchor_state/.test(sql)) return [];
    throw new Error(`unexpected_mock_sql: ${sql}`);
  };
  const result = await runChatItineraryEditTurn({
    db, trip: { id: 'trip-1', metadata: { sharedToken: copySlug } }, customerTurn,
    httpReq: { headers: authenticatedHeaders }, env: {},
    extractIntent: async ({ customerTurn: text }) => offlineParseItineraryEditIntent(text),
    fetchPayload: async (slug) => { assert.equal(slug, copySlug); return stored; },
    putOverrides: async ({ slug, overrides, webAccessToken }) => {
      assert.equal(slug, copySlug);
      assert.equal(webAccessToken, 'mock-owner-session');
      writes.push(structuredClone(overrides));
      if (!stored.thingOverrides) stored.thingOverrides = {};
      mergeSharedOverrides(stored.thingOverrides, overrides);
    },
    putAssignmentMove: async ({ newDayId, assignmentId }) => {
      const prior = (stored.assignments || {});
      const fromDayId = Object.keys(prior).find((dayId) =>
        (prior[dayId] || []).some((row) => String(row.place_id ?? row.place?.id) === String(610)),
      );
      if (fromDayId) {
        stored = applyAssignmentMoveOnPayload(stored, {
          placeId: 610,
          fromDayId,
          toDayId: newDayId,
          assignmentId,
        });
      }
    },
    postDayAssignment: async ({ dayId, placeId }) => {
      stored = applyAssignmentCreateOnPayload(stored, { placeId, dayId });
    },
  });
  assert.equal(result.applied, true, `${op}: ${result.reason}`);
  assert.equal(result.op, op);
  assert.equal(writes.length, 1, op);
  assert.equal(audit.length, op === 'undo' ? 0 : 1, op);
  if (op === 'set_time') assert.equal(stored.thingOverrides['place:610'].perDaySchedule['502'].startTime, '20:30');
  if (op === 'add_bar_before') assert.equal(stored.thingOverrides['place:689'].perDaySchedule['502'].startTime, '18:00');
  if (op === 'undo') {
    assert.equal(stored.thingOverrides['place:610'].perDaySchedule['502'].startTime, '18:30');
    assert.equal(stored.thingOverrides['place:689'], undefined);
  }
  assert.notDeepEqual(stored, original, op);
  const readFileSync = fs.readFileSync;
  const lockedConfig = JSON.stringify({ allowlist: cfg.allowlist, demo_locked: [...cfg.demoLocked, copySlug] });
  for (const putOverrides of [async () => { writes.push('unexpected_write'); }, null]) {
    try {
      await assert.rejects(runChatItineraryEditTurn({
        db, trip: { id: 'trip-1', shareToken: copySlug }, customerTurn,
        httpReq: { headers: authenticatedHeaders }, env: {}, putOverrides,
        extractIntent: async ({ customerTurn: text }) => offlineParseItineraryEditIntent(text),
        fetchPayload: async () => {
          fs.readFileSync = (file, ...args) => file === cfg.filePath ? lockedConfig : readFileSync(file, ...args);
          return miniPayload();
        },
      }), { message: 'demo_locked', statusCode: 403 }, `${op} rechecks lock before writing`);
      assert.equal(writes.length, 1, op);
      assert.equal(audit.length, op === 'undo' ? 0 : 1, op);
    } finally {
      fs.readFileSync = readFileSync;
    }
  }
}

const editSource = fs.readFileSync(new URL('../src/vacation/chat-itinerary-edit.mjs', import.meta.url), 'utf8');
const trekWriteSource = fs.readFileSync(new URL('../src/vacation/chat-itinerary-edit-trek-write.mjs', import.meta.url), 'utf8');
let writeHelpers = 0;
for (const src of [trekWriteSource]) {
  const functions = [...src.matchAll(/^(?:export )?(?:async )?function (\w+)\(/gm)];
  for (let i = 0; i < functions.length; i += 1) {
    const body = src.slice(functions[i].index, functions[i + 1]?.index ?? src.length);
    const sink = body.search(/await putOverrides\(|method: 'PUT'/);
    if (sink < 0) continue;
    writeHelpers += 1;
    const guard = body.indexOf('shareSlugEditGuardDecision(slug)');
    assert.ok(guard >= 0 && guard < sink, `${functions[i][1]} must guard before writing`);
    assert.match(body.slice(guard, sink), /if \(!guard\.ok\).*throw/s);
  }
}
assert.equal(writeHelpers, 2, 'TREK override and assignment PUT helpers stay guard-first');
assert.equal((editSource.match(/await putSharedTripOverrides\(/g) || []).length, 2, 'edit persistence and undo use the guarded helper');

const queueSource = fs.readFileSync(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8');
assert.match(queueSource, /prepareChatItineraryEditForQueueTurn/);

const requestJs = fs.readFileSync(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
assert.match(requestJs, /itineraryEdit/);

const trekBase = String(process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://travel.timesyncher.com').replace(/\/+$/, '');
const stagingPayload = await fetch(`${trekBase}/api/shared/${encodeURIComponent(copySlug)}/?bust=1`).then((r) => r.json());
const carboneResolve = resolvePlaceByQuery(stagingPayload, moveDay2.placeQuery);
assert.equal(carboneResolve.status, 'ok');
assert.match(carboneResolve.place?.name || '', /carbone/i);

const ownerSession = 'chat-edit-owner-session-861';
const ownerHttpReq = {
  headers: { cookie: `${webAccessCookieName()}=${encodeURIComponent(ownerSession)}` },
};
const chatEditTrip = { id: chatEditTripId, metadata: { sharedToken: copySlug } };
const ownerEditEnv = { ...chatEditEnv, CHAT_ITINERARY_EDIT_OFFLINE_PARSE: '1' };
const ownerSetTimeTurn = (extra = {}) => runChatItineraryEditTurn({
  db: makeChatItineraryEditDbStub({ sessionToken: ownerSession }), trip: chatEditTrip,
  customerTurn: 'move dinner at Carbone to 8:30 PM on Day 2', httpReq: ownerHttpReq, env: ownerEditEnv,
  extractIntent: offlineParseItineraryEditIntent, ...extra,
});
let liveOverrides = structuredClone(miniPayload().thingOverrides);
const fetchLivePayload = async () => ({
  ...miniPayload(),
  thingOverrides: structuredClone(liveOverrides),
});
let lastPutOverrides = null;
const capturePutOverrides = async ({ overrides }) => {
  lastPutOverrides = structuredClone(overrides);
  mergeSharedOverrides(liveOverrides, overrides);
};

const nothingUndoDb = makeChatItineraryEditDbStub({ sessionToken: ownerSession });
const nothingUndo = await ownerSetTimeTurn({ db: nothingUndoDb, customerTurn: 'undo', fetchPayload: fetchLivePayload, putOverrides: capturePutOverrides });
assert.equal(nothingUndo.applied, false);
assert.equal(nothingUndo.reason, 'nothing_to_undo');
assert.deepEqual(nothingUndo.client, { applied: false, reason: 'nothing_to_undo' });
assert.equal(lastPutOverrides, null);

liveOverrides = structuredClone(miniPayload().thingOverrides);
lastPutOverrides = null;
const setTimeDb = makeChatItineraryEditDbStub({ sessionToken: ownerSession });
const setTimeTurn = await ownerSetTimeTurn({ db: setTimeDb, turnId: 'turn-set-time-861', fetchPayload: fetchLivePayload, putOverrides: capturePutOverrides });
assert.equal(setTimeTurn.applied, true);
assert.equal(setTimeTurn.op, 'set_time');
assert.equal(liveOverrides['place:610'].perDaySchedule['502'].startTime, '20:30');

const undoTurn = await ownerSetTimeTurn({ db: setTimeDb, customerTurn: 'undo', fetchPayload: fetchLivePayload, putOverrides: capturePutOverrides });
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
const barHopLocked = await prepareChatItineraryEditForQueueTurn({ db: async () => [], trip: { id: chatEditTripId, metadata: { sharedToken: demoSlug } }, tripId: chatEditTripId, seat: null, requestText: 'Add a bar hop before Carbone that night.', httpReq: ownerHttpReq, env: {} });
assert.equal(barHopLocked.itineraryEditCannedReply, DEMO_LOCKED_CHAT_EDIT_CUSTOMER_REPLY);
console.log('test_chat_itinerary_edit: ok');
