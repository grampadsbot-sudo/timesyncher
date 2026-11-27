import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { intId } from '../src/vacation/intake-shared-trip.mjs';
import { runCustomer } from './harness/customer.mjs';
import { httpLiveOptions } from './harness/http-live.mjs';
import { itineraryStoredCheck, measureStoredItinerary } from './harness/itinerary-evidence.mjs';
import { provisionThrowaway } from './harness/live-provision.mjs';
import { finishMeasuredPlay } from './harness/outcomes.mjs';
import { runRosterCli } from './harness/roster-cli.mjs';
import { snapshotHarnessVacation } from './harness/vacation-snapshot.mjs';

const raw = new PGlite({ extensions: { pgcrypto } });
const db = async (parts, ...params) => (await raw.query(parts.reduce((sql, part, index) => index ? `${sql}$${index}${part}` : part, ''), params)).rows;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-trip-state-harness-'));
const story = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/story-dry-run.json', import.meta.url)));
Object.assign(story, {
  story_id: 'vk-001',
  reply_backend: 'trip_state',
  dates: { start: '2027-04-05', end: '2027-04-09' },
});
const runId = 'offline-test';
const tag = `harness:${runId}:${story.story_id}`;
const env = { TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation.example', VK_GATE_AGREE_TURNS: '4' };
const outDir = path.join(dir, 'first');
const artifacts = {
  reason: '', liveShaStart: 'offline', liveShaEnd: 'offline', dialogOk: true, keepsakeOk: true,
  screensOk: true, onboardingPdfOk: true, videoExists: true, videoPass: true, chromeOk: true,
};

async function verifyLiveArmDefault() {
  const roster = fileURLToPath(new URL('./fixtures/harness/vk-roster.json', import.meta.url));
  const credits = path.join(dir, 'credits.json');
  fs.writeFileSync(credits, JSON.stringify({ total_credits: 3, total_usage: 0, as_of: new Date().toISOString() }));
  const selected = [];
  const liveOptions = {
    env: { HARNESS_OPENROUTER_CREDITS_FILE: credits, HARNESS_REPLY_DOLLARS_PER_CUSTOMER: '0.01' },
    async run(chosen) {
      selected.push(chosen.reply_backend);
      return { story_id: chosen.story_id, reply_backend: chosen.reply_backend, verdict: 'PASS' };
    },
  };
  for (const backend of [[], ['--reply-backend', 'vk_bot_mcp']]) {
    const findings = path.join(dir, 'findings.md');
    fs.writeFileSync(findings, '# VK customer test findings\n\n## Section format (harness appends)\n\n## Entries\n');
    await runRosterCli(['--roster', roster, '--run-id', runId, '--wave-size', '2', '--findings', findings, ...backend], {
      outRoot: dir, liveOptions, log() {},
    });
  }
  assert.deepEqual(selected, ['trip_state', 'trip_state', 'vk_bot_mcp', 'vk_bot_mcp']);
}

try {
  await verifyLiveArmDefault();
  const httpDir = path.join(dir, 'http');
  const http = httpLiveOptions({}, { pickLane() {}, fetchImpl: () => assert.fail('blocked HTTP-only play fetched') });
  await http.play(story, { outDir: httpDir });
  const httpOutcome = JSON.parse(fs.readFileSync(path.join(httpDir, 'outcomes.json')));
  assert.equal(httpOutcome.itineraryCount, null);
  assert.equal(httpOutcome.itineraryCountSource, 'unmeasured');
  for (const migration of ['001_vacation_mvp', '003_trip_things_source', '010_vacation_trip_state_actions', '011_vacation_trip_state_revisions']) {
    await raw.exec(fs.readFileSync(new URL(`../db/migrations/${migration}.sql`, import.meta.url), 'utf8'));
  }
  const { tripId, customerId } = await provisionThrowaway(db, story, { tag, runId, outDir, env });
  const [stored] = await db`select metadata from trips where id = ${tripId}`;
  assert.equal(stored.metadata.replyBackend, 'trip_state');
  assert.equal(stored.metadata.trip_state_actions, true);
  const controlTag = 'harness:control:vk-001';
  const control = await provisionThrowaway(db, { ...story, reply_backend: 'vk_bot_mcp' }, { tag: controlTag, runId: 'control', outDir, env });
  const [controlRow] = await db`select metadata from trips where id = ${control.tripId}`;
  assert.equal(controlRow.metadata.replyBackend, 'vk_bot_mcp');
  assert.equal(controlRow.metadata.trip_state_actions, undefined);

  const placed = {
    tripState: { occurrences: [
      { id: 'visit-one', day: String(intId(`${tripId}:day:2027-04-06`)), role: 'visit', via: 'chat_action', proposed_by: 'customer' },
      { id: 'visit-two', day: String(intId(`${tripId}:day:2027-04-07`)), role: 'visit', via: 'chat_action', proposed_by: 'customer' },
    ] },
  };
  await db`
    insert into trip_things (trip_id, category, title, source, metadata)
    values (${tripId}, 'park', 'Placed park', 'customer', ${placed}),
           (${tripId}, 'park', 'Unscheduled park', 'customer', ${{ askWhichDay: true }})
  `;
  for (const [speaker, tags, payload] of [
    ['customer', ['approval_continue'], {}],
    ['customer', ['change_request'], { committedPlan: true }],
    ['customer', [], { committedPlan: true }],
    ['customer', [], { wantedThings: [{ name: 'A park', when: 'Tuesday' }] }],
    ['customer', [], { turnClassifier: { turnKind: 'place_search' }, wantedThings: [{ name: 'Tacos', when: 'Tuesday' }] }],
    ['customer', [], { wantedThings: [{ name: 'Someday' }] }],
    ['app', ['approval_continue'], { committedPlan: true }],
  ]) {
    await db`
      insert into transcript_turns (trip_id, customer_id, speaker, body, channel, turn_tags, payload)
      values (${tripId}, ${customerId}, ${speaker}, 'Neutral fixture text', 'vacation-app', ${`{${tags.join(',')}}`}::text[], ${payload})
    `;
  }

  const play = (playDir, selectedDb, exercise) => finishMeasuredPlay({
    db: selectedDb, tag, outDir: playDir, secrets: [],
    play: async ({ rememberTrip }) => {
      rememberTrip(tripId);
      return exercise();
    },
  });
  const card = await runCustomer(story, {
    runId, env, outDir,
    play: () => play(outDir, db, () => { throw new Error('fixture harness error'); }),
    cleanup: async () => {
      const measured = JSON.parse(fs.readFileSync(path.join(outDir, 'outcomes.json')));
      assert.equal(measured.reason, 'harness-error');
      assert.equal(measured.itineraryCount, 1);
      assert.equal(measured.itineraryCountSource, 'db');
      assert.equal(measured.planningAgreementTurns, 4);
      return { deleted: {}, remaining: 0 };
    },
  });
  assert.equal(card.reason, 'harness-error');
  assert.equal(card.itineraryCount, 1);
  assert.equal(card.itineraryCountSource, 'db');
  assert.equal(card.checks.find(({ id }) => id === 'itinerary-stored').pass, true);
  assert.equal(card.app_reply_path, 'Trip State / OpenRouter');

  await db`delete from trip_things where trip_id = ${tripId} and title = 'Placed park'`;
  for (const [label, selectedDb, count, source] of [
    ['zero', db, 0, 'db'],
    ['unavailable', async (parts, ...params) => {
      if (parts.join('').includes('as things')) throw new Error('fixture DB count failure');
      return db(parts, ...params);
    }, null, 'unmeasured'],
  ]) {
    const caseDir = path.join(dir, label);
    const result = await runCustomer(story, {
      runId, env, outDir: caseDir,
      play: () => play(caseDir, selectedDb, () => artifacts),
    });
    assert.equal(result.verdict, 'FAIL');
    assert.equal(result.reason, 'itinerary-stored');
    assert.equal(result.itineraryCount, count);
    assert.equal(result.itineraryCountSource, source);
    assert.equal(result.planningAgreementTurns, 4);
    assert.deepEqual(result.checks.filter((check) => !check.pass).map(({ id }) => id), ['itinerary-stored']);
    const outcomes = JSON.parse(fs.readFileSync(path.join(caseDir, 'outcomes.json')));
    assert.equal(outcomes.itineraryCount, count);
    assert.equal(outcomes.itineraryCountSource, source);
    assert.equal(itineraryStoredCheck(outcomes, { VK_GATE_AGREE_TURNS: '5' }).pass, true);
  }
  assert.deepEqual(await measureStoredItinerary(db, tripId, controlTag), { itineraryCount: null, itineraryCountSource: 'unmeasured' });

  await assert.rejects(snapshotHarnessVacation(db, { tripId, tag: controlTag, outDir }), /prior harness vacation missing/);
  const blockedSnapshotDir = path.join(dir, 'not-a-directory');
  fs.writeFileSync(blockedSnapshotDir, '');
  await assert.rejects(provisionThrowaway(db, story, { tag, runId, outDir: blockedSnapshotDir, env }));
  assert.equal((await db`select id from trips where id = ${tripId}`).length, 1);
  const replacement = await provisionThrowaway(db, story, { tag, runId, outDir, env });
  assert.notEqual(replacement.tripId, tripId);
  const prior = fs.readdirSync(outDir).filter((file) => file.startsWith('prior-vacation-'));
  assert.equal(prior.length, 1);
  const snapshotFile = path.join(outDir, prior[0]);
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile));
  assert.equal(fs.statSync(snapshotFile).mode & 0o777, 0o400);
  assert.equal(snapshot.readonly, true);
  assert.equal(snapshot.trip.id, tripId);
  assert.equal(snapshot.trip.metadata.publicSlug, '[redacted]');
  assert.equal(snapshot.trip_things.length, 1);
  assert.equal(snapshot.transcript_turns.length, 7);
  assert.deepEqual(snapshot.trip_state_revisions, []);
  assert.deepEqual(snapshot.action_receipts, []);
  assert.deepEqual(await db`select id from trips where id = ${tripId}`, []);
} finally {
  await raw.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('VK harness Trip State provisioning, DB measurement, scorecard and snapshot passed.');
