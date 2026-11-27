import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { projectTripState } from '../src/vacation/trip-state-projector.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const trip = {
  id: '11111111-2222-4333-8444-555555555555',
  title: 'Harbor Weekend',
  destination: 'Harbor City',
  start_date: '2027-04-05',
  end_date: '2027-04-07',
  metadata: { trip_state_actions: true, intakeShare: true },
};
const customerTurn = 'Can you add the concert to my plans?';
const draft = 'You will have to arrange your tickets yourself. Which city are you visiting?';
const rewrite = 'Which day should I put the concert on?';
const history = {
  said: [{ topic: 'ticket-booking', meaning: 'I explained that I cannot book concert tickets.', turn: 3 }],
  answered: [{ id: 'destination', text: 'Which city are you visiting?', status: 'done', outcome: 'Harbor City', first_turn: 1, turn: 2, refs: [] }],
  open_asks: [{ id: 'concert-day', text: 'Which day is the concert?', status: 'needs_info', outcome: null, first_turn: 4, turn: 4, refs: [] }],
};
const state = projectTripState({
  trip, site: { trip, things: [], invites: {} }, requestId: 'concert-request',
  turn: 4, revision: 7, grant: 'owner', env: {},
});
const stateJson = JSON.stringify({ ...state, ...history });
const revision = { state_json: stateJson, revision: state.revision, digest: sha256(stateJson) };

async function captureTurn(enabled) {
  const chat = [];
  const judges = [];
  const originalFetch = globalThis.fetch;
  const originalPath = process.env.PATH;
  process.env.PATH = '/nonexistent';
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/decisions')) {
      judges.push(init.body);
      const firstJudgeRequestsRewrite = enabled && judges.length === 1;
      return Response.json({ answers: {
        overall_quality: { score: firstJudgeRequestsRewrite ? 1 : 4 },
        disposition: { choice: firstJudgeRequestsRewrite ? 'rewrite' : 'keep' },
        fix_focus: { choice: firstJudgeRequestsRewrite ? 'misses_ask' : 'keep' },
        route_type: { choice: 'itinerary_advice' },
        needs_day_for_note: { noul: 0.05 },
        claims_mutation: { noul: 0.01 },
        change_claim_grounded: { noul: 0.99 },
      } });
    }
    assert.ok(path.endsWith('/chat/completions'), `Unexpected request path ${path}`);
    const payload = JSON.parse(init.body);
    chat.push(payload);
    const content = chat.length === 1 ? draft : `${rewrite}\nWHAT_I_CHANGED: Asked only for the missing concert day.`;
    return Response.json({ model: payload.model, choices: [{ message: { content } }] });
  };
  try {
    const result = await produceLiveAppReply({
      customerTurn, session: { trip_id: trip.id }, tripTitle: trip.title,
      trip: { ...trip, metadata: { ...trip.metadata, trip_state_actions: enabled } },
      tripStateRevision: revision,
      env: { OPENROUTER_API_KEY: 'test-key-offline' },
      understanding: { intent: { asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: false } },
      loadSavedTripRecordFn: async () => ({ destination: trip.destination, start: trip.start_date, end: trip.end_date, things: [] }),
    });
    return { chat, judges, result };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
}

const off = await captureTurn(false);
assert.equal(off.judges.length, 1);
assert.equal(sha256(off.judges[0]), 'd7afff7ed257aabbf1e1f9f225902251cf59f994a297e6bae63bffd61501bf8f');

const on = await captureTurn(true);
assert.equal(on.chat.length, 2);
assert.equal(on.judges.length, 2);
assert.equal(on.result.log.jevScoreDraft, 2);
assert.equal(on.result.log.draftJevFixFocus, 'misses_ask');
assert.equal(on.result.log.draftJevDisposition, 'rewrite');
assert.equal(on.result.reply, rewrite);

const writer = JSON.parse(on.chat[0].messages[1].content[0].text);
assert.equal(writer.pin.revision, revision.revision);
assert.equal(writer.pin.revision_digest, revision.digest);
assert.deepEqual(JSON.parse(on.chat[1].messages[1].content[0].text).pin, writer.pin);
for (const [index, rawJudge] of on.judges.entries()) {
  const judge = JSON.parse(rawJudge);
  assert.equal(judge.state.customer_turn, customerTurn);
  assert.equal(judge.state.draft, index === 0 ? draft : rewrite);
  assert.deepEqual(judge.state.trip_state_pin, writer.pin);
  assert.deepEqual(judge.state.trip_state, writer.trip_state);
  for (const [field, rows] of Object.entries(history)) {
    assert.deepEqual(judge.state.trip_state[field], rows);
  }
  const scoreInstructions = judge.questions.overall_quality.instructions;
  assert.ok(scoreInstructions.includes('repeats an earlier answer or refusal'));
  assert.ok(scoreInstructions.includes('asks for information the customer already supplied'));
  assert.ok(scoreInstructions.includes('Score 1 or 2 for repetition'));
  assert.ok(judge.questions.disposition.criteria.rewrite.includes('repetition'));
  assert.ok(judge.questions.fix_focus.criteria.misses_ask.includes('repetition'));
}

console.log('Jev Trip State repetition tests passed.');
