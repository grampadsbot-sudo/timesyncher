import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { intId } from '../src/vacation/intake-shared-trip.mjs';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { commitShippedRewrite, persistVacationAppOutboundReply } from '../src/vacation/reply-ship.mjs';
import { digestTripState, readTripStateSite } from '../src/vacation/trip-state-action-site.mjs';
import { createTripStateRevisionStore } from '../src/vacation/trip-state-revision-store.mjs';
import { applyTripStateJevQuality } from '../src/vacation/trip-state-model-context.mjs';
import { createBoundedReplyShipGate } from '../src/vacation/vacation-app-chat-postgen.mjs';

const tripId = '43a96d9f-1351-4b7f-9eee-85c4fca2aee2';
const actorId = 'ca0e1d47-ba04-4cb9-9887-4c88cb8b2e96';
const parkId = 'eb6e5470-fdb2-4b05-bcb8-4e6c95ccebd8';
const requestIds = {
  missing: 'e2957780-5dc4-434c-af96-d7656c05347e',
  verified: 'd7d32a33-d8e5-426d-a382-51a600333032',
  deferred: 'b26c3657-7ee5-4bb2-aa55-6a0a106b894b',
  stale: '542b64c5-117d-46d2-8b42-00e26a2f9929',
  ungrounded: 'caeacf5b-0a08-4064-b5cc-fdc0388270de',
};
const dayId = String(intId(`${tripId}:day:2027-04-06`));
const trip = {
  id: tripId, customer_id: actorId, title: 'Harbor Weekend', destination: 'Harbor City',
  start_date: '2027-04-05', end_date: '2027-04-07', status: 'onboarding',
  metadata: { intakeShare: true, trip_state_actions: true },
};
const requestText = 'Please put Cedar Garden on Tuesday.';
const verifiedDraft = 'I placed Cedar Garden on Tuesday at 9:00 AM.';
const unsupportedDraft = 'Consider Tuesday morning at Cedar Garden official.';
const claimContext = { unscheduledChatPlaceTitles: ['Cedar Garden'] };

const legacyGate = createBoundedReplyShipGate({
  tripId, db: async () => [], turnId: 'fixture-turn', payload: {}, customerLive: {},
  base: { requestId: 'fixture-off', reply: null }, storeReplyFailure: async () => {},
  replyClaimContext: claimContext, env: {},
});
const originalError = console.error;
console.error = () => {};
try {
  assert.equal(
    JSON.stringify(await legacyGate(verifiedDraft)),
    '{"requestId":"fixture-off","reply":null,"ok":false,"status":"reply_unavailable","error":"reply_action_claim_blocked"}',
  );
  assert.equal(await legacyGate(unsupportedDraft), null);
} finally {
  console.error = originalError;
}

const unreadableClaimContext = new Proxy({}, { get: () => assert.fail('The switched-on gate read legacy claim context') });
const migratedGate = createBoundedReplyShipGate({
  tripId, db: async () => [], turnId: 'fixture-turn', payload: {}, customerLive: {},
  base: {}, storeReplyFailure: () => assert.fail('The verified reply was blocked'),
  replyClaimContext: unreadableClaimContext, tripStateReady: true, env: {},
});
assert.equal(await migratedGate(verifiedDraft), null);

const raw = new PGlite({ extensions: { pgcrypto } });
const query = raw.query.bind(raw);
const db = async (parts, ...params) => {
  const statement = parts.reduce((sql, part, index) => index ? `${sql}$${index}${part}` : part, '');
  return (await query(statement, params)).rows;
};
const store = createTripStateRevisionStore({ env: {}, pool: { connect: async () => ({ query, release() {} }) } });
const session = { id: '504fee38-2321-409f-9a76-1f4dca08a90d', trip_id: tripId, customer_id: actorId };
const hooks = {
  recordCustomerThingNotes: async () => [],
  publishIntakeShare: () => assert.fail('No post-reply itinerary was written'),
  tripStateStore: store,
};

async function generate(revision, draft, ungroundedRewrite = '') {
  const originalFetch = globalThis.fetch;
  const originalPath = process.env.PATH;
  const writerPins = [];
  const judgePins = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (new URL(url).pathname.endsWith('/decisions')) {
      judgePins.push(body.state.trip_state_pin);
      assert.equal(body.state.draft, judgePins.length === 1 ? draft : ungroundedRewrite);
      return Response.json({ answers: {
        overall_quality: { score: ungroundedRewrite ? 1 : 4 },
        disposition: { choice: ungroundedRewrite ? 'rewrite' : 'keep' },
        fix_focus: { choice: ungroundedRewrite ? 'misses_ask' : 'keep' },
        claims_mutation: { noul: ungroundedRewrite ? 0.01 : 0.99 }, change_claim_grounded: { noul: 0.99 },
      } });
    }
    writerPins.push(JSON.parse(body.messages[1].content[0].text).pin);
    const text = writerPins.length === 1 ? draft : `${ungroundedRewrite || draft}\nWHAT_I_CHANGED: Reworded the reply.`;
    return Response.json({ model: body.model, choices: [{ message: { content: text } }] });
  };
  process.env.PATH = '/nonexistent';
  try {
    const produced = await produceLiveAppReply({
      customerTurn: requestText, session, trip, tripStateRevision: revision, priorTurns: [],
      env: { OPENROUTER_API_KEY: 'offline-test' },
      understanding: { intent: { asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: false } },
    });
    assert.deepEqual(writerPins, Array(writerPins.length).fill(produced.tripStateContext.pin));
    assert.deepEqual(judgePins, Array(ungroundedRewrite ? 2 : 1).fill(produced.tripStateContext.pin));
    return produced;
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
}

function ship(requestId, produced) {
  return persistVacationAppOutboundReply({
    db, transcriptOwnerId: actorId, tripId, requestId, produced, base: { requestId, reply: null },
    customerTurnIndex: 5, sessionE2eMs: 1, exchangeLatency: 1, requestText, classification: {},
    jobFields: {}, vacationAppTripSummary: (row) => row, tripStateReady: true, ...hooks,
  });
}

try {
  for (const migration of ['001_vacation_mvp', '003_trip_things_source', '010_vacation_trip_state_actions', '011_vacation_trip_state_revisions']) {
    await raw.exec(readFileSync(new URL(`../db/migrations/${migration}.sql`, import.meta.url), 'utf8'));
  }
  await db`insert into customers (id) values (${actorId})`;
  await db`
    insert into trips (id, customer_id, title, destination, start_date, end_date, status, metadata)
    values (${tripId}, ${actorId}, ${trip.title}, ${trip.destination}, ${trip.start_date}, ${trip.end_date}, ${trip.status}, ${trip.metadata})
  `;
  for (const requestId of Object.values(requestIds)) {
    await db`insert into vacation_requests (id, customer_id, trip_id, request_text) values (${requestId}, ${actorId}, ${tripId}, ${requestText})`;
  }
  const prepare = (requestId, turn) => store.prepare({ trip, requestId, turn, actorId, text: requestText });
  const missingReceipt = await prepare(requestIds.missing, 4);
  const blocked = await generate(missingReceipt, unsupportedDraft);
  assert.equal(blocked.reply, null);
  assert.equal(blocked.quality.unbackedChangeClaim, true);
  assert.equal((await ship(requestIds.missing, blocked)).error, 'trip_state_reply_unverified');
  const incompleteJudgment = applyTripStateJevQuality({ judged: true, score: 4 }, { answers: {} }, blocked.tripStateContext.state);
  assert.equal(incompleteJudgment.judged, false);

  const ungrounded = await generate(await prepare(requestIds.ungrounded, 5),
    'Moonstone Arcade is a good stop for the afternoon.', 'Try the Juniper Observatory for the evening instead.');
  assert.equal(ungrounded.log.rewriteFailReason, 'rewrite_ungrounded');
  const safeReply = 'I couldn’t verify enough to answer that reliably. Could you tell me what you’d like me to check first?';
  assert.equal(ungrounded.reply, safeReply);
  assert.equal((await ship(requestIds.ungrounded, { ...ungrounded, reply: 'I added Moonstone Arcade.' })).error,
    'trip_state_reply_unverified');
  const fallback = await ship(requestIds.ungrounded, ungrounded);
  assert.equal(fallback.status, 'replied');
  assert.equal(fallback.reply, safeReply);
  assert.deepEqual(await db`select body from transcript_turns where request_id = ${requestIds.ungrounded}`, [{ body: safeReply }]);

  const meta = {
    tripState: {
      proposed_by: 'customer', type: 'park', basis: 'named', via: 'customer_named', turn: 5,
      occurrences: [{ id: 'cedar-visit', day: dayId, role: 'visit', time: { value: '09:00', precision: 'proposed' }, via: 'chat_action', turn: 5, proposed_by: 'customer' }],
    },
  };
  await db`insert into trip_things (id, trip_id, category, title, metadata, source) values (${parkId}, ${tripId}, 'park', 'Cedar Garden', ${meta}, 'customer')`;
  const things = await db`select id, category, title, description, metadata, ratings, location, source, starts_at::text, ends_at::text from trip_things where trip_id = ${tripId}`;
  const assignment = readTripStateSite({ trip, things, invites: {} }, null, 5).days[dayId].assigned[0];
  const addReceipt = (requestId, turn) => db`
    insert into vacation_trip_state_action_receipts (trip_id, request_id, operation_key, record)
    values (${tripId}, ${requestId}, 'place', ${{
      op: 'place_on_day', turn, outcome: { result: 'applied', detail: 'Confirmed by readback.', refs: [assignment.id] },
      proof: { [assignment.id]: digestTripState({ day: dayId, row: assignment }) },
      changes: { [assignment.id]: { before: null } },
    }})
  `;

  await addReceipt(requestIds.verified, 5);
  const verified = await generate(await prepare(requestIds.verified, 5), verifiedDraft);
  assert.equal(verified.tripStateContext.state.last_actions.length, 1);
  assert.equal(verified.reply, verifiedDraft);
  assert.equal((await ship(requestIds.verified, verified)).reply, verifiedDraft);
  assert.deepEqual(await db`select body from transcript_turns where request_id = ${requestIds.verified}`, [{ body: verifiedDraft }]);

  await addReceipt(requestIds.deferred, 6);
  const deferred = await generate(await prepare(requestIds.deferred, 6), verifiedDraft);
  assert.equal((await commitShippedRewrite(db, session, {
    tripId, requestId: requestIds.deferred, customerTurnIndex: 5, customerTurn: requestText,
    intent: claimContext, tripStateReady: true, tripStateContext: deferred.tripStateContext,
  }, deferred, hooks)).reply, verifiedDraft);

  await addReceipt(requestIds.stale, 7);
  const stale = await generate(await prepare(requestIds.stale, 7), verifiedDraft);
  assert.equal((await ship(requestIds.stale, verified)).error, 'trip_state_revision_changed');
  await db`delete from vacation_trip_state_action_receipts where trip_id = ${tripId} and request_id = ${requestIds.stale}`;
  assert.equal((await ship(requestIds.stale, stale)).error, 'trip_state_revision_changed');
  assert.deepEqual(await db`select body from transcript_turns where request_id in (${requestIds.missing}, ${requestIds.stale})`, []);
} finally {
  await raw.close();
}

console.log('test_trip_state_no_regex_gate: ok');
