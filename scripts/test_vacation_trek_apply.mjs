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

const itineraryDb = `${dbPath}-itinerary-edit`;
const seeded = spawnSync('python3', ['-c', `
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.executescript("""
  CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, color TEXT, icon TEXT);
  CREATE TABLE trips (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, description TEXT, start_date TEXT, end_date TEXT, currency TEXT, updated_at TEXT);
  CREATE TABLE days (id INTEGER PRIMARY KEY, trip_id INTEGER, day_number INTEGER, date TEXT, title TEXT);
  CREATE TABLE places (
    id INTEGER PRIMARY KEY, trip_id INTEGER, name TEXT, description TEXT,
    lat REAL, lng REAL, address TEXT, category_id INTEGER, currency TEXT,
    reservation_status TEXT, place_time TEXT, duration_minutes INTEGER,
    notes TEXT, transport_mode TEXT, website TEXT, updated_at TEXT
  );
  CREATE TABLE day_assignments (
    id INTEGER PRIMARY KEY, day_id INTEGER, place_id INTEGER, order_index INTEGER,
    assignment_time TEXT, notes TEXT, reservation_status TEXT
  );
  CREATE TABLE share_tokens (id INTEGER PRIMARY KEY, trip_id INTEGER, token TEXT);
  CREATE TABLE share_token_overrides (token TEXT PRIMARY KEY, overrides_json TEXT, updated_at TEXT);
""")
db.execute("INSERT INTO trips (id, user_id, title, currency) VALUES (41, 1, 'Las Vegas Strip Vacation', 'USD')")
for num in (1, 2, 3):
    db.execute("INSERT INTO days (trip_id, day_number, date, title) VALUES (41, ?, ?, ?)", (num, f'2026-07-0{num}', f'Day {num}'))
db.execute("INSERT INTO places (id, trip_id, name, notes, reservation_status) VALUES (7, 41, 'Bellagio Fountains', 'thing-bellagio-fountains', 'considering')")
db.execute("INSERT INTO day_assignments (day_id, place_id, order_index, notes) VALUES (1, 7, 0, 'thing-bellagio-fountains')")
db.execute("INSERT INTO share_tokens (trip_id, token) VALUES (41, 'las-vegas-strip-vacation')")
db.commit()
print('ok')
`, itineraryDb], { encoding: 'utf8' });
assert.equal(seeded.status, 0, seeded.stderr);

const refusedReparse = spawnSync(process.execPath, [path.join(cwd, 'scripts/trek-itinerary-edit.mjs')], {
  input: JSON.stringify({
    token: 'las-vegas-strip-vacation',
    dbPath: itineraryDb,
    requestText: 'Add family event',
  }),
  encoding: 'utf8',
});
assert.notEqual(refusedReparse.status, 0);
assert.match(refusedReparse.stderr || refusedReparse.stdout, /validatedWrites/);

const validatedOnly = spawnSync(process.execPath, [path.join(cwd, 'scripts/trek-itinerary-edit.mjs')], {
  input: JSON.stringify({
    token: 'las-vegas-strip-vacation',
    dbPath: itineraryDb,
    requestText: 'Add family event',
    applyValidatedOnly: true,
    validatedWrites: [{
      op: 'move_thing',
      trip_id: 'trip-vegas-live-001',
      item_id: 'thing-bellagio-fountains',
      title: 'Bellagio Fountains',
      from: 'day 1',
      to: 'day 2',
    }],
  }),
  encoding: 'utf8',
});
assert.equal(validatedOnly.status, 0, validatedOnly.stderr);
const applied = JSON.parse(validatedOnly.stdout);
assert.equal(applied.updatedItems.length, 1);
assert.equal(applied.updatedItems[0].action, 'moved');
assert.equal(applied.updatedItems[0].title, 'Bellagio Fountains');
assert.equal(applied.updatedItems[0].day, 2);
assert.equal(applied.operationCount, 1);

const afterState = spawnSync('python3', ['-c', `
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
places = [dict(name=r[0], notes=r[1]) for r in db.execute('SELECT name, notes FROM places')]
days = [dict(name=r[0], day=r[1]) for r in db.execute('SELECT p.name, d.day_number FROM places p JOIN day_assignments da ON da.place_id=p.id JOIN days d ON d.id=da.day_id')]
print(json.dumps({'places': places, 'days': days}))
`, itineraryDb], { encoding: 'utf8' });
assert.equal(afterState.status, 0, afterState.stderr);
const state = JSON.parse(afterState.stdout);
assert.equal(state.places.length, 1);
assert.equal(state.places[0].name, 'Bellagio Fountains');
assert.equal(state.days[0].day, 2);
assert.ok(!state.places.some((row) => /family/i.test(row.name)));

const refusedAgent = spawnSync(process.execPath, [path.join(cwd, 'scripts/trek-agent-edit.mjs')], {
  input: JSON.stringify({
    token: 'las-vegas-strip-vacation',
    dbPath: itineraryDb,
    requestText: 'Add family event',
  }),
  encoding: 'utf8',
});
assert.notEqual(refusedAgent.status, 0);
assert.match(refusedAgent.stderr || refusedAgent.stdout, /validatedWrites/);

try { fs.rmSync(itineraryDb, { force: true }); } catch { /* ignore */ }

console.log('vacation TREK apply id-set / row-count proof passed');
