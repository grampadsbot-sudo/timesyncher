import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { persistVacationAppOutboundReply } from '../src/vacation/reply-ship.mjs';
import { createTripStateActions } from '../src/vacation/trip-state-actions.mjs';
import { createTripStateActionStore } from '../src/vacation/trip-state-action-store.mjs';
import { createTripStateRevisionStore } from '../src/vacation/trip-state-revision-store.mjs';
import { measureStoredItinerary } from './harness/itinerary-evidence.mjs';

const raw = new PGlite({ extensions: { pgcrypto } });
const query = raw.query.bind(raw);
const db = async (parts, ...params) => (await query(parts.reduce((sql, part, index) => index ? `${sql}$${index}${part}` : part, ''), params)).rows;
const pool = { connect: async () => ({ query, release() {} }) };
const tripId = randomUUID();
const actorId = randomUUID();
const tag = 'harness:offline:vk-001';
const trip = {
  id: tripId, customer_id: actorId, title: 'Orlando vacation', destination: 'Orlando',
  start_date: '2027-04-05', end_date: '2027-04-09',
  metadata: { harnessTag: tag, replyBackend: 'trip_state', trip_state_actions: true, intakeShare: true },
  status: 'planning',
};
const env = { OPENROUTER_API_KEY: 'test-fixture' };
const revisions = createTripStateRevisionStore({ env, pool });
const actions = createTripStateActions({ env, store: createTripStateActionStore({ env, pool }) });
const session = { trip_id: tripId, customer_id: actorId };
const understanding = { intent: { ask: false, asksPrice: false, asksAccess: false, pullsAccess: false, seats: [] } };
const tool = (op, args, as) => ({ op, args, ...(as ? { as } : {}) });

const dialog = [
  { text: 'We will be in Orlando April 5–9, 2027. Let us keep it easy.', reply: 'We can plan an easy Orlando vacation for April 5–9.' },
  {
    text: 'Yes, save Magic Kingdom for Tuesday and Epcot for Wednesday.',
    reply: 'I saved Magic Kingdom for Tuesday and Epcot for Wednesday.',
    claims: [['Magic Kingdom', '2027-04-06', 'visit'], ['Epcot', '2027-04-07', 'visit']],
    build: ({ named, day }) => [
      named('Magic Kingdom', 'park', 'mk'),
      tool('place_on_day', { item: '$mk', day: day('2027-04-06'), role: 'visit' }),
      named('Epcot', 'park', 'epcot'),
      tool('place_on_day', { item: '$epcot', day: day('2027-04-07'), role: 'visit' }),
    ],
  },
  {
    text: 'Save Hollywood Studios as an option, please.',
    reply: 'I saved Hollywood Studios as an option.',
    build: ({ named }) => [named('Hollywood Studios', 'park')],
  },
  {
    text: 'Let us put Hollywood Studios on Thursday.',
    reply: 'I put Hollywood Studios on Thursday.',
    claims: [['Hollywood Studios', '2027-04-08', 'visit']],
    build: ({ item, day }) => [tool('place_on_day', { item: item('Hollywood Studios'), day: day('2027-04-08'), role: 'visit' })],
    single: true,
  },
  {
    text: 'Please save Pop Century Resort with check-in Monday and check-out Friday.',
    reply: 'I saved Pop Century Resort with check-in Monday and check-out Friday.',
    claims: [['Pop Century Resort', '2027-04-05', 'check_in'], ['Pop Century Resort', '2027-04-09', 'check_out']],
    build: ({ named, day }) => [
      named('Pop Century Resort', 'hotel', 'hotel'),
      tool('set_stay', { hotel: '$hotel', check_in: day('2027-04-05'), check_out: day('2027-04-09') }),
    ],
  },
  {
    text: 'Could Monday work for Magic Kingdom instead?',
    reply: 'Magic Kingdom is still saved for Tuesday.',
    claims: [['Magic Kingdom', '2027-04-06', 'visit']],
    build: ({ item, day }) => [tool('place_on_day', { item: item('Magic Kingdom'), day: day('2027-04-05'), role: 'visit' })],
    single: true,
    tentative: true,
  },
];

function planTools({ text, build, single }, state) {
  const spans = {};
  const commands = build?.({
    day: (date) => Object.keys(state.saved.days).find((id) => state.saved.days[id].date === date),
    item: (title) => Object.keys(state.saved.items).find((id) => state.saved.items[id].title === title),
    named(label, type, as) {
      const evidence = `place-${Object.keys(spans).length}`;
      const start = text.indexOf(label);
      assert.ok(start >= 0);
      spans[evidence] = { kind: 'place', start, end: start + label.length };
      return tool('add_named_item', { type, label, evidence }, as);
    },
  }) || [];
  const call = commands.length ? (single ? commands[0] : tool('save_plan', { authority: 'current', operations: commands })) : null;
  return { spans, commands, call };
}

function savedClaims(state) {
  return Object.values(state.saved.days).flatMap((day) => day.assigned.map((entry) => [
    state.saved.items[entry.item].title, day.date, entry.role,
  ]));
}

const originalFetch = globalThis.fetch;
const originalPath = process.env.PATH;
try {
  for (const migration of ['001_vacation_mvp', '003_trip_things_source', '010_vacation_trip_state_actions', '011_vacation_trip_state_revisions']) {
    await raw.exec(readFileSync(new URL(`../db/migrations/${migration}.sql`, import.meta.url), 'utf8'));
  }
  await db`insert into customers (id) values (${actorId})`;
  await db`
    insert into trips (id, customer_id, title, destination, start_date, end_date, metadata, status)
    values (${tripId}, ${actorId}, ${trip.title}, ${trip.destination}, ${trip.start_date}, ${trip.end_date}, ${trip.metadata}, ${trip.status})
  `;
  process.env.PATH = '/nonexistent';
  const priorTurns = [];
  const dispatched = [];
  let lastState;
  for (const [index, exchange] of dialog.entries()) {
    const turn = 2 * index + 1;
    const requestId = randomUUID();
    await db`insert into vacation_requests (id, customer_id, trip_id, request_text) values (${requestId}, ${actorId}, ${tripId}, ${exchange.text})`;
    const prepareArgs = { trip, requestId, actorId, turn, text: exchange.text };
    const planning = await revisions.prepare({ ...prepareArgs, phase: exchange.build ? 'planning' : 'reply_ready' });
    const { call, commands, spans } = planTools(exchange, JSON.parse(planning.state_json));
    let servedTools = false;
    globalThis.fetch = async (url, init) => {
      const pathname = new URL(url).pathname;
      const body = JSON.parse(init.body);
      if (pathname.endsWith('/decisions')) {
        return Response.json({ answers: {
          overall_quality: { score: 5 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' },
          claims_mutation: { noul: call && !exchange.tentative ? 0.99 : 0.01 }, change_claim_grounded: { noul: 0.99 },
        } });
      }
      assert.equal(pathname, '/api/v1/chat/completions');
      if (call && !servedTools) {
        assert.ok(body.tools.some((entry) => entry.function.name === call.op));
        servedTools = true;
        dispatched.push(call.op);
        return Response.json({ model: body.model, choices: [{ message: { tool_calls: [
          { type: 'function', function: { name: call.op, arguments: JSON.stringify(call.args) } },
        ] } }] });
      }
      return Response.json({ model: body.model, choices: [{ message: { content: exchange.reply } }] });
    };
    const produced = await produceLiveAppReply({
      customerTurn: exchange.text, session, priorTurns, trip, env, understanding,
      tripStateRevision: planning, tripStateActions: actions, tripStateStore: revisions,
      tripStateActionContext: {
        trip, tripId, actorId, requestId, operationKey: 'agreement', turn, customerText: exchange.text,
        authority: { source: 'customer', id: 'current', commands: exchange.tentative ? [] : commands, spans },
        prepareArgs,
      },
    });
    assert.equal(produced.reply, exchange.reply, JSON.stringify({ reason: produced.reason, status: produced.tripStateContext.state.tool_status, actions: produced.tripStateContext.state.last_actions }));
    lastState = produced.tripStateContext.state;
    if (index === 2) assert.ok(Object.values(lastState.saved.items).some((item) => item.title === 'Hollywood Studios'));
    for (const claim of exchange.claims || []) assert.ok(savedClaims(lastState).some((stored) => JSON.stringify(stored) === JSON.stringify(claim)), claim.join(' '));
    if (exchange.tentative) {
      assert.equal(lastState.tool_status.find((row) => row.op === 'place_on_day')?.result, 'denied');
      assert.ok(!savedClaims(lastState).some(([title, day]) => title === 'Magic Kingdom' && day === '2027-04-05'));
    }
    const shipped = await persistVacationAppOutboundReply({
      db, tripId, requestId, transcriptOwnerId: actorId, produced, base: { requestId },
      customerTurnIndex: turn, sessionE2eMs: 1, exchangeLatency: 1, requestText: exchange.text,
      classification: {}, jobFields: {}, vacationAppTripSummary: (row) => row,
      tripStateReady: true, tripStateStore: revisions, recordCustomerThingNotes: async () => [],
      publishIntakeShare: () => assert.fail('unexpected write outside Trip State'),
    });
    assert.equal(shipped.reply, exchange.reply, shipped.error);
    priorTurns.push({ role: 'customer', text: exchange.text }, { role: 'app', text: shipped.reply });
  }
  assert.deepEqual(dispatched, ['save_plan', 'save_plan', 'place_on_day', 'save_plan', 'place_on_day']);
  assert.deepEqual(savedClaims(lastState).sort(), dialog.slice(0, -1).flatMap((exchange) => exchange.claims || []).sort());
  assert.deepEqual(await measureStoredItinerary(db, tripId, tag), { itineraryCount: 4, itineraryCountSource: 'db' });
  const turns = await db`select payload from transcript_turns where trip_id = ${tripId} and speaker = 'app' order by created_at, id`;
  assert.equal(turns.length, 6);
  assert.ok(turns.every(({ payload }) => payload.liveTranscript.backend === 'openrouter'));
  assert.ok(turns.every(({ payload }) => payload.liveTranscript.replyProducer === 'vacation-app-reply-rules'));
} finally {
  globalThis.fetch = originalFetch;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  await raw.close();
}

console.log('Trip State agreement stored four Orlando itinerary items on the agreed days.');
