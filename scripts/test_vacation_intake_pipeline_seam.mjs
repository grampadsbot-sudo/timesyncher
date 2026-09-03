#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  INTAKE_SEAM,
  actorFromIntake,
  gateMediaUploadIntake,
  gateSharedPageIntakeEdit,
  gateTelegramIntakeEdit,
} from '../src/vacation/intake-edit-bridge.mjs';

const cwd = process.cwd();
const vegasItems = [
  { id: 'thing-bellagio-fountains', trip_id: 'trip-vegas-live-001', title: 'Bellagio Fountains', day: 1, location: 'day 1 20:00' },
];
const media = { media_kind: 'video', bound_trip_id: 'trip-vegas-live-001', attachment_scope: 'trip' };

for (const rel of INTAKE_SEAM.liveCallers) {
  const source = fs.readFileSync(path.join(cwd, rel), 'utf8');
  assert.match(source, /intake-edit-bridge/, `${rel} must import the live intake edit bridge`);
  assert.match(source, /gateTelegramIntakeEdit|gateSharedPageIntakeEdit|gateMediaUploadIntake|gateVacationIntakeEdit/, `${rel} must call the vacation-edit-pipeline gate`);
}

assert.match(INTAKE_SEAM.remaining, /product-gbrain-dispatch/);
assert.match(INTAKE_SEAM.remaining, /trek-itinerary-edit/);

const owner = gateTelegramIntakeEdit({
  text: 'Move Bellagio Fountains to day 2',
  actor: actorFromIntake({ id: 'owner-craig', role: 'owner', authorized: true, canEdit: true }),
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
}, { persist: false });
assert.equal(owner.skip, false);
assert.equal(owner.failClosed, false);
assert.equal(owner.receipt.planned_writes[0].op, 'move_thing');

const dropped = gateTelegramIntakeEdit({
  surface: 'telegram-voice',
  text: 'Move Bellagio Fountains to day 2 and then blorpt the xenon fountain.',
  expected_clauses: 2,
  actor: actorFromIntake({ id: 'collaborator-kim', role: 'telegram_collaborator', authorized: true, canEdit: true }),
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
}, { persist: false });
assert.equal(dropped.failClosed, true);
assert.equal(dropped.integrityFailClosed, true);
assert.equal(dropped.reason, 'dropped_clause');
assert.equal(dropped.receipt.planned_writes.length, 0);

const unpaid = gateMediaUploadIntake({
  text: 'Upload this video to the Vegas vacation',
  actor: actorFromIntake({ id: 'collaborator-kim-unpaid', role: 'unpaid_collaborator', authorized: false, canUpload: false, canEdit: false }),
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
  media,
}, { persist: false });
assert.equal(unpaid.failClosed, true);
assert.equal(unpaid.integrityFailClosed, true);
assert.equal(unpaid.reason, 'unauthorized_upload');
assert.notEqual(unpaid.receipt.actor.identity, owner.receipt.actor.identity);

const loggedOut = gateSharedPageIntakeEdit({
  text: 'Upload this video to the Vegas vacation',
  actor: actorFromIntake({ id: 'logged-out-visitor', loggedOut: true, session: null }),
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
  media,
}, { persist: false });
assert.equal(loggedOut.failClosed, true);
assert.equal(loggedOut.receipt.actor.role, 'logged-out');
assert.equal(loggedOut.receipt.planned_writes.length, 0);

const itinerary = fs.readFileSync(path.join(cwd, 'api/vacation-itinerary.mjs'), 'utf8');
assert.match(itinerary, /action === 'vacation_edit'/);
assert.match(itinerary, /gateSharedPageIntakeEdit/);
assert.match(itinerary, /logged-out/);

const dispatch = fs.readFileSync(path.join(cwd, 'scripts/product-gbrain-dispatch.mjs'), 'utf8');
assert.match(dispatch, /vacation_edit_pipeline_fail_closed/);
assert.match(dispatch, /integrityFailClosed/);
assert.match(dispatch, /applyTrekItineraryEdit/);

const turn = fs.readFileSync(path.join(cwd, 'api/vacation-telegram-turn.mjs'), 'utf8');
assert.match(turn, /gateTelegramIntakeEdit/);
assert.match(turn, /gateMediaUploadIntake/);

const bot = fs.readFileSync(path.join(cwd, 'scripts/telegram-vacation-intake-bot.mjs'), 'utf8');
assert.match(bot, /annotateTelegramIntakePipeline|gateTelegramIntakeEdit/);

console.log('vacation intake pipeline seam passed');
console.log(`remaining seam: ${INTAKE_SEAM.remaining}`);
