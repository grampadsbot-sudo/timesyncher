#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyRecordPartyAction } from '../src/vacation/collaborator-app-seat.mjs';
import { collaboratorStepFailure } from './harness/live-outputs.mjs';
import { runCustomer } from './harness/customer.mjs';

const UNDERLYING = 'Message text or an attachment is required.';
const failure = await collaboratorStepFailure(Response.json(
  { ok: false, error: UNDERLYING },
  { status: 400 },
));
assert.equal(failure, `collaborator step failed: 400: ${UNDERLYING}`);
assert.equal(await collaboratorStepFailure(new Response('nope', { status: 502 })), 'collaborator step failed: 502');

const route = fs.readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const actionAt = route.indexOf("if (body.action === 'record-party')");
const queueAt = route.indexOf('const queued = await queueVacationAppTurn');
assert.ok(actionAt > 0 && queueAt > actionAt, 'record-party must return before the chat queue');
assert.match(route.slice(actionAt, queueAt), /applyRecordPartyAction/);

const calls = [];
const db = async (strings, ...values) => {
  calls.push({ sql: strings.join(' '), values });
  return [];
};
const party = { primary: { name: 'Ada Fixture', role: 'Owner' }, collaborators: [] };
const recorded = await applyRecordPartyAction(db, { customer_id: 'cust-1041', trip_id: 'trip-1041' }, {
  action: 'record-party',
  tripId: 'trip-1041',
  party,
});
assert.equal(recorded.status, 200);
assert.deepEqual(recorded.body.party, party);
const update = calls.find((call) => /update trips/.test(call.sql));
assert.equal(update.values[1], 'trip-1041');
assert.deepEqual(update.values[0], { dialogParty: party });

const denied = await applyRecordPartyAction(db, {
  metadata: { seat: { ownerCustomerId: 'owner-1041', ownerOnboardingSessionId: 'onboard-1041' } },
}, { party });
assert.equal(denied.status, 403);
assert.match(denied.body.error, /cannot record the roster/);
await assert.rejects(
  () => applyRecordPartyAction(db, { customer_id: 'cust-1041' }, { tripId: 'trip-1041' }),
  /A party roster is required/,
);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collaborator-step-'));
const card = await runCustomer({
  story_id: 'vk-1041-collaborator',
  reply_backend: 'openrouter',
  customer: { name: 'Ada Fixture', email_alias: 'vk-1041-fixture' },
}, {
  runId: 'dry-run-1041-collaborator',
  outDir,
  play: async () => {
    throw new Error(failure);
  },
});
const check = card.checks.find((row) => row.id === 'harness-error');
assert.equal(card.verdict, 'FAIL');
assert.equal(card.reason, 'harness-error');
assert.equal(check.pass, false);
assert.match(check.detail, new RegExp(UNDERLYING));
assert.deepEqual(card.steps_present, []);

console.log('test_acceptance_1041_collaborator_step: ok');
