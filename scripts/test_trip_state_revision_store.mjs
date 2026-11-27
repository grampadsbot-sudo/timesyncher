import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { digestTripState, readTripStateSite } from '../src/vacation/trip-state-action-site.mjs';
import { intId } from '../src/vacation/intake-shared-trip.mjs';
import { projectTripState } from '../src/vacation/trip-state-projector.mjs';
import {
  createTripStateRevisionStore, getTripStateRevisionForTurn, listTripStateRevisions,
} from '../src/vacation/trip-state-revision-store.mjs';

const file = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ajv = new Ajv2020({ strictRequired: false, strictTypes: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(file('../src/vacation/trip-state.schema.json')));
const example = JSON.parse(file('./fixtures/trip-state-actions/after-t6.json'));
const tripId = 'b24d0645-8dea-4cbe-97de-fce01f5a4814';
const actorId = '85b0757c-a9d7-4bb0-96d4-78c28a4c86d5';
const trip = {
  id: tripId, customer_id: actorId, title: example.saved.trip.title, destination: example.saved.trip.destination,
  start_date: example.saved.trip.start, end_date: example.saved.trip.end, status: 'onboarding',
  metadata: { trip_state_actions: true, intakeShare: true },
};
const dayIds = Object.fromEntries(Object.entries(example.saved.days)
  .map(([key, { date }]) => [key, String(intId(`${tripId}:day:${date}`))]));
const itemIds = Object.fromEntries(Object.keys(example.saved.items).map((key, i) => [
  key, `10000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`,
]));
const things = Object.entries(example.saved.items).map(([key, { title, type, ...item }]) => {
  const { check_in, check_out, ...stay } = example.saved.lodging[key] || {};
  const occurrences = Object.entries(example.saved.days).flatMap(([day, { assigned }]) =>
    assigned.flatMap(({ item, ...row }, index) => item === key ? [{
      ...row, day: dayIds[day], ...(assigned[index + 1] ? { before: assigned[index + 1].id } : {}),
    }] : []));
  return {
    id: itemIds[key], category: type, title, description: '', source: 'customer',
    ratings: [], location: null, starts_at: null, ends_at: null,
    metadata: { tripState: {
      type, ...item, occurrences, ...(check_in ? { stay: { ...stay, check_in: dayIds[check_in], check_out: dayIds[check_out] } } : {}),
    } },
  };
});
const site = { trip, things, invites: {} };
const observed = readTripStateSite(site, null, 6);
const receipts = [{
  operation_key: 'first',
  record: {
    turn: 6,
    outcome: { result: 'applied', detail: 'Verified the requested plan on the site.', refs: ['v2'] },
    proof: { v2: digestTripState({ day: dayIds.d2, row: observed.days[dayIds.d2].assigned[0] }) },
    changes: { v2: { before: null } },
    children: [{
      op: 'place_on_day', receipt: 'r-1', outcome: { result: 'applied', detail: 'Verified placement.', refs: ['v2'] },
    }],
  },
}];
const context = {
  trip, requestId: 'request-6', actorId, turn: 6, env: {}, revision: 1,
  disclosures: example.disclosed, travelers: example.saved.travelers, site, receipts,
};
const state = projectTripState(context);
assert.equal(validate(state), true, ajv.errorsText(validate.errors));
const reverseItemIds = new Map(Object.entries(itemIds).map(([key, id]) => [String(intId(id)), key]));
assert.equal(state.saved.read, 'current');
assert.deepEqual(Object.fromEntries(Object.entries(dayIds).map(([key, id]) => [
  key, {
    date: state.saved.days[id].date,
    assigned: state.saved.days[id].assigned.map((assignment) => ({ ...assignment, item: reverseItemIds.get(assignment.item) })),
  },
])), Object.fromEntries(Object.entries(example.saved.days).map(([id, { date, assigned }]) => [id, { date, assigned }])));
assert.deepEqual(state.saved.travelers, example.saved.travelers);
assert.deepEqual(Object.fromEntries(Object.entries(state.saved.items).map(([id, item]) => [reverseItemIds.get(id), item])), example.saved.items);
assert.deepEqual(state.saved.lodging[String(intId(itemIds.h))], {
  ...example.saved.lodging.h, check_in: dayIds.d1, check_out: dayIds.d5,
});
assert.deepEqual(state.disclosed, example.disclosed);
assert.deepEqual(state.saved.invites, {});
assert.deepEqual(state.saved.collaborators, {});
assert.deepEqual(state.last_actions.find(({ op }) => op === 'save_plan')?.refs, ['v2']);

const moved = structuredClone(site);
for (const thing of moved.things) {
  thing.metadata.tripState.occurrences = thing.metadata.tripState.occurrences.filter(({ id }) => id !== 'v2');
}
const changed = projectTripState({ ...context, site: moved });
assert.equal(changed.last_actions.length, 0);
assert.equal(changed.tool_status.find(({ receipt }) => receipt === 'r-1')?.result, 'pending_readback');
assert.ok(changed.saved.unassigned.includes(String(intId(itemIds.mk))));
const stale = projectTripState({ ...context, site: null, previous: state });
assert.equal(stale.saved.read, 'stale');
assert.deepEqual(stale.saved.days, state.saved.days);
assert.deepEqual(stale.last_actions, []);

const raw = new PGlite({ extensions: { pgcrypto } });
let done = Promise.resolve();
const pool = {
  async connect() {
    const prior = done;
    let release;
    done = new Promise((resolve) => { release = resolve; });
    await prior;
    return { query: raw.query.bind(raw), release };
  },
};
const db = async (parts, ...params) => {
  const sql = parts.reduce((out, part, index) => index ? `${out}$${index}${part}` : part, '');
  return (await raw.query(sql, params)).rows;
};
const replyId = '36018d42-c07a-4e2b-ac40-94b140bf29f0';
try {
  await raw.exec(file('../db/migrations/001_vacation_mvp.sql'));
  await raw.exec(file('../db/migrations/003_trip_things_source.sql'));
  await raw.exec(file('../db/migrations/010_vacation_trip_state_actions.sql'));
  await raw.exec(file('../db/migrations/011_vacation_trip_state_revisions.sql'));
  await db`insert into customers (id) values (${actorId})`;
  await db`
    insert into trips (id, customer_id, title, destination, start_date, end_date, status, metadata)
    values (${tripId}, ${actorId}, ${trip.title}, ${trip.destination}, ${trip.start_date}, ${trip.end_date}, ${trip.status}, ${trip.metadata})
  `;
  for (const item of things) {
    await db`
      insert into trip_things (id, trip_id, category, title, metadata, source)
      values (${item.id}, ${tripId}, ${item.category}, ${item.title}, ${item.metadata}, ${item.source})
    `;
  }
  for (const { record, operation_key } of receipts) {
    await db`
      insert into vacation_trip_state_action_receipts (trip_id, request_id, operation_key, record)
      values (${tripId}, ${context.requestId}, ${operation_key}, ${record})
    `;
  }
  const store = createTripStateRevisionStore({ env: {}, pool });
  const off = { ...trip, metadata: { intakeShare: true } };
  assert.equal(await store.prepare({ ...context, trip: off }), null);
  assert.deepEqual(await listTripStateRevisions(tripId, db), []);
  const [ready, repeated] = await Promise.all([store.prepare(context), store.prepare({ ...context, turn: 99 })]);
  assert.equal(ready.revision, 1);
  assert.deepEqual(repeated, ready);
  assert.equal(JSON.parse(ready.state_json).saved.site_revision, readTripStateSite({
    ...site,
    things: await db`
      select id, category, title, description, metadata, ratings, location, source, starts_at::text, ends_at::text
      from trip_things where trip_id = ${tripId} order by created_at, id
    `,
  }, null, 6).site_revision);
  assert.deepEqual(JSON.parse(ready.state_json).last_actions.find(({ op }) => op === 'save_plan')?.refs, ['v2']);
  assert.equal((await getTripStateRevisionForTurn(tripId, 6, db)).state_json, ready.state_json);
  const ship = {
    tripId, requestId: context.requestId,
    async writeReply(query) {
      const [existing] = await query`select id from transcript_turns where id = ${replyId}`;
      if (existing) return existing;
      const [row] = await query`
        insert into transcript_turns (id, trip_id, speaker) values (${replyId}, ${tripId}, 'app') returning id
      `;
      return row;
    },
  };
  await assert.rejects(store.ship({ ...ship, async writeReply(query) {
    await ship.writeReply(query);
    throw new Error('Reply failed before commit');
  } }), /Reply failed before commit/);
  assert.equal((await listTripStateRevisions(tripId, db)).length, 1);
  assert.deepEqual(await db`select id from transcript_turns where id = ${replyId}`, []);
  const shipped = await store.ship(ship);
  assert.equal(shipped.revision.shipped_reply_id, replyId);
  const shippedRetry = await store.ship({ ...ship, writeReply: () => assert.fail('already shipped') });
  assert.deepEqual(shippedRetry.revision, shipped.revision);
  assert.equal(shippedRetry.reply.id, replyId);
  assert.equal(shippedRetry.reply.duplicateSuppressed, true);
  await db`update trips set metadata = ${off.metadata} where id = ${tripId}`;
  assert.equal(await store.prepare({ ...context, requestId: 'off' }), null);
  assert.equal(await store.ship({ ...ship, writeReply: () => assert.fail('switch off') }), null);
  await db`update trips set metadata = ${trip.metadata} where id = ${tripId}`;
  const nextContext = {
    ...context, requestId: 'request-7', travelers: {}, disclosures: {},
    classification: { ok: true, roster: [{ name: 'Jamie', role: 'collaborator' }, { name: 'Anya', role: 'editor' }] },
    text: 'Jamie is coming with me. Give Anya edit access.',
  };
  const planned = await store.prepare({ ...nextContext, phase: 'planning' });
  const nextReady = await store.prepare(nextContext);
  assert.equal(planned.turn, 7);
  assert.equal(nextReady.turn, 7);
  assert.deepEqual(JSON.parse(nextReady.state_json).last_actions, []);
  const nextSaved = JSON.parse(nextReady.state_json).saved;
  assert.ok(Object.values(nextSaved.travelers).some(({ name }) => name === 'Jamie'));
  assert.ok(!Object.values(nextSaved.travelers).some(({ name }) => name === 'Anya'));
  assert.deepEqual(nextSaved.invites, {});
  const rows = await listTripStateRevisions(tripId, db);
  assert.deepEqual(rows.map(({ revision, phase }) => [revision, phase]), [[1, 'reply_ready'], [2, 'shipped'], [3, 'planning'], [4, 'reply_ready']]);
  assert.equal((await getTripStateRevisionForTurn(tripId, 6, db)).state_json, shipped.revision.state_json);
  assert.equal(await getTripStateRevisionForTurn(tripId, 99, db), null);
  for (const row of rows) {
    const snapshot = JSON.parse(row.state_json);
    assert.equal(validate(snapshot), true, ajv.errorsText(validate.errors));
    assert.equal(snapshot.revision, row.revision);
    assert.equal(snapshot.phase, row.phase);
    assert.equal(snapshot.updated_turn, row.turn);
    assert.equal(snapshot.version, row.schema_version);
    assert.equal(createHash('sha256').update(row.state_json).digest('hex'), row.digest);
  }
} finally {
  await raw.close();
}
console.log('Trip State revision store tests passed.');
