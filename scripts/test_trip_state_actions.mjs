import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createTripStateActions } from '../src/vacation/trip-state-actions.mjs';
import { tripStateCapabilities } from '../src/vacation/trip-state-action-registry.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { replyRulesSystem } from './vacation-app-reply-rules.mjs';

const schema = JSON.parse(readFileSync(new URL('./fixtures/trip-state-actions/trip-state.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strictRequired: false, strictTypes: false });
addFormats(ajv);
const valid = ajv.compile(schema);
function conforms(state) {
  assert.equal(valid(state), true, JSON.stringify(valid.errors));
}
const tripId = 'cbb020d4-a8e4-4bc5-9150-d7712230adfa';
const actorId = '31606504-cd3e-460d-8fbf-ff35e23a8205';
const trip = {
  id: tripId, customer_id: actorId, title: 'Spring trip', destination: 'Orlando',
  start_date: '2027-04-05', end_date: '2027-04-09', metadata: { intakeShare: true }, status: 'onboarding',
};

function fixture({ things = [], invites = {} } = {}) {
  const records = new Map();
  const current = { trip, things: structuredClone(things), invites: structuredClone(invites) };
  let hideRead = false;
  let hideAssignments = false;
  let transactFailure = false;
  let count = 0;
  let serial = Promise.resolve();
  const key = (ctx) => [ctx.tripId, ctx.requestId, ctx.operationKey].join(':');
  const getSite = (ctx) => ctx.tripId === tripId && ctx.actorId === actorId
    ? structuredClone({ ...current, record: records.get(key(ctx)) })
    : null;
  const store = {
    available: true,
    async read(ctx) {
      if (hideRead) throw new Error('Offline read');
      const site = getSite(ctx);
      if (hideAssignments) {
        for (const row of site.things) delete row.metadata?.tripState?.occurrences;
      }
      return site;
    },
    async transact(ctx, plan) {
      const previous = serial;
      let release;
      serial = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        const site = getSite(ctx);
        if (!site) return null;
        const { next, record } = plan(site);
        if (next) {
          count += 1;
          current.things = next.things;
          current.invites = next.invites;
          records.set(key(ctx), structuredClone(record));
          if (transactFailure) throw new Error('Acknowledgment lost');
        }
        return record;
      } finally {
        release();
      }
    },
  };
  const state = {
    version: '1.0', trip_id: tripId, updated_turn: 1, revision: 1, phase: 'planning', scope: { mode: 'full', omitted: {} },
    capabilities: tripStateCapabilities({ env: {} }), saved: {}, disclosed: {}, candidates: {},
    research: { key: null, state: 'waiting', turn: 1, areas: [], gaps: [] },
    proposals: {}, open_asks: [], answered: [], said: [], last_actions: [], tool_status: [],
    next_steps: [{ kind: 'wait', task: 'Wait for the next request.', refs: [] }],
    updates: [{ section: 'saved', source: 'site_read', turn: 1 }],
  };
  const executor = createTripStateActions({ store, env: { VK_TRIP_STATE_ACTIONS: 'true' } });
  const execute = async (context, op, args) => {
    const result = await executor.execute({ context, op, args });
    conforms(result.state);
    return result;
  };
  return {
    executor, execute, store, state, current, records,
    count: () => count,
    hideRead: (value) => { hideRead = value; },
    hideAssignments: (value) => { hideAssignments = value; },
    loseAcknowledgment: (value) => { transactFailure = value; },
  };
}

async function contextFor(f, requestId, options = {}) {
  const state = options.state || f.state;
  const context = { tripId, actorId, requestId, operationKey: 'first', state, turn: state.updated_turn + 1, ...options };
  const saved = await f.executor.read(context);
  const { customerText = '', spans = {}, commands = [], source = 'customer', authorityId = 'current', selectedCandidates, researchKey } = options;
  context.state = { ...state, saved, tool_status: [], last_actions: [] };
  context.siteRevision = saved.site_revision;
  context.customerText = customerText;
  context.authority = {
    source, id: authorityId, commands, selectedCandidates, researchKey,
    spans: Object.fromEntries(Object.entries(spans).map(([ref, [kind, label]]) => {
      const start = customerText.indexOf(label);
      assert.ok(start >= 0);
      return [ref, { kind, start, end: start + label.length }];
    })),
  };
  return context;
}

const cmd = (op, args, as) => ({ op, args, ...(as ? { as } : {}) });
const named = (type, label, evidence = 'name') => ({ type, label, evidence });

{
  const f = fixture();
  const args = named('park', 'Botanical Gardens');
  const op = 'add_named_item';
  const ctx = await contextFor(f, 'named', {
    customerText: 'Please save Botanical Gardens.', spans: { name: ['place', args.label] }, commands: [cmd(op, args)],
  });
  const first = await f.execute(ctx, op, args);
  assert.equal(first.status.result, 'applied');
  assert.equal(first.actions.length, 1);
  const second = await f.execute(ctx, op, args);
  assert.equal(second.status.result, 'no_change');
  assert.equal(second.status.receipt, first.status.receipt);
  assert.deepEqual(second.status.refs, first.status.refs);
  assert.deepEqual(second.actions, []);
  assert.equal(f.count(), 1);
  const mismatched = await f.execute(ctx, op, { ...args, label: 'Other Place' });
  assert.equal(mismatched.status.result, 'conflict');
  assert.equal(f.count(), 1);

  const item = first.status.refs[0];
  const [day, next, third] = Object.keys(first.state.saved.days);
  const a = { item, day, role: 'visit' };
  const b = { item, day: next, role: 'visit' };
  const placementCtx = await contextFor(f, 'placements', { state: first.state, commands: [cmd('place_on_day', a), cmd('place_on_day', b)] });
  const placed = await f.execute(placementCtx, 'place_on_day', a);
  const repeated = await f.execute({ ...placementCtx, operationKey: 'other', siteRevision: placed.state.saved.site_revision }, 'place_on_day', b);
  assert.equal(repeated.status.result, 'applied');
  assert.notEqual(placed.status.refs[0], repeated.status.refs[0]);
  const move = { item, day: third, role: 'visit', move: repeated.status.refs[0] };
  const moveCtx = await contextFor(f, 'move', { state: repeated.state, commands: [cmd('place_on_day', move)] });
  const moved = await f.execute(moveCtx, 'place_on_day', move);
  assert.equal(moved.status.result, 'applied');
  assert.equal(moved.state.saved.days[day].assigned[0].id, placed.status.refs[0]);
  assert.deepEqual(moved.state.saved.days[next].assigned, []);
  assert.equal(moved.state.saved.days[third].assigned[0].id, repeated.status.refs[0]);
  assert.equal(moved.state.saved.days[third].assigned[0].time, null);
  const shared = sharedTripFromIntake({ trip, things: f.current.things.map(thingRecordFromTripRow) });
  assert.equal(String(shared.assignments[third][0].id), repeated.status.refs[0]);

  const denied = await f.execute({ ...moveCtx, actorId: 'ungranted' }, 'place_on_day', move);
  assert.equal(denied.status.result, 'denied');
  const stale = await f.execute({ ...placementCtx, operationKey: 'stale' }, 'place_on_day', a);
  assert.equal(stale.status.result, 'conflict');
}

{
  const f = fixture();
  const initial = await contextFor(f, 'batch');
  const [day] = Object.keys(initial.state.saved.days);
  const item = named('activity', 'Pool time');
  const bad = named('activity', 'Nothing has been booked', 'status');
  const a = cmd('add_named_item', item, 'pool');
  const b = cmd('place_on_day', { item: '$pool', day, role: 'visit' });
  const c = cmd('add_named_item', bad);
  const ctx = await contextFor(f, 'batch', {
    customerText: 'Pool time on Monday. Nothing has been booked.',
    spans: { name: ['plan_block', item.label], status: ['status', bad.label] }, commands: [a, b, c],
  });
  const args = { authority: 'current', operations: [a, b, c] };
  const batch = await f.execute(ctx, 'save_plan', args);
  assert.equal(batch.status.result, 'partial');
  assert.deepEqual(batch.operations.map((row) => row.result), ['applied', 'applied', 'denied']);
  assert.equal(batch.state.saved.days[day].assigned.length, 1);
  assert.deepEqual(Object.values(batch.state.saved.items).map((row) => row.title), [item.label]);
  const replay = await f.execute(ctx, 'save_plan', args);
  assert.deepEqual(replay.operations.map((row) => row.result), ['no_change', 'no_change', 'denied']);
  assert.equal(f.count(), 1);

  const asApp = await contextFor(f, 'reply', {
    customerText: 'Pool time', source: 'app_reply', spans: { name: ['plan_block', 'Pool time'] }, commands: [a],
  });
  assert.equal((await f.execute(asApp, 'add_named_item', item)).status.result, 'denied');
  const oversized = await f.execute({ ...ctx, operationKey: 'oversized', siteRevision: batch.state.saved.site_revision },
    'save_plan', { authority: 'current', operations: Array(33).fill(a) });
  assert.equal(oversized.status.result, 'needs_info');
}

{
  const f = fixture();
  const labels = ['Lake Buena Vista hotel', 'THE LAKE BUENA VISTA HOTEL', 'The Lake Buena Vista Hotel.',
    'Lake-Buena Vista Hotel!', 'lake  buena vista hotel', '“Lake Buena Vista Hotel”', 'lake buena vista hotel?'];
  const variants = labels.map((label, index) => cmd('add_named_item', named('hotel', label, `name-${index}`)));
  const ctx = await contextFor(f, 'hotel', {
    customerText: labels.join(' / '), spans: Object.fromEntries(labels.map((label, index) => [`name-${index}`, ['place', label]])),
    commands: variants,
  });
  const result = await f.execute(ctx, 'save_plan', { authority: 'current', operations: variants });
  assert.equal(result.status.result, 'applied');
  assert.deepEqual(result.operations.map((row) => row.result), ['applied', ...Array(6).fill('no_change')]);
  assert.equal(Object.keys(result.state.saved.items).length, 1);
  const hotel = result.status.refs[0];
  const [first, next, , , last] = Object.keys(result.state.saved.days);
  const args = { hotel, check_in: first, check_out: last };
  const stayCtx = await contextFor(f, 'stay', { state: result.state, commands: [cmd('set_stay', args)] });
  const stayed = await f.execute(stayCtx, 'set_stay', args);
  assert.equal(stayed.status.result, 'applied');
  const checkIn = stayed.state.saved.days[first].assigned[0];
  const checkOut = stayed.state.saved.days[last].assigned[0];
  assert.equal(checkIn.role, 'check_in');
  assert.equal(checkOut.role, 'check_out');
  assert.equal(checkIn.time, null);
  assert.equal(checkOut.time, null);
  assert.deepEqual(stayed.state.saved.lodging[hotel], { check_in: first, check_out: last, via: 'chat_action', turn: stayCtx.turn });

  const adjustment = {
    ...args, check_in: next, check_out_time: { value: 'early morning', precision: 'window' }, check_out_evidence: 'window',
  };
  const adjustedCtx = await contextFor(f, 'stay-move', {
    state: stayed.state, customerText: 'Checkout early morning.', spans: { window: ['time', 'early morning'] },
    commands: [cmd('set_stay', adjustment)],
  });
  const adjusted = await f.execute(adjustedCtx, 'set_stay', adjustment);
  assert.equal(adjusted.status.result, 'applied');
  assert.deepEqual(adjusted.state.saved.days[first].assigned, []);
  assert.equal(adjusted.state.saved.days[next].assigned[0].id, checkIn.id);
  assert.equal(adjusted.state.saved.days[last].assigned[0].id, checkOut.id);
  assert.deepEqual(adjusted.state.saved.days[last].assigned[0].time, adjustment.check_out_time);

  const wrong = named('activity', labels[0]);
  const wrongCtx = await contextFor(f, 'wrong-type', {
    state: adjusted.state, customerText: labels[0], spans: { name: ['place', labels[0]] }, commands: [cmd('add_named_item', wrong)],
  });
  assert.equal((await f.execute(wrongCtx, 'add_named_item', wrong)).status.result, 'conflict');
  assert.equal(f.current.things.length, 1);

  const pickedState = { ...adjusted.state,
    research: { key: 'scope', state: 'complete', turn: adjusted.state.updated_turn, areas: ['Orlando'], gaps: [] },
    candidates: { option: { type: 'hotel', title: 'Palm Court Inn', area: 'Orlando', source: 'vk_search',
      result_id: 'provider-1', turn: adjusted.state.updated_turn, facts: [] } },
  };
  const promotion = { candidate: 'option', replace_hotel: hotel };
  const unpicked = await contextFor(f, 'unpicked', { state: pickedState, researchKey: 'scope', commands: [cmd('add_from_search', promotion)] });
  assert.equal((await f.execute(unpicked, 'add_from_search', promotion)).status.result, 'needs_info');
  const picked = await f.execute({ ...unpicked, operationKey: 'picked', authority: { ...unpicked.authority, selectedCandidates: ['option'] } },
    'add_from_search', promotion);
  assert.equal(picked.status.result, 'applied');
  assert.equal(picked.state.saved.items[hotel].title, 'Palm Court Inn');
  assert.equal(picked.state.saved.days[next].assigned[0].id, checkIn.id);
  assert.deepEqual(picked.state.candidates, {});
  assert.equal(f.current.things.length, 1);
}

{
  const f = fixture();
  const op = 'hold_invite';
  const args = { name: 'Morgan', access: 'edit' };
  const ctx = await contextFor(f, 'hold', { customerText: 'Hold the edit invite for Morgan.', commands: [cmd(op, args)] });
  const result = await f.execute(ctx, op, args);
  assert.equal(result.status.result, 'applied');
  assert.deepEqual(Object.values(result.state.saved.invites), [{ ...args, status: 'held', via: 'chat_action', turn: ctx.turn }]);
  assert.equal(result.state.capabilities.actions.invite_collaborator.reason, 'on_hold');
  assert.equal(f.current.things.length, 0);
  assert.equal(Object.keys(f.current.invites).length, 1);
  const bad = { name: 'Each of them', access: 'edit' };
  const unnamed = await contextFor(f, 'unnamed', { customerText: 'Each of them', commands: [cmd(op, bad)] });
  assert.equal((await f.execute(unnamed, op, bad)).status.result, 'needs_info');

  const off = createTripStateActions({ store: { transact: () => assert.fail('flag OFF entered store'), read: () => assert.fail('flag OFF read store') }, env: {} });
  const offResult = await off.execute({ context: ctx, op, args });
  assert.equal(offResult.status.result, 'denied');
  assert.equal(await off.read(ctx), null);
  for (const [name, value] of Object.entries(offResult.state.capabilities.actions)) {
    assert.equal(value.enabled, false, name);
    assert.equal(value.reason, 'not_wired', name);
  }
  conforms(offResult.state);
  const promptHash = await import('node:crypto').then(({ createHash }) => createHash('sha256')
    .update(replyRulesSystem({}, '', 'Spring trip', false, 'Please save Botanical Gardens.', { VK_TRIP_STATE_ACTIONS: '0' })).digest('hex'));
  assert.equal(promptHash, 'bff403fdd8a2593f1300c5f3ceb0e643fc0ab5042274dc7bcee1e5cda736d5d2');
}

{
  const f = fixture();
  const args = named('park', 'Botanical Gardens');
  const op = 'add_named_item';
  const ctx = await contextFor(f, 'lost', {
    customerText: args.label, spans: { name: ['place', args.label] }, commands: [cmd(op, args)],
  });
  f.hideRead(true);
  const pending = await f.execute(ctx, op, args);
  assert.equal(pending.status.result, 'pending_readback');
  assert.deepEqual(pending.actions, []);
  f.hideRead(false);
  const recovered = await f.execute({ ...ctx, state: pending.state }, op, args);
  assert.equal(recovered.status.result, 'no_change');
  assert.equal(recovered.actions[0].receipt, pending.status.receipt);
  assert.equal(f.count(), 1);

  const [item] = recovered.status.refs;
  const [day] = Object.keys(recovered.state.saved.days);
  const time = { value: '08:30', precision: 'exact' };
  const timed = { item, day, role: 'visit', time, time_evidence: 'clock' };
  const noClock = await contextFor(f, 'no-clock', {
    state: recovered.state, customerText: 'Put it in the morning.', spans: { clock: ['time', 'morning'] }, commands: [cmd('place_on_day', timed)],
  });
  assert.equal((await f.execute(noClock, 'place_on_day', timed)).status.result, 'denied');
  const clock = await contextFor(f, 'clock', {
    state: recovered.state, customerText: 'Put it at 8:30 AM.', spans: { clock: ['time', '8:30 AM'] }, commands: [cmd('place_on_day', timed)],
  });
  f.loseAcknowledgment(true);
  const result = await f.execute(clock, 'place_on_day', timed);
  assert.equal(result.status.result, 'applied');
  assert.deepEqual(result.state.saved.days[day].assigned[0].time, time);
  assert.equal(f.count(), 3);
  f.hideAssignments(true);
  assert.equal((await f.execute(clock, 'place_on_day', timed)).status.result, 'pending_readback');
}

console.log('Trip State action executor tests passed.');
