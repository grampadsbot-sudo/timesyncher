import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { customerAskFromEnv, speakCustomer } from './harness/customer-live.mjs';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';

const trip = { id: randomUUID(), title: 'Coast holiday', destination: 'Atlantic coast' };
const customerTurn = 'I’m traveling with my husband and two kids.';
const hidden = [randomUUID(), randomUUID(), randomUUID()];
const party = {
  collaborators: [{ name: hidden[0], payer: 'owner' }],
  preference_subjects: [{ name: hidden[1], age: 6 }, { name: hidden[2], age: 9 }],
};
const disclosed = { where: trip.destination, who: 'Husband and two kids', transport: '', description: '' };
const expected = { ...disclosed, tripName: trip.title };
const previousText = 'We’re taking a holiday on the Atlantic coast.';
const draft = 'There are plenty of ways to spend time together.';
const rewrite = 'We can keep the coast holiday flexible for your family.\nWHAT_I_CHANGED: Focused the reply on the family.';
const env = { OPENROUTER_API_KEY: 'test-key-offline' };
const intent = { asksPrice: false, asksAccess: false, pullsAccess: false, seats: [], ask: false };
const fixture = (value) => Response.json(value);

function assertNoPrivateData(value) {
  for (const name of hidden) assert.equal(JSON.stringify(value).includes(name), false, 'private persona data reached a model');
}

function assertModelSummary(payload, state) {
  assert.deepEqual(state?.travelSummary, expected);
  for (const field of ['party', 'roster', 'dialogParty']) assert.equal(Object.hasOwn(state, field), false);
  assertNoPrivateData(payload);
}

let extractedRequest;
const session = { trip_id: trip.id };
const classified = await classifyTripIntake({
  text: customerTurn, env, turnSession: session,
  fetchImpl: async (_url, init) => {
    extractedRequest = JSON.parse(init.body);
    return fixture({ choices: [{ message: { content: JSON.stringify({
      turnKind: 'other', things: [], roster: [], intent,
      contentTags: { tags: [], ask: true }, committedSentenceIndexes: [],
    }) } }] });
  },
});
assert.equal(classified.ok, true);
assertNoPrivateData(extractedRequest.messages);
assert.equal('travelSummary' in extractedRequest.response_format.json_schema.schema.properties, false);
const evidenceSent = JSON.parse(extractedRequest.messages[1].content);
assert.equal('savedVacation' in evidenceSent, false);
assert.equal(evidenceSent.sentences.join(' '), customerTurn);
assert.equal('travelSummary' in classified.understanding, false);

const replyCalls = [];
const jevCalls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (new URL(url).pathname.endsWith('/decisions')) {
    if (body.questions.overall_quality) jevCalls.push(body);
    const firstJudge = jevCalls.length === 1 && body.state?.draft === draft;
    return fixture({ answers: {
      overall_quality: { score: firstJudge ? 1 : 4 },
      disposition: { choice: firstJudge ? 'rewrite' : 'keep' },
      fix_focus: { choice: firstJudge ? 'specificity' : 'keep' },
    } });
  }
  assert.equal(new URL(url).pathname, '/api/v1/chat/completions');
  const user = JSON.parse(body.messages.find(({ role }) => role === 'user').content);
  if (Object.hasOwn(user, 'customer_turn')) replyCalls.push({ body, user });
  const text = user.customer_turn === customerTurn ? draft : rewrite;
  return fixture({ model: body.model, choices: [{ message: { content: text } }] });
};
try {
  await produceLiveAppReply({
    customerTurn, session, env, understanding: classified.understanding, travelSummary: expected,
    priorTurns: [{ role: 'customer', text: previousText }],
    loadSavedTripRecordFn: async () => ({ ...trip, party, metadata: { dialogParty: party }, things: [] }),
  });
} finally {
  globalThis.fetch = originalFetch;
}
const draftCall = replyCalls[0];
assert.equal(draftCall?.user.customer_turn, customerTurn);
assert.ok(draftCall.body.model.includes('haiku'));
const rewriteCall = replyCalls.find(({ user }) => user.customer_turn !== customerTurn);
assert.ok(rewriteCall, 'Jev disposition must trigger a rewrite request');
assert.ok(jevCalls.length > 1, 'Jev must judge the initial draft and rewrite');
for (const call of replyCalls) assertModelSummary(call.body, call.user.trip_context);
for (const call of jevCalls) assertModelSummary(call, call.state);
for (const state of [draftCall.user.trip_context, rewriteCall.user.trip_context, jevCalls[0].state]) {
  const { travelSummary, ...missing } = state;
  assert.throws(() => assertModelSummary(missing, missing), assert.AssertionError);
  const leaked = { ...state, party };
  assert.throws(() => assertModelSummary(leaked, leaked), assert.AssertionError);
  assert.throws(() => assertModelSummary({ ...state, extra: party }, state), assert.AssertionError);
}

let simulatorPayload;
const ask = customerAskFromEnv({ HARNESS_CUSTOMER_MODEL_URL: 'http://127.0.0.1:1/' }, [], async (_url, init) => {
  simulatorPayload = JSON.parse(init.body);
  return fixture({ text: 'We are taking the train.' });
});
await speakCustomer({ persona: { name: 'Test traveler', goals: [hidden[0]] }, travelSummary: expected, index: 1, ask });
assert.deepEqual(simulatorPayload.travelSummary, expected);
assertNoPrivateData(simulatorPayload.travelSummary);
assert.equal(simulatorPayload.goal, hidden[0]);

console.log('PASS Travel Summary disclosure, Haiku/Jev, same-tier rewrite, and simulator payload');
