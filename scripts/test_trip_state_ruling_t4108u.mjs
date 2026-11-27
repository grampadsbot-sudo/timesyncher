import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { completeRosterParty } from '../src/vacation/live-app-turn.mjs';
import { createTripStateActions } from '../src/vacation/trip-state-actions.mjs';
import { tripStateCapabilities } from '../src/vacation/trip-state-action-registry.mjs';
import { runVacationAppTurnActions } from '../src/vacation/vacation-app-turn-actions.mjs';

const ajv = new Ajv2020({ strictRequired: false, strictTypes: false });
addFormats(ajv);
const validates = ajv.compile(JSON.parse(readFileSync(new URL('./fixtures/trip-state-actions/trip-state.schema.json', import.meta.url), 'utf8')));

const tripId = '56830c9f-6517-481f-9f7b-930a61c44102';
const actorId = '4126e7f7-a8d7-4369-baf2-c155ce8b4103';
let site = {
  trip: { id: tripId, customer_id: actorId, title: 'Harbor weekend', destination: 'Harbor City',
    start_date: '2028-05-05', end_date: '2028-05-07', status: 'onboarding', metadata: { trip_state_actions: true } },
  things: [{ id: 'park', category: 'park', title: 'Willow Creek Park', source: 'customer', metadata: {} }],
  invites: {},
};
const records = new Map();
const recordKey = (ctx) => `${ctx.requestId}/${ctx.operationKey}`;
const store = {
  async read(ctx) {
    return ctx.actorId === actorId ? structuredClone({ ...site, record: records.get(recordKey(ctx)) }) : null;
  },
  async transact(ctx, plan) {
    const current = await this.read(ctx);
    if (!current) return null;
    const { record, next } = plan(current);
    if (next) {
      site = next;
      records.set(recordKey(ctx), record);
    }
    return record;
  },
};
const executor = createTripStateActions({ store, env: {} });
const candidate = (title, area = 'Harbor City') => ({
  type: 'restaurant', title, area, source: 'vk_search', result_id: title.replaceAll(' ', '-'), turn: 1, facts: [],
});
let state = {
  version: '1.0', trip_id: tripId, phase: 'planning', updated_turn: 1, revision: 1, scope: { mode: 'full', omitted: {} },
  capabilities: tripStateCapabilities(), saved: {}, disclosed: {},
  research: { key: 'harbor', state: 'complete', areas: ['Harbor City'], gaps: [], turn: 1 },
  candidates: { pier: candidate('North Pier Diner'), market: candidate('Market Cafe'), distant: candidate('Summit Grill', 'Hilltown') },
  proposals: {}, open_asks: [], answered: [], said: [], last_actions: [], tool_status: [],
  next_steps: [{ kind: 'wait', task: 'Wait for the next request.', refs: [] }],
  updates: [{ section: 'saved', source: 'site_read', turn: 1 }],
};
const system = { source: 'system_plan', id: 'first-pass', researchKey: 'harbor' };
const command = (op, args) => ({ op, args });
const proposed = (value) => ({ value, precision: 'proposed' });

async function context(requestId, authority, customerText = '') {
  const ctx = { trip: site.trip, tripId, actorId, requestId, operationKey: 'op', turn: state.updated_turn + 1, state, authority, customerText };
  const saved = await executor.read(ctx);
  return { ...ctx, state: { ...state, saved }, siteRevision: saved.site_revision };
}

async function execute(ctx, op, args) {
  const result = await executor.execute({ context: ctx, op, args });
  assert.equal(validates(result.state), true, JSON.stringify(validates.errors));
  state = result.state;
  return result;
}

const plan = await context('plan', system);
const { items, days } = plan.state.saved;
const [park] = Object.keys(items);
const [dayOne, dayTwo, dayThree] = Object.keys(days);
const first = { item: park, day: dayOne, role: 'visit', time: proposed('09:00') };
const second = { candidate: 'pier', day: dayTwo, role: 'visit', time: proposed('18:30') };
const third = { item: park, day: dayThree, role: 'visit', time: proposed('11:00') };
const batch = {
  authority: system.id, operations: [command('place_on_day', first), command('add_from_search', second), command('place_on_day', third)],
};
const saved = await execute(plan, 'save_plan', batch);
assert.equal(saved.status.result, 'applied');
assert.equal(saved.status.authority, 'system_plan');
assert.equal(saved.actions[0].authority, 'system_plan');
assert.equal(records.get(recordKey(plan)).authority, 'system_plan');
assert.deepEqual(saved.operations.map(({ result, authority }) => [result, authority]), Array(3).fill(['applied', 'system_plan']));
assert.equal(new Set([saved.status, ...saved.operations].map(({ receipt }) => receipt)).size, 4);
for (const placement of [first, second, third]) {
  const [occurrence] = state.saved.days[placement.day].assigned;
  assert.deepEqual(occurrence.time, placement.time);
  assert.equal(occurrence.proposed_by, 'system');
}
assert.equal((await execute(plan, 'save_plan', batch)).status.result, 'no_change');
assert.equal(records.size, 1);

const reschedule = { ...first, time: { value: '10:15', precision: 'exact' }, time_evidence: 'clock' };
const customerText = 'Make it 10:15 AM.';
const changed = await execute(await context('change', {
  source: 'customer', commands: [command('place_on_day', reschedule)],
  spans: { clock: { kind: 'time', start: 8, end: 16 } },
}, customerText), 'place_on_day', reschedule);
assert.equal(changed.status.result, 'applied');
const [updated] = state.saved.days[dayOne].assigned;
assert.equal(updated.id, saved.state.saved.days[dayOne].assigned[0].id);
assert.deepEqual(updated.time, reschedule.time);
assert.equal(updated.proposed_by, 'customer');
assert.equal((await execute(await context('system-replan', system), 'place_on_day', first)).status.result, 'denied');
assert.deepEqual(state.saved.days[dayOne].assigned[0].time, reschedule.time);

const direct = await execute(await context('system-place', system), 'place_on_day', { ...third, time: proposed('10:00') });
assert.equal(direct.status.result, 'applied');
assert.equal(direct.status.authority, 'system_plan');
const directSearch = await execute(await context('system-search', system), 'add_from_search', {
  candidate: 'market', day: dayThree, role: 'visit', time: proposed('13:00'),
});
assert.equal(directSearch.status.result, 'applied');
assert.equal(directSearch.status.authority, 'system_plan');
assert.equal((await execute(await context('outside-scope', system), 'add_from_search', { candidate: 'distant' })).status.result, 'conflict');
assert.equal((await execute(await context('bad-clock', system), 'place_on_day', { ...third, time: proposed('25:00') })).status.result, 'denied');
assert.equal((await execute(await context('false-clock', system), 'place_on_day', { ...third, time: reschedule.time })).status.result, 'denied');
assert.deepEqual(state.saved.days[dayThree].assigned.map(({ time }) => time), [proposed('10:00'), proposed('13:00')]);

const partyText = 'My sister Ana and her kids are coming.';
const roster = [{ name: 'Ana', role: 'collaborator' }, { name: 'Ana', role: 'editor' }, { name: 'Ana', role: 'viewer' }];
const party = completeRosterParty({ roster, turns: [{ role: 'customer', text: partyText }] });
assert.deepEqual([party.collaborators, party.editors, party.viewers], [[], [], []]);
assert.deepEqual(await runVacationAppTurnActions({
  db: {}, session: { id: 'onboarding-ruling', customer_id: actorId }, requestText: partyText,
  classification: { ok: true, roster, inviteeName: 'Ana', inviteeEmail: 'ana@example.com' },
  openSeats: async () => assert.fail('A travel party cannot open a seat.'),
}), {});

const hold = { name: 'Ana', access: 'edit' };
const namedTraveler = await context('traveler', {
  source: 'customer', commands: [command('hold_invite', hold)],
  spans: { person: { kind: 'person', start: 10, end: 13 } },
}, partyText);
assert.equal((await execute(namedTraveler, 'hold_invite', hold)).status.result, 'denied');
assert.equal((await execute(await context('system-invite', system), 'hold_invite', hold)).status.result, 'denied');
assert.deepEqual(state.saved.invites, {});
assert.deepEqual(state.saved.collaborators, {});
assert.deepEqual(site.invites, {});

const grantText = 'Give Ana edit access.';
const grant = await context('explicit-grant', {
  source: 'customer', commands: [command('hold_invite', hold)],
  spans: { grant: { ...hold, kind: 'access_grant', start: 0, end: grantText.length } },
}, grantText);
const held = await execute(grant, 'hold_invite', hold);
assert.equal(held.status.result, 'applied');
assert.deepEqual(Object.values(site.invites), [{ ...hold, status: 'held', via: 'chat_action', turn: grant.turn }]);
assert.equal((await execute(grant, 'hold_invite', hold)).status.result, 'no_change');
assert.equal(Object.keys(site.invites).length, 1);
assert.deepEqual(state.saved.collaborators, {});

console.log('Trip State ruling t4108u passed');
