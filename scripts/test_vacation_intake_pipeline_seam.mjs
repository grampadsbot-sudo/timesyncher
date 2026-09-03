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
  isPaidMediaEntitlement,
  pipelineWriteDecision,
  selectLiveLockedTripThings,
  telegramTurnAfterGate,
  telegramTurnNoApplyCopy,
} from '../src/vacation/intake-edit-bridge.mjs';
import { itemsFromValidatedWrites } from './trek-itinerary-edit.mjs';

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
assert.match(INTAKE_SEAM.remaining, /planned_writes/);
assert.match(INTAKE_SEAM.remaining, /live-locked trip_things/);
assert.match(INTAKE_SEAM.remaining, /staging_bypass/);
assert.match(INTAKE_SEAM.remaining, /customer_id/);
assert.match(INTAKE_SEAM.remaining, /plannedWritesReplied/);
assert.match(INTAKE_SEAM.remaining, /separate entry/);
assert.match(INTAKE_SEAM.remaining, /--trek-db/);
assert.match(INTAKE_SEAM.remaining, /apply_not_on_turn/);
assert.match(INTAKE_SEAM.remaining, /no-apply customer_facing_response/);
assert.match(INTAKE_SEAM.remaining, /joins every clause/);
assert.match(INTAKE_SEAM.remaining, /thing_not_visible/);
assert.match(INTAKE_SEAM.remaining, /thing_id_cross_trip/);
assert.match(INTAKE_SEAM.remaining, /does not treat bound-trip stale_trip_media/);
assert.match(INTAKE_SEAM.remaining, /proof_digest/);
assert.match(INTAKE_SEAM.remaining, /another trip/);
assert.match(INTAKE_SEAM.remaining, /features\/proof\/vac-verify-telegram-text-single-edit/);

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
const turnAfterGate = telegramTurnAfterGate(owner);
assert.equal(turnAfterGate.plannedWritesReplied, true);
assert.equal(turnAfterGate.queueWorker, false);
assert.equal(turnAfterGate.failClosed, true);
assert.equal(turnAfterGate.editApplied, false);
assert.equal(turnAfterGate.reason, 'apply_not_on_turn');
assert.equal(turnAfterGate.reply, telegramTurnNoApplyCopy('Move Bellagio Fountains to day 2'));
assert.equal(owner.receipt.customer_facing_response, telegramTurnNoApplyCopy('Move Bellagio Fountains to day 2'));
assert.doesNotMatch(turnAfterGate.reply, /^Moved /);
assert.doesNotMatch(owner.receipt.customer_facing_response, /^Moved /);

const multiGate = gateTelegramIntakeEdit({
  surface: 'telegram-voice',
  text: 'Remove Topgolf Las Vegas and then move In-N-Out Burger to day 3. Also check if there is live music tonight.',
  expected_clauses: 3,
  actor: actorFromIntake({ id: 'owner-craig', role: 'owner', authorized: true, canEdit: true }),
  trip: {
    trip_id: 'trip-vegas-live-001',
    title: 'Las Vegas Strip Vacation',
    status: 'live',
    items: [
      { id: 'thing-topgolf', trip_id: 'trip-vegas-live-001', title: 'Topgolf Las Vegas', day: 3, location: 'day 3 16:00' },
      { id: 'thing-inoahs', trip_id: 'trip-vegas-live-001', title: 'In-N-Out Burger', day: 2, location: 'day 2 12:00' },
    ],
  },
}, { persist: false });
const multiTurn = telegramTurnAfterGate(multiGate);
assert.equal(multiTurn.plannedWritesReplied, true);
assert.match(multiTurn.reply, /Remove Topgolf Las Vegas/);
assert.match(multiTurn.reply, /move In-N-Out Burger to day 3/i);
assert.match(multiTurn.reply, /live music/i);
assert.doesNotMatch(multiTurn.reply, /^(Moved |Removed )/);
assert.notEqual(multiTurn.reply, telegramTurnNoApplyCopy(multiGate.receipt.intents[0].heard));

const thingStaleGate = gateMediaUploadIntake({
  text: 'Attach this photo to the luau',
  actor: actorFromIntake({ id: 'owner-craig', role: 'owner', authorized: true, canEdit: true, canUpload: true }),
  trip: {
    trip_id: 'trip-vegas-live-001',
    title: 'Las Vegas Strip Vacation',
    status: 'live',
    items: [
      ...vegasItems,
      { id: 'thing-hawaii-luau', trip_id: 'trip-hawaii-old-009', title: 'Luau', day: 1, location: 'day 1 18:00' },
    ],
  },
  media: {
    media_kind: 'photo',
    bound_trip_id: 'trip-vegas-live-001',
    attachment_scope: 'thing',
    thing_id: 'thing-hawaii-luau',
  },
}, { persist: false });
assert.equal(thingStaleGate.failClosed, true);
assert.equal(thingStaleGate.reason, 'thing_id_cross_trip');
assert.equal(thingStaleGate.receipt.planned_writes.length, 0);

const thingVisibleGate = gateMediaUploadIntake({
  text: 'Attach this photo to Bellagio Fountains',
  actor: actorFromIntake({ id: 'owner-craig', role: 'owner', authorized: true, canEdit: true, canUpload: true }),
  pageContext: {
    kind: 'day',
    day: 2,
    items: [{ id: 'thing-umekes', trip_id: 'trip-vegas-live-001', title: 'Umekes Fish Market Bar & Grill', day: 2 }],
  },
  trip: {
    trip_id: 'trip-vegas-live-001',
    title: 'Las Vegas Strip Vacation',
    status: 'live',
    items: [
      ...vegasItems,
      { id: 'thing-umekes', trip_id: 'trip-vegas-live-001', title: 'Umekes Fish Market Bar & Grill', day: 2 },
    ],
  },
  media: {
    media_kind: 'photo',
    bound_trip_id: 'trip-vegas-live-001',
    attachment_scope: 'thing',
    thing_id: 'thing-bellagio-fountains',
  },
}, { persist: false });
assert.equal(thingVisibleGate.failClosed, true);
assert.equal(thingVisibleGate.reason, 'thing_not_visible');
assert.equal(thingVisibleGate.receipt.planned_writes.length, 0);
assert.doesNotMatch(turnAfterGate.reply, /updated the itinerary/i);

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

const customerOnlyActor = actorFromLiveSession({
  id: 'maybe-craig',
  customer_id: 'cust-craig',
  trip_id: 'trip-vegas-live-001',
});
assert.notEqual(customerOnlyActor.role, 'owner');
assert.equal(customerOnlyActor.canEdit, false);
assert.equal(customerOnlyActor.canUpload, false);

const unpaidStagingActor = actorFromLiveSession({
  ...liveUnpaidSession,
  entitlement: { allowed: true, source: 'staging_bypass' },
});
assert.equal(unpaidStagingActor.canUpload, false);
assert.equal(unpaidStagingActor.canEdit, false);
assert.equal(isPaidMediaEntitlement({ allowed: true, source: 'staging_bypass' }), false);

const ownerStagingActor = actorFromLiveSession({
  ...liveOwnerSession,
  entitlement: { allowed: true, source: 'staging_bypass' },
});
assert.equal(ownerStagingActor.role, 'owner');
assert.equal(ownerStagingActor.canEdit, true);
assert.equal(ownerStagingActor.canUpload, false);

const loggedOutStagingActor = actorFromLiveSession({
  ...liveLoggedOutSession,
  entitlement: { allowed: true, source: 'staging_bypass' },
});
assert.equal(loggedOutStagingActor.canUpload, false);
assert.equal(loggedOutStagingActor.canEdit, false);

const publicLinkStagingActor = actorFromLiveSession({
  ...livePublicLinkSession,
  entitlement: { allowed: true, source: 'staging_bypass' },
});
assert.equal(publicLinkStagingActor.canUpload, false);
assert.equal(publicLinkStagingActor.canEdit, false);

const paidCollaboratorActor = actorFromLiveSession({
  id: 'collaborator-kim-paid',
  customer_id: 'cust-craig',
  trip_id: 'trip-vegas-live-001',
  telegramUserId: 'tg-kim-paid',
  metadata: { telegramRole: 'collaborator' },
  collaborator: { id: 'collab-kim', status: 'active' },
  entitlement: { allowed: true, source: 'paid_order' },
});
assert.equal(paidCollaboratorActor.role, 'telegram_collaborator');
assert.equal(paidCollaboratorActor.canEdit, true);
assert.equal(paidCollaboratorActor.canUpload, true);

const fabricatedThings = selectLiveLockedTripThings({
  tripId: 'trip-vegas-live-001',
  liveLockedThings: undefined,
  clientThings: vegasItems,
  payloadThings: vegasItems,
  tripItems: vegasItems,
});
assert.deepEqual(fabricatedThings, []);
assert.deepEqual(selectLiveLockedTripThings({
  tripId: 'trip-vegas-live-001',
  liveLockedThings: vegasItems,
}), vegasItems);
assert.deepEqual(itemsFromValidatedWrites([{
  op: 'move_thing',
  title: 'Bellagio Fountains',
  item_id: 'thing-bellagio-fountains',
  to: 'day 2',
}]).map((row) => ({ op: row.op, day: row.day })), [{ op: 'move_thing', day: 2 }]);

const unpaidStagingGate = gateMediaUploadIntake({
  text: 'Upload this video to the Vegas vacation',
  actor: unpaidStagingActor,
  trip: { trip_id: 'trip-vegas-live-001', title: 'Las Vegas Strip Vacation', status: 'live', items: vegasItems },
  media,
}, { persist: false });
assert.equal(unpaidStagingGate.failClosed, true);
assert.equal(unpaidStagingGate.reason, 'unauthorized_upload');

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
assert.match(itinerary, /selectLiveLockedTripThings/);
assert.match(itinerary, /trip_things/);
assert.doesNotMatch(itinerary, /let items = Array.isArray\(body\.items\)/);

const dispatch = fs.readFileSync(path.join(cwd, 'scripts/product-gbrain-dispatch.mjs'), 'utf8');
assert.match(dispatch, /pipelineWriteDecision/);
assert.match(dispatch, /allowTrekWrite/);
assert.match(dispatch, /editApplied: false/);
assert.match(dispatch, /vacation_edit_pipeline_fail_closed/);
assert.match(dispatch, /selectLiveLockedTripThings/);
assert.match(dispatch, /validatedWrites: gate.receipt.planned_writes/);
assert.match(dispatch, /applyValidatedOnly: true/);
assert.doesNotMatch(dispatch, /things: payload\.things/);
const decisionIndex = dispatch.indexOf('pipelineWriteDecision');
const trekCallIndex = dispatch.indexOf('applyTrekItineraryEdit(job, writeArtifacts)');
const agentFn = dispatch.slice(dispatch.indexOf('function applyTrekAgentEdit'), dispatch.indexOf('function applyExistingTripEdit'));
assert.ok(decisionIndex !== -1 && trekCallIndex !== -1 && decisionIndex < trekCallIndex, 'TREK writer must sit behind pipelineWriteDecision');
assert.match(agentFn, /validatedWrites/);
assert.doesNotMatch(agentFn, /requestText:/);

const turn = fs.readFileSync(path.join(cwd, 'api/vacation-telegram-turn.mjs'), 'utf8');
assert.match(turn, /actorFromLiveSession/);
assert.match(turn, /gateMediaUploadIntake/);
assert.match(turn, /resolve_live_session/);
assert.match(turn, /selectLiveLockedTripThings/);
assert.match(turn, /plannedWritesReplied/);
assert.match(turn, /telegramTurnAfterGate/);
assert.doesNotMatch(turn, /canUpload:\s*true/);
assert.doesNotMatch(turn, /source: 'staging_bypass'/);
assert.doesNotMatch(turn, /allowed: true, source: 'staging_bypass'/);
const editGateBlock = turn.slice(turn.lastIndexOf('const editGate = gateTelegramIntakeEdit'));
assert.match(editGateBlock, /else if \(plannedWritesReplied\)/);
assert.ok(editGateBlock.indexOf('else if (plannedWritesReplied)') < editGateBlock.indexOf('queueSetupRequest'), 'planned_writes reply must not queue a write worker');
assert.match(editGateBlock, /turnDecision\.reply/);
assert.doesNotMatch(editGateBlock, /plannedWritesReplied\) \{\s*reply = editGate\.receipt\.customer_facing_response/);

const bot = fs.readFileSync(path.join(cwd, 'scripts/telegram-vacation-intake-bot.mjs'), 'utf8');
assert.match(bot, /annotateIntakeFromLiveSession/);
assert.match(bot, /resolveLiveSession/);
assert.match(bot, /event: 'resolve_live_session'/);
assert.match(bot, /payload\.liveSession = liveSession/);
assert.match(bot, /liveSession,/);
assert.doesNotMatch(bot, /role:\s*'owner'/);
assert.match(bot, /blocked/);

const trekEdit = fs.readFileSync(path.join(cwd, 'scripts/trek-itinerary-edit.mjs'), 'utf8');
const trekMain = trekEdit.slice(trekEdit.indexOf('async function main'));
assert.match(trekMain, /validatedWrites/);
assert.match(trekMain, /applyValidatedOnly/);
assert.doesNotMatch(trekEdit, /extractQuotedAdds/);
assert.doesNotMatch(trekEdit, /function editItems/);
assert.doesNotMatch(trekMain, /editItems\(/);
assert.doesNotMatch(trekMain, /parseDateRange\(/);

const trekAgent = fs.readFileSync(path.join(cwd, 'scripts/trek-agent-edit.mjs'), 'utf8');
const agentMain = trekAgent.slice(trekAgent.indexOf('async function main'));
assert.match(agentMain, /validatedWrites/);
assert.doesNotMatch(trekAgent, /planWithGrok/);
assert.doesNotMatch(trekAgent, /inferFallbackPlan/);
assert.doesNotMatch(trekAgent, /extractQuotedAdds/);

const workerJobs = fs.readFileSync(path.join(cwd, 'api/worker-jobs.mjs'), 'utf8');
assert.match(workerJobs, /liveLockedThings/);
assert.match(workerJobs, /trip_things/);

console.log('vacation intake pipeline seam passed');
console.log(`remaining seam: ${INTAKE_SEAM.remaining}`);
