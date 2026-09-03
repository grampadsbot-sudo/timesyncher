#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  NO_MATCH_TEMPLATE,
  compactReceipt,
  isRealOggAudio,
  isVoiceSurface,
  listFixtureFiles,
  loadFixture,
  noMatchCopy,
  runVacationEditPipeline,
  stableJobId,
} from '../src/vacation/edit-pipeline.mjs';
import { createTrekFixtureStore, placeDay } from '../src/vacation/trek-fixture-store.mjs';

const cwd = process.cwd();
const fixtures = listFixtureFiles(cwd);
assert.ok(fixtures.length >= 18, `expected at least 18 fixtures, got ${fixtures.length}`);

const byId = new Map();
for (const filePath of fixtures) {
  const fixture = loadFixture(filePath, cwd);
  const first = runVacationEditPipeline(fixture, { persist: true, cwd });
  const firstEventLines = fs.readFileSync(first.receipt.artifacts.events, 'utf8').trim().split('\n');
  const second = runVacationEditPipeline(fixture, { persist: true, cwd });
  assert.equal(first.receipt.job_id, second.receipt.job_id, `${fixture.fixture_id} job_id must be stable`);
  assert.equal(first.receipt.job_id, stableJobId({ fixtureId: fixture.fixture_id }));
  assert.equal(first.receipt.mode, 'dry-run');
  assert.ok(fs.existsSync(first.receipt.artifacts.events), `${fixture.fixture_id} must write events.jsonl`);
  assert.ok(fs.existsSync(first.receipt.artifacts.dry_run), `${fixture.fixture_id} must write dry-run.json`);
  assert.ok(firstEventLines.length >= 4, `${fixture.fixture_id} events.jsonl must record initialize through complete`);
  assert.equal(JSON.parse(firstEventLines[0]).job_id, first.receipt.job_id);
  const secondEventLines = fs.readFileSync(second.receipt.artifacts.events, 'utf8').trim().split('\n');
  assert.ok(secondEventLines.length > firstEventLines.length, `${fixture.fixture_id} events.jsonl must append, never overwrite`);
  assert.deepEqual(secondEventLines.slice(0, firstEventLines.length), firstEventLines);
  for (const line of secondEventLines) {
    const event = JSON.parse(line);
    assert.ok(event.step, `${fixture.fixture_id} each events.jsonl line is one handoff`);
    assert.equal(event.job_id, first.receipt.job_id);
  }
  assert.ok(first.receipt.stop_rules.length >= 8);
  assert.ok(first.receipt.ok, `${fixture.fixture_id} stop rules failed: ${JSON.stringify(first.receipt.stop_rules.filter((rule) => rule.status === 'fail'))}`);
  if (fixture.expect?.write_ops) {
    assert.deepEqual(first.receipt.planned_writes.map((row) => row.op), fixture.expect.write_ops);
  }
  if (fixture.expect?.no_op_stops) {
    for (const stop of fixture.expect.no_op_stops) {
      assert.ok(first.receipt.no_ops.some((row) => row.reason === stop), `${fixture.fixture_id} missing no-op ${stop}`);
    }
  }
  if (fixture.expect?.response_includes) {
    assert.match(first.receipt.customer_facing_response, new RegExp(fixture.expect.response_includes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  if (fixture.expect?.exact_response) {
    assert.equal(first.receipt.customer_facing_response, fixture.expect.exact_response);
  }
  if (fixture.expect?.forbids) {
    for (const banned of fixture.expect.forbids) {
      assert.doesNotMatch(first.receipt.customer_facing_response, new RegExp(banned, 'i'));
    }
  }
  if (fixture.expect?.page_kind) {
    assert.equal(first.receipt.page_context.kind, fixture.expect.page_kind);
  }
  if (fixture.expect?.context_includes) {
    assert.ok(first.receipt.page_context.item_ids.includes(fixture.expect.context_includes));
  }
  if (fixture.expect?.dropped_clause != null) {
    assert.equal(first.receipt.dropped_clause, fixture.expect.dropped_clause, `${fixture.fixture_id} dropped_clause`);
  }
  if (isVoiceSurface(fixture.surface)) {
    assert.ok(first.receipt.audio_path, `${fixture.fixture_id} voice fixture must keep original audio`);
    assert.ok(fs.existsSync(first.receipt.audio_path), `${fixture.fixture_id} audio path missing`);
    assert.ok(isRealOggAudio(first.receipt.audio_path), `${fixture.fixture_id} .ogg must be real OggS audio, not a text stub`);
    const magic = Buffer.alloc(4);
    const fd = fs.openSync(first.receipt.audio_path, 'r');
    fs.readSync(fd, magic, 0, 4, 0);
    fs.closeSync(fd);
    assert.equal(magic.toString('ascii'), 'OggS');
    assert.equal(first.receipt.transcript, fixture.transcript || fixture.text);
    assert.ok(fs.existsSync(path.join(first.receipt.artifacts.dir, 'transcript.txt')));
    if (Array.isArray(fixture.itinerary_before)) {
      assert.deepEqual(
        first.receipt.before_state.items.map((item) => ({ id: item.id, day: item.day })),
        fixture.itinerary_before.map((item) => ({ id: item.id, day: item.day })),
      );
    }
  }
  if (fixture.expect?.preserve_audio_path) {
    assert.ok(first.receipt.audio_path && first.receipt.audio_path.endsWith('.ogg'));
    assert.ok(fs.existsSync(first.receipt.audio_path));
  }
  byId.set(fixture.fixture_id, first);
}

assert.equal(byId.get('exact-no-match').receipt.customer_facing_response, noMatchCopy('Remove the volcano helicopter tour'));
assert.equal(NO_MATCH_TEMPLATE, 'I heard "{heard}", couldn\'t find a match, what do you mean?');

const list = byId.get('shared-page-voice-list');
assert.equal(list.receipt.page_context.item_ids.length, 4, 'list-page voice must receive every visible item');

const multi = byId.get('telegram-voice-multi-intent');
assert.equal(multi.intents.length, 3);
assert.deepEqual(multi.intents.map((intent) => intent.kind), ['remove', 'move', 'research']);
assert.ok(multi.receipt.planned_writes.length === 2);
assert.ok(multi.receipt.no_ops.some((row) => row.reason === 'unsupported_research'));
assert.equal(multi.receipt.dropped_clause, false);
assert.ok(multi.receipt.audio_path.endsWith('kim-vegas-multi-clause.ogg'));

const dropped = byId.get('telegram-voice-clause-drop');
assert.equal(dropped.receipt.dropped_clause, true);
assert.equal(dropped.receipt.planned_writes.length, 0, 'multi-request voice must fail closed if a clause drops');
assert.ok(dropped.receipt.no_ops.every((row) => row.reason === 'dropped_clause'));
assert.deepEqual(
  dropped.receipt.after_state.items.map((item) => item.day),
  dropped.receipt.before_state.items.map((item) => item.day),
);

const stale = byId.get('stale-trip-media');
assert.equal(stale.receipt.planned_writes.length, 0);
assert.ok(stale.receipt.no_ops.some((row) => row.reason === 'stale_trip_media'));

const ownerUpload = byId.get('authorized-owner-upload');
const publicLink = byId.get('unauthorized-upload');
const loggedOut = byId.get('unauthorized-upload-logged-out');
const kimUnpaid = byId.get('unauthorized-upload-unpaid-collaborator');
assert.deepEqual(ownerUpload.receipt.planned_writes.map((row) => row.op), ['attach_media']);
assert.equal(publicLink.receipt.planned_writes.length, 0);
assert.equal(loggedOut.receipt.planned_writes.length, 0);
assert.equal(kimUnpaid.receipt.planned_writes.length, 0);
assert.notEqual(ownerUpload.receipt.actor.identity, kimUnpaid.receipt.actor.identity);
assert.notEqual(ownerUpload.receipt.actor.identity, loggedOut.receipt.actor.identity);
assert.notEqual(ownerUpload.receipt.actor.identity, publicLink.receipt.actor.identity);
assert.equal(ownerUpload.receipt.actor.role, 'owner');
assert.equal(kimUnpaid.receipt.actor.role, 'unpaid_collaborator');
assert.equal(loggedOut.receipt.actor.role, 'logged-out');
assert.equal(publicLink.receipt.actor.role, 'public-link');
for (const row of [ownerUpload, publicLink, loggedOut, kimUnpaid]) {
  assert.equal(row.receipt.intents[0]?.kind || 'media_upload', 'media_upload');
  assert.equal(loadFixture(row.receipt.fixture_path, cwd).media.bound_trip_id, 'trip-vegas-live-001');
}

const split = byId.get('split-trip-trek-uniqueness');
assert.equal(split.receipt.planned_writes.length, 0);
assert.ok(split.receipt.no_ops.some((row) => row.reason === 'duplicate_trek'));
assert.deepEqual(split.receipt.trek_state.row_ids_before, ['41']);
assert.deepEqual(split.receipt.trek_state.row_ids_after, ['41']);
assert.equal(split.receipt.trek_state.row_count_before, 1);
assert.equal(split.receipt.trek_state.row_count_after, 1);

const missing = byId.get('checkout-entitlements-missing');
assert.equal(missing.receipt.planned_writes.length, 0);
assert.ok(missing.receipt.no_ops.some((row) => row.reason === 'checkout_entitlement'));

const checkout = byId.get('checkout-entitlements');
assert.match(checkout.receipt.customer_facing_response, /unlimited trips, photo upload, and video upload/);

const alias = byId.get('alias-omeke');
assert.equal(alias.receipt.planned_writes[0].title, 'Umekes Fish Market Bar & Grill');

const applied = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  apply: true,
  applyScope: 'local_snapshot',
  persist: true,
  cwd,
});
assert.equal(applied.receipt.mode, 'apply_local_snapshot');
assert.equal(applied.receipt.apply_scope, 'local_snapshot');
assert.notEqual(applied.receipt.before_hash, applied.receipt.after_hash);
assert.equal(applied.receipt.after_state.items.find((item) => item.id === 'thing-bellagio-fountains').day, 2);
assert.equal(applied.receipt.stop_rules.find((rule) => rule.id === 'prove_state_movement').status, 'hold');
assert.match(applied.receipt.stop_rules.find((rule) => rule.id === 'prove_state_movement').detail, /not product\/TREK state/);

const noopApply = runVacationEditPipeline(loadFixture('features/fixtures/exact-no-match.json', cwd), {
  apply: true,
  applyScope: 'local_snapshot',
  persist: true,
  cwd,
});
assert.equal(noopApply.receipt.before_hash, noopApply.receipt.after_hash);

const receipt = compactReceipt(applied.receipt);
assert.ok(receipt.required_artifacts.includes('final keepsake PDF'));
assert.ok(receipt.events_jsonl.endsWith('events.jsonl'));
assert.equal(receipt.apply_scope, 'local_snapshot');

const appendJobId = `vac-verify-events-append-${process.pid}`;
const appendFirst = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  persist: true,
  jobId: appendJobId,
  cwd,
});
const appendFirstLines = fs.readFileSync(appendFirst.receipt.artifacts.events, 'utf8');
const appendSecond = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  persist: true,
  jobId: appendJobId,
  cwd,
});
const appendSecondLines = fs.readFileSync(appendSecond.receipt.artifacts.events, 'utf8');
assert.ok(appendSecondLines.startsWith(appendFirstLines), 'events.jsonl must keep prior handoffs when appending');
assert.ok(appendSecondLines.split('\n').filter(Boolean).length > appendFirstLines.split('\n').filter(Boolean).length);

const shared = JSON.parse(fs.readFileSync(path.join(cwd, 'features/fixtures/_shared-vegas-trip.json'), 'utf8'));
const bellagioDb = path.join(os.tmpdir(), `vacation-trek-sqlite-bellagio-${process.pid}.db`);
const bellagioStore = createTrekFixtureStore({
  dbPath: bellagioDb,
  trip: { ...shared, trek_trip_id: 41, token: 'las-vegas-strip-vacation' },
});
const idsBefore = bellagioStore.snapshot().row_ids;
assert.equal(placeDay(bellagioStore.snapshot(), 'thing-bellagio-fountains'), 1);
const bellagio = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  apply: true,
  applyScope: 'trek_sqlite',
  trekStore: bellagioStore,
  persist: true,
  cwd,
});
assert.equal(placeDay(bellagioStore.snapshot(), 'thing-bellagio-fountains'), 2, 'trek_sqlite bellagio test: day1→day2');
assert.deepEqual(bellagioStore.snapshot().row_ids, idsBefore, 'trek_sqlite bellagio test: TREK id-set must stay unique');
assert.equal(bellagio.receipt.trek_state.row_count_before, 1);
assert.equal(bellagio.receipt.trek_state.row_count_after, 1);
assert.equal(bellagio.receipt.trek_state.item_moved, true);
assert.equal(bellagio.receipt.mode, 'apply_trek_sqlite');
bellagioStore.dispose();

console.log(`vacation-edit-pipeline verification lever passed (${fixtures.length} fixtures)`);
