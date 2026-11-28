#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abArmLabel } from './harness/dry.mjs';
import { FINISH_ARTIFACTS, finishArtifactReport, liveFinishReason, ringArtifactMessage } from './harness/finish-artifacts.mjs';
import { customerSection, waveSection } from './harness/findings.mjs';
import { measureItemStorage } from './harness/itinerary-evidence.mjs';
import { chatGoalsReached } from './harness/live-play.mjs';

const story = { reply_backend: 'vk_bot_mcp', roster: { id: 1 } };
assert.equal(abArmLabel(story), 'B vk_bot_mcp');
assert.equal(abArmLabel(story, { storagePath: 'chat_persist' }), 'chat persist');
assert.equal(abArmLabel(story, { storagePath: 'trip_state' }), 'Trip State (OpenRouter)');
assert.equal(abArmLabel({ reply_backend: 'trip_state', roster: { id: 1 } }, { storagePath: 'none' }), 'Trip State (OpenRouter)');

const tripId = '11111111-2222-4333-8444-555555555555';
const tag = 'harness:offline-test:vk-001';
const chatDb = async (parts) => {
  const sql = parts.join(' ');
  assert.match(sql, /vacation_trip_state_revisions/);
  assert.match(sql, /trip_things/);
  return [{ revisions: 0, things: 19 }];
};
const chatStored = await measureItemStorage(chatDb, tripId, tag);
assert.equal(chatStored.storagePath, 'chat_persist');
assert.equal(chatStored.tripStateRevisions, 0);
const stateDb = async () => [{ revisions: 4, things: 19 }];
assert.equal((await measureItemStorage(stateDb, tripId, tag)).storagePath, 'trip_state');

const complete = finishArtifactReport({
  dialogPdf: true, adminDialogPdf: true, keepsakePdf: true, screenshotCount: 2, turnCount: 50, astraJsonTurns: 50, timingTurns: 50,
});
assert.equal(complete.complete, true);
assert.equal(liveFinishReason({ itineraryOk: true, hitTurnCap: true, artifacts: complete }), '');
assert.equal(chatGoalsReached({ itineraryCount: 19, index: 49, maxTurns: 50 }).done, true);
assert.equal(chatGoalsReached({ itineraryCount: 19, index: 49, maxTurns: 50 }).atCap, true);
assert.equal(Object.hasOwn(chatGoalsReached({ itineraryCount: 19, index: 1, maxTurns: 50 }), 'pricingOk'), false);

const missingShots = finishArtifactReport({
  dialogPdf: true, adminDialogPdf: true, keepsakePdf: true, screenshotCount: 0, turnCount: 50, astraJsonTurns: 50, timingTurns: 50,
});
const capped = liveFinishReason({ itineraryOk: true, hitTurnCap: true, artifacts: missingShots });
assert.match(capped, /^missing-artifacts:/);
assert.doesNotMatch(capped, /cap-without-required|pricing-reaction/);
assert.match(ringArtifactMessage(missingShots), /screenshots: missing/);
assert.match(ringArtifactMessage(missingShots), /dialog-pdf: present/);
assert.match(ringArtifactMessage(complete), /admin-astra-json: present/);
assert.match(ringArtifactMessage(complete), /admin-timing-summary: present/);
assert.match(ringArtifactMessage(finishArtifactReport({ dialogPdf: true, turnCount: 50 })), /admin-dialog: missing/);

const noItems = liveFinishReason({
  itineraryOk: false,
  hitTurnCap: true,
  artifacts: finishArtifactReport({}),
});
assert.match(noItems, /^cap-without-required:itinerary,/);
assert.doesNotMatch(noItems, /pricing/);

const card = {
  story_id: 'vk-001', reply_backend: 'vk_bot_mcp', ab_arm: 'chat persist', storagePath: 'chat_persist',
  mode: 'live', verdict: 'PASS', reason: '', checks: [], turns: [], cost: { state: 'not-run' },
  roster: { id: 1, edge_case: '' }, itineraryCount: 19,
};
assert.match(customerSection(card, { wave: 'lopez' }), /Arm \(A\/B\): chat persist/);
assert.match(waveSection({ wave: 'lopez', mode: 'live', cards: [card], failed: false }), /stored chat persist 1/);

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const launcher = path.join(root, 'scripts/host/start_customer_run.py');
const install = fs.readFileSync(path.join(root, 'scripts/host/install_vk_ship_round.sh'), 'utf8');
assert.equal(fs.existsSync(launcher), true);
assert.doesNotMatch(
  install,
  /start_customer_run/,
  'install_vk_ship_round.sh must leave ~/tsv-dispatch/bin/start_customer_run.py alone',
);
assert.equal(fs.readFileSync(launcher, 'utf8').includes('crontab'), false);

const plan = spawnSync('python3', [launcher, 'lopez', '--plan'], { encoding: 'utf8' });
assert.equal(plan.status, 0, plan.stderr);
assert.deepEqual(JSON.parse(plan.stdout), {
  story: 'lopez', customer: '1', story_id: 'vk-001', reply_backend: 'trip_state', max_turns: 50,
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lopez-finish-'));
const pdf = Buffer.from('%PDF-1.4\n');
fs.writeFileSync(path.join(dir, 'dialog.pdf'), pdf);
fs.writeFileSync(path.join(dir, 'keepsake.pdf'), pdf);
fs.mkdirSync(path.join(dir, 'screens'));
fs.writeFileSync(path.join(dir, 'screens', 'app-webkit-390.png'), Buffer.from('png'));
const artifacts = Object.fromEntries(complete.rows.map((row) => [row.id, row.state]));
fs.writeFileSync(path.join(dir, 'finish-artifacts.json'), `${JSON.stringify({ itineraryCount: 19, artifacts }, null, 2)}\n`);
const ready = spawnSync('python3', [launcher, 'lopez', '--check', dir], { encoding: 'utf8' });
assert.equal(ready.status, 0, ready.stdout + ready.stderr);
const launcherText = fs.readFileSync(launcher, 'utf8');
assert.deepEqual(FINISH_ARTIFACTS, [
  'dialog-pdf', 'keepsake-pdf', 'screenshots', 'admin-dialog', 'admin-turns', 'admin-astra-json', 'admin-timing-summary',
]);
for (const name of FINISH_ARTIFACTS) {
  assert.match(ready.stdout, new RegExp(`${name}: present`));
  assert.match(launcherText, new RegExp(`"${name}"`));
}
fs.rmSync(path.join(dir, 'keepsake.pdf'));
const held = spawnSync('python3', [launcher, 'lopez', '--check', dir], { encoding: 'utf8' });
assert.equal(held.status, 1);
assert.match(held.stdout, /keepsake-pdf: missing/);
assert.match(held.stdout, /dialog-pdf: present/);
fs.rmSync(dir, { recursive: true, force: true });

console.log('test_lopez_arm_finish: ok');
