#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  INTAKE_SEAM,
  actorFromIntake,
  actorFromLiveSession,
  annotateIntakeFromLiveSession,
  gateMediaUploadIntake,
  gateSharedPageIntakeEdit,
  gateTelegramIntakeEdit,
  pipelineWriteDecision,
} from '../src/vacation/intake-edit-bridge.mjs';

const cwd = process.cwd();
const vegasItems = [
  { id: 'thing-bellagio-fountains', trip_id: 'trip-vegas-live-001', title: 'Bellagio Fountains', day: 1, location: 'day 1 20:00' },
];
const media = { media_kind: 'video', bound_trip_id: 'trip-vegas-live-001', attachment_scope: 'trip' };

for (const rel of INTAKE_SEAM.liveCallers) {
  const source = fs.readFileSync(path.join(cwd, rel), 'utf8');
  assert.match(source, /intake-edit-bridge/, `${rel} must import the live intake edit bridge`);
  assert.match(source, /gateTelegramIntakeEdit|gateSharedPageIntakeEdit|gateMediaUploadIntake|gateVacationIntakeEdit|annotateIntakeFromLiveSession|pipelineWriteDecision/, `${rel} must call the vacation-edit-pipeline gate`);
}

assert.match(INTAKE_SEAM.remaining, /allowTrekWrite/);
assert.match(INTAKE_SEAM.remaining, /editApplied false/);

const owner = gateTelegramIntakeEdit({
  text: 'Move Bellagio Fountains to day 2',
  actor: actorFromIntake({ id: 'owner-craig', role: 'owner', authorized: true, canEdit: true }),
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
}, { persist: false });
assert.equal(owner.skip, false);
assert.equal(owner.failClosed, false);
assert.equal(owner.receipt.planned_writes[0].op, 'move_thing');
assert.equal(pipelineWriteDecision(owner, { items: vegasItems }).allowTrekWrite, true);
assert.equal(pipelineWriteDecision(owner, { items: vegasItems }).editApplied, true);

const emptyItems = gateTelegramIntakeEdit({
  text: 'Move Bellagio Fountains to day 2',
  actor: actorFromIntake({ id: 'owner-craig', role: 'owner', authorized: true, canEdit: true }),
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: [] },
}, { persist: false });
assert.equal(emptyItems.failClosed, true);
assert.equal(emptyItems.reason, 'no_thing_list');
const emptyDecision = pipelineWriteDecision(emptyItems, { items: [] });
assert.equal(emptyDecision.allowTrekWrite, false);
assert.equal(emptyDecision.editApplied, false);
assert.equal(emptyDecision.mode, 'vacation_edit_pipeline_fail_closed');

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
assert.equal(pipelineWriteDecision(dropped, { items: vegasItems }).allowTrekWrite, false);
assert.equal(pipelineWriteDecision(dropped, { items: vegasItems }).editApplied, false);

const liveOwnerSession = {
  id: 'owner-craig',
  customer_id: 'cust-craig',
  trip_id: 'trip-vegas-live-001',
  telegramUserId: 'tg-craig',
  metadata: { telegramRole: 'owner' },
  entitlement: { allowed: true, source: 'entitlement' },
};
const liveUnpaidSession = {
  id: 'collaborator-kim-unpaid',
  customer_id: 'cust-craig',
  trip_id: 'trip-vegas-live-001',
  telegramUserId: 'tg-kim',
  metadata: { telegramRole: 'collaborator' },
  collaborator: null,
  entitlement: { allowed: false, source: 'missing_paid_collaborator' },
};
const liveLoggedOutSession = { id: 'logged-out-visitor', loggedOut: true, session: null };
const livePublicLinkSession = {
  id: 'public-link-visitor',
  publicLink: true,
  webGrant: null,
  shareToken: 'las-vegas-strip-vacation',
};

const ownerActor = actorFromLiveSession(liveOwnerSession);
assert.equal(ownerActor.source, 'live_session');
assert.equal(ownerActor.role, 'owner');
assert.equal(ownerActor.canUpload, true);

const unpaidActor = actorFromLiveSession(liveUnpaidSession);
assert.equal(unpaidActor.source, 'live_session');
assert.equal(unpaidActor.role, 'unpaid_collaborator');
assert.equal(unpaidActor.canUpload, false);
assert.notEqual(unpaidActor.identity, ownerActor.identity);

const loggedOutActor = actorFromLiveSession(liveLoggedOutSession);
assert.equal(loggedOutActor.role, 'logged-out');
assert.equal(loggedOutActor.canUpload, false);

const publicLinkActor = actorFromLiveSession(livePublicLinkSession);
assert.equal(publicLinkActor.role, 'public-link');
assert.equal(publicLinkActor.canUpload, false);

const unpaidGate = gateMediaUploadIntake({
  text: 'Upload this video to the Vegas vacation',
  actor: unpaidActor,
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
  media,
}, { persist: false });
assert.equal(unpaidGate.failClosed, true);
assert.equal(unpaidGate.reason, 'unauthorized_upload');

const loggedOutGate = gateMediaUploadIntake({
  text: 'Upload this video to the Vegas vacation',
  actor: loggedOutActor,
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
  media,
}, { persist: false });
assert.equal(loggedOutGate.failClosed, true);
assert.equal(loggedOutGate.receipt.actor.role, 'logged-out');

const publicLinkGate = gateSharedPageIntakeEdit({
  text: 'Upload this video to the Vegas vacation',
  actor: publicLinkActor,
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
  media,
}, { persist: false });
assert.equal(publicLinkGate.failClosed, true);
assert.equal(publicLinkGate.receipt.actor.role, 'public-link');

const unpaidAnnotate = annotateIntakeFromLiveSession({
  text: 'Upload this video to the Vegas vacation',
  media,
  session: liveUnpaidSession,
}, { persist: false });
assert.equal(unpaidAnnotate.actor.role, 'unpaid_collaborator');
assert.equal(unpaidAnnotate.blocked, true);

const loggedOutAnnotate = annotateIntakeFromLiveSession({
  text: 'Upload this video to the Vegas vacation',
  media,
  session: liveLoggedOutSession,
}, { persist: false });
assert.equal(loggedOutAnnotate.blocked, true);

const unresolvedAnnotate = annotateIntakeFromLiveSession({
  text: 'Upload this video to the Vegas vacation',
  telegramUserId: 'tg-unknown',
  media,
}, { persist: false });
assert.equal(unresolvedAnnotate.actor.role, 'unresolved');
assert.equal(unresolvedAnnotate.blocked, false, 'unresolved bot annotate must not pretend to be owner and must not block before API session resolution');
assert.equal(unresolvedAnnotate.actor.canUpload, false);

const itinerary = fs.readFileSync(path.join(cwd, 'api/vacation-itinerary.mjs'), 'utf8');
assert.match(itinerary, /action === 'vacation_edit'/);
assert.match(itinerary, /gateSharedPageIntakeEdit/);
assert.match(itinerary, /actorFromLiveSession/);

const dispatch = fs.readFileSync(path.join(cwd, 'scripts/product-gbrain-dispatch.mjs'), 'utf8');
assert.match(dispatch, /pipelineWriteDecision/);
assert.match(dispatch, /allowTrekWrite/);
assert.match(dispatch, /editApplied: false/);
assert.match(dispatch, /vacation_edit_pipeline_fail_closed/);
const trekCallIndex = dispatch.indexOf('applyTrekItineraryEdit(job, artifacts)');
const decisionIndex = dispatch.indexOf('pipelineWriteDecision');
assert.ok(decisionIndex !== -1 && trekCallIndex !== -1 && decisionIndex < trekCallIndex, 'TREK writer must sit behind pipelineWriteDecision');

const turn = fs.readFileSync(path.join(cwd, 'api/vacation-telegram-turn.mjs'), 'utf8');
assert.match(turn, /actorFromLiveSession/);
assert.match(turn, /gateMediaUploadIntake/);
assert.doesNotMatch(turn, /canUpload:\s*true/);

const bot = fs.readFileSync(path.join(cwd, 'scripts/telegram-vacation-intake-bot.mjs'), 'utf8');
assert.match(bot, /annotateIntakeFromLiveSession/);
assert.doesNotMatch(bot, /role:\s*'owner'/);
assert.match(bot, /blocked/);

console.log('vacation intake pipeline seam passed');
console.log(`remaining seam: ${INTAKE_SEAM.remaining}`);
