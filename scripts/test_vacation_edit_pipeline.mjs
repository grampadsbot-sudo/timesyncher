#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  NO_MATCH_TEMPLATE,
  compactReceipt,
  listFixtureFiles,
  loadFixture,
  noMatchCopy,
  runVacationEditPipeline,
  stableJobId,
} from '../src/vacation/edit-pipeline.mjs';

const cwd = process.cwd();
const fixtures = listFixtureFiles(cwd);
assert.ok(fixtures.length >= 14, `expected at least 14 fixtures, got ${fixtures.length}`);

const byId = new Map();
for (const filePath of fixtures) {
  const fixture = loadFixture(filePath, cwd);
  const first = runVacationEditPipeline(fixture, { persist: true, cwd });
  const second = runVacationEditPipeline(fixture, { persist: true, cwd });
  assert.equal(first.receipt.job_id, second.receipt.job_id, `${fixture.fixture_id} job_id must be stable`);
  assert.equal(first.receipt.job_id, stableJobId({ fixtureId: fixture.fixture_id }));
  assert.equal(first.receipt.mode, 'dry-run');
  assert.ok(fs.existsSync(first.receipt.artifacts.events), `${fixture.fixture_id} must write events.jsonl`);
  assert.ok(fs.existsSync(first.receipt.artifacts.dry_run), `${fixture.fixture_id} must write dry-run.json`);
  const events = fs.readFileSync(first.receipt.artifacts.events, 'utf8').trim().split('\n');
  assert.ok(events.length >= 4, `${fixture.fixture_id} events.jsonl must record initialize through complete`);
  assert.equal(JSON.parse(events[0]).job_id, first.receipt.job_id);
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
  if (fixture.expect?.preserve_audio_path) {
    assert.ok(first.receipt.audio_path && first.receipt.audio_path.endsWith('kim-vegas-voice.ogg'));
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

const stale = byId.get('stale-trip-media');
assert.equal(stale.receipt.planned_writes.length, 0);
assert.ok(stale.receipt.no_ops.some((row) => row.reason === 'stale_trip_media'));

const unauthorized = byId.get('unauthorized-upload');
assert.equal(unauthorized.receipt.planned_writes.length, 0);
assert.ok(unauthorized.receipt.no_ops.some((row) => row.reason === 'unauthorized_upload'));
assert.match(unauthorized.receipt.customer_facing_response, /not authorized/i);

const split = byId.get('split-trip-trek-uniqueness');
assert.equal(split.receipt.planned_writes.length, 0);
assert.ok(split.receipt.no_ops.some((row) => row.reason === 'duplicate_trek'));

const missing = byId.get('checkout-entitlements-missing');
assert.equal(missing.receipt.planned_writes.length, 0);
assert.ok(missing.receipt.no_ops.some((row) => row.reason === 'checkout_entitlement'));

const checkout = byId.get('checkout-entitlements');
assert.match(checkout.receipt.customer_facing_response, /unlimited trips, photo upload, and video upload/);

const alias = byId.get('alias-omeke');
assert.equal(alias.receipt.planned_writes[0].title, 'Umekes Fish Market Bar & Grill');

const applied = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  apply: true,
  persist: true,
  cwd,
});
assert.equal(applied.receipt.mode, 'apply');
assert.notEqual(applied.receipt.before_hash, applied.receipt.after_hash);
assert.equal(applied.receipt.after_state.items.find((item) => item.id === 'thing-bellagio-fountains').day, 2);
assert.ok(applied.receipt.stop_rules.find((rule) => rule.id === 'prove_state_movement').status === 'pass');

const noopApply = runVacationEditPipeline(loadFixture('features/fixtures/exact-no-match.json', cwd), {
  apply: true,
  persist: true,
  cwd,
});
assert.equal(noopApply.receipt.before_hash, noopApply.receipt.after_hash);

const receipt = compactReceipt(applied.receipt);
assert.ok(receipt.required_artifacts.includes('final keepsake PDF'));
assert.ok(receipt.events_jsonl.endsWith('events.jsonl'));

console.log(`vacation-edit-pipeline verification lever passed (${fixtures.length} fixtures)`);
