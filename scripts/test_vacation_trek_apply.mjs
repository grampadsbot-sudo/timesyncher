#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { loadFixture, runVacationEditPipeline } from '../src/vacation/edit-pipeline.mjs';
import { createTrekFixtureStore, placeDay } from '../src/vacation/trek-fixture-store.mjs';

const cwd = process.cwd();
const shared = JSON.parse(fs.readFileSync(path.join(cwd, 'features/fixtures/_shared-vegas-trip.json'), 'utf8'));
const dbPath = path.join(os.tmpdir(), `vacation-trek-apply-${process.pid}.db`);
const store = createTrekFixtureStore({
  dbPath,
  trip: { ...shared, trek_trip_id: 41, token: 'las-vegas-strip-vacation' },
});

assert.equal(placeDay(store.snapshot(), 'thing-bellagio-fountains'), 1);
assert.deepEqual(store.snapshot().row_ids, ['41']);
assert.equal(store.snapshot().row_count, 1);

const fixture = loadFixture('features/fixtures/telegram-text-single-edit.json', cwd);
const { receipt } = runVacationEditPipeline(fixture, {
  apply: true,
  applyScope: 'trek_sqlite',
  trekStore: store,
  persist: true,
  cwd,
});
assert.equal(receipt.mode, 'apply_trek_sqlite');
assert.equal(receipt.apply_scope, 'trek_sqlite');
assert.equal(placeDay(store.snapshot(), 'thing-bellagio-fountains'), 2, 'TREK assignment must move Bellagio to day 2');
assert.deepEqual(receipt.trek_state.row_ids_before, ['41']);
assert.deepEqual(receipt.trek_state.row_ids_after, ['41']);
assert.equal(receipt.trek_state.row_count_before, 1);
assert.equal(receipt.trek_state.row_count_after, 1);
assert.equal(receipt.trek_state.item_moved, true);
assert.equal(receipt.trek_state.source, 'trek_sqlite');
assert.equal(receipt.stop_rules.find((rule) => rule.id === 'prove_state_movement').status, 'pass');

const splitStore = createTrekFixtureStore({
  dbPath: `${dbPath}-split`,
  trip: { ...shared, trek_trip_id: 41, token: 'las-vegas-strip-vacation' },
});
const split = runVacationEditPipeline(loadFixture('features/fixtures/split-trip-trek-uniqueness.json', cwd), {
  apply: true,
  applyScope: 'trek_sqlite',
  trekStore: splitStore,
  persist: true,
  cwd,
});
assert.equal(split.receipt.planned_writes.length, 0);
assert.equal(split.receipt.trek_state.row_count_before, 1);
assert.equal(split.receipt.trek_state.row_count_after, 1);
assert.deepEqual(split.receipt.trek_state.row_ids_before, split.receipt.trek_state.row_ids_after);
assert.equal(splitStore.snapshot().row_count, 1);

const refused = spawnSync(process.execPath, [
  path.join(cwd, 'scripts/control-vacation.mjs'),
  'apply',
  '--fixture',
  'features/fixtures/telegram-text-single-edit.json',
], { encoding: 'utf8', cwd });
assert.equal(refused.status, 2, 'bare --apply must refuse without an honest scope flag');
assert.match(refused.stderr, /--local-snapshot|--trek-db/);

const local = spawnSync(process.execPath, [
  path.join(cwd, 'scripts/control-vacation.mjs'),
  'apply',
  '--local-snapshot',
  '--fixture',
  'features/fixtures/telegram-text-single-edit.json',
  '--json',
], { encoding: 'utf8', cwd });
assert.equal(local.status, 0, local.stderr);
const localJson = JSON.parse(local.stdout);
assert.equal(localJson.receipt.mode, 'apply_local_snapshot');
assert.equal(localJson.receipt.stop_rules.find((rule) => rule.id === 'prove_state_movement').status, 'hold');

const trekCliDb = `${dbPath}-cli`;
const trekCli = spawnSync(process.execPath, [
  path.join(cwd, 'scripts/control-vacation.mjs'),
  'apply',
  '--trek-db',
  trekCliDb,
  '--fixture',
  'features/fixtures/telegram-text-single-edit.json',
  '--json',
], { encoding: 'utf8', cwd });
assert.equal(trekCli.status, 0, trekCli.stderr);
const trekJson = JSON.parse(trekCli.stdout);
assert.equal(trekJson.receipt.mode, 'apply_trek_sqlite');
assert.equal(trekJson.receipt.trek_state.item_moved, true);
assert.deepEqual(trekJson.receipt.trek_state.row_ids_before, trekJson.receipt.trek_state.row_ids_after);
assert.equal(trekJson.receipt.stop_rules.find((rule) => rule.id === 'prove_state_movement').status, 'pass');

store.dispose();
splitStore.dispose();
try { fs.rmSync(trekCliDb, { force: true }); } catch { /* ignore */ }

console.log('vacation TREK apply id-set / row-count proof passed');
