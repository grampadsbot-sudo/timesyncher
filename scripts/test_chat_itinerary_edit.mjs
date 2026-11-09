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
import { webAccessCookieName } from '../src/vacation/web-access.mjs';
import { runChatItineraryEditTurn } from '../src/vacation/chat-itinerary-edit.mjs';

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

const demoSlug = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';
const copySlug = 'chat-edit-copy-a47f5a7f2150c5e887a81972';
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
      stored = { ...stored, thingOverrides: overrides };
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
const functions = [...editSource.matchAll(/^(?:export )?(?:async )?function (\w+)\(/gm)];
let writeHelpers = 0;
for (let i = 0; i < functions.length; i += 1) {
  const body = editSource.slice(functions[i].index, functions[i + 1]?.index ?? editSource.length);
  const sink = body.search(/await putOverrides\(|method: 'PUT'/);
  if (sink < 0) continue;
  writeHelpers += 1;
  const guard = body.indexOf('shareSlugEditGuardDecision(slug)');
  assert.ok(guard >= 0 && guard < sink, `${functions[i][1]} must guard before writing`);
  assert.match(body.slice(guard, sink), /if \(!guard\.ok\).*throw/s);
}
assert.equal(writeHelpers, 1, 'all chat override writes use one guarded helper');
assert.equal((editSource.match(/await putSharedTripOverrides\(/g) || []).length, 2, 'edit persistence and undo use the guarded helper');

const queueSource = fs.readFileSync(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8');
assert.match(queueSource, /prepareChatItineraryEditForQueueTurn/);

const requestJs = fs.readFileSync(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
assert.match(requestJs, /itineraryEdit/);

console.log('test_chat_itinerary_edit: ok');
