#!/usr/bin/env node
import assert from 'node:assert/strict';
import { INTERIM_MODEL } from './vacation-app-reply-rules.mjs';
import { intakeFactsGrounded, intakeReplyBlock, intakeReplyBlockReasons } from '../src/vacation/first-intake-gate.mjs';
import {
  FIRST_INTAKE_GAP_INSTRUCTION,
  firstIntakeReplyFacts,
  firstIntakeReplyInstruction,
  produceFirstIntakeReply,
} from '../src/vacation/first-intake-reply.mjs';
import { logBlockedReplyReasons, vacationAppTurnPayloadForClient } from '../src/vacation/blocked-turn-payload.mjs';
import { LIVE_REPLY_PRODUCER, liveTurnRecord } from '../src/vacation/live-app-turn.mjs';

const HILO = 'We are planning a short Hilo stay from March 4 to March 8 2027. Keep the days light.';
const hiloFacts = firstIntakeReplyFacts({
  customerTurn: HILO,
  extractedDestination: 'Hilo',
  savedStart: '2027-03-04',
  savedEnd: '2027-03-08',
  customerName: 'Avery',
  today: '2026-11-18',
});
assert.equal(hiloFacts.shape, 'gaps');
assert.equal(intakeFactsGrounded(hiloFacts), true);
assert.equal(hiloFacts.weekday, 'Thursday');
assert.equal(hiloFacts.end_weekday, 'Monday');
assert.match(firstIntakeReplyInstruction(hiloFacts), /exactly one question/);
const hiloDraft = 'Avery, I am building a light Hilo stay from March 4 to March 8, 2027. Who is coming with you?';
assert.deepEqual(intakeReplyBlockReasons(hiloDraft, () => '', hiloFacts, []), []);
assert.equal(intakeReplyBlock(hiloDraft, () => '', hiloFacts, []), '');
const inventedDay = 'See you Wednesday in Hilo. Who is coming with you?';
assert.deepEqual(
  intakeReplyBlockReasons(inventedDay, () => '', hiloFacts, []),
  ['first_intake_weekday_not_allowed:Wednesday'],
);
assert.equal(intakeReplyBlock(inventedDay, () => '', hiloFacts, []), 'first_intake_reply_flagged');
const inventedAccess = 'Avery already has access. Who is coming with you?';
assert.ok(intakeReplyBlockReasons(inventedAccess, () => '', hiloFacts, []).includes('first_intake_invented_party'));

const dateFacts = firstIntakeReplyFacts({
  customerTurn: 'March 4 to March 8 2027.',
  savedStart: '2027-03-04',
  savedEnd: '2027-03-08',
  customerName: 'Avery',
  today: '2026-11-18',
});
const dateDraft = 'Avery, March 4 to March 8, 2027 is four nights. Where are you going?';
assert.equal(intakeReplyBlock(dateDraft, () => '', dateFacts, []), '');

const placeFacts = firstIntakeReplyFacts({
  customerTurn: 'Hilo.',
  extractedDestination: 'Hilo',
  customerName: 'Avery',
  today: '2026-11-18',
});
const placeDraft = 'Avery, Hilo is a good start. When are you going?';
assert.equal(intakeReplyBlock(placeDraft, () => '', placeFacts, []), '');

const partyFacts = firstIntakeReplyFacts({
  customerTurn: 'There are four of us.',
  customerName: 'Avery',
  today: '2026-11-18',
});
assert.equal(partyFacts.shape, 'gaps');
assert.equal(intakeFactsGrounded(partyFacts), false);
assert.match(firstIntakeReplyInstruction(partyFacts), /two or three short questions/);
assert.equal(firstIntakeReplyInstruction(partyFacts).startsWith(FIRST_INTAKE_GAP_INSTRUCTION), true);
const partyOne = 'Avery, four is a start. Who is coming?';
assert.equal(intakeReplyBlock(partyOne, () => '', partyFacts, []), 'first_intake_reply_flagged');
const partyDraft = 'Avery, I can start a short draft for four people. Where are you going? When are you going? Who is coming? A voice note would help.';
assert.equal(intakeReplyBlock(partyDraft, () => '', partyFacts, []), '');

function stamped(text) {
  const turn = liveTurnRecord({
    turnIndex: 3,
    role: 'app',
    modality: 'text',
    text,
    at: '2026-11-18T22:32:00.000Z',
    latencyMs: 1283,
    sessionE2eMs: 6400,
    jev: { jevRan: true, modelTier: 1, jevLatencyMs: 165, jevBeforeModel: true, responseModel: INTERIM_MODEL },
    model: { called: true, responseModel: INTERIM_MODEL, modelTier: 1, genLatencyMs: 1283, via: 'openrouter-chat' },
  });
  assert.equal(turn.replyProducer, LIVE_REPLY_PRODUCER);
  assert.equal(turn.modelId, INTERIM_MODEL);
  assert.equal(turn.model.responseModel, INTERIM_MODEL);
  return turn;
}
for (const text of [hiloDraft, dateDraft, placeDraft, partyDraft]) stamped(text);

const logs = [];
const write = console.error;
console.error = (...args) => { logs.push(args.map(String).join(' ')); };
logBlockedReplyReasons(['first_intake_weekday_not_allowed:Wednesday', 'Bearer secret-token-value']);
console.error = write;
assert.equal(logs.length, 1);
assert.match(logs[0], /first_intake_weekday_not_allowed:Wednesday/);
assert.equal(logs[0].includes('secret-token-value'), false);
assert.equal(logs[0].includes('Bearer'), false);
const hidden = vacationAppTurnPayloadForClient({
  replyFailure: 'first_intake_reply_flagged',
  blockedDraft: inventedDay,
  blockedReasons: ['first_intake_weekday_not_allowed:Wednesday'],
});
assert.equal(hidden.blockedDraft, undefined);
assert.equal(hidden.blockedReasons, undefined);
assert.equal(JSON.stringify(hidden).includes('Wednesday'), false);

const drafts = [inventedDay, hiloDraft];
let chat = 0;
const systems = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = String(url);
  const body = init?.body ? JSON.parse(init.body) : {};
  if (target.includes('/api/alpha/decisions')) {
    return { ok: true, json: async () => ({ ok: true, answers: { model_tier: { score: 1 }, route_type: { choice: 'general' } } }) };
  }
  if (target.includes('/chat/completions')) {
    systems.push(body.messages?.find((message) => message.role === 'system')?.content || '');
    const content = drafts[chat] || inventedDay;
    chat += 1;
    return { ok: true, json: async () => ({ model: body.model, choices: [{ message: { content } }] }) };
  }
  throw new Error('unexpected model host');
};
const recovered = await produceFirstIntakeReply({
  customerTurn: HILO,
  session: { first_name: 'Avery' },
  env: { OPENROUTER_API_KEY: 'test-key' },
  rules: { ok: true },
  extractedDestination: 'Hilo',
  savedStart: '2027-03-04',
  savedEnd: '2027-03-08',
  today: '2026-11-18',
});
assert.equal(chat, 2);
assert.match(systems[1], /first_intake_weekday_not_allowed:Wednesday/);
assert.equal(systems[1].includes('test-key'), false);
assert.equal(recovered.reply, hiloDraft);
assert.equal(recovered.reason, null);
stamped(recovered.reply);

const neutral = 'We are planning Harbor Ridge Week in Neutral Bay from October 7 to October 9, 2026.';
const twoQuestions = 'Who is traveling with you? Do you already have lodging booked for the week?';
chat = 0;
systems.length = 0;
drafts.length = 0;
drafts.push(twoQuestions, twoQuestions);
const neutralReply = await produceFirstIntakeReply({
  customerTurn: neutral,
  session: { first_name: 'Buyer' },
  env: { OPENROUTER_API_KEY: 'test-key' },
  rules: { ok: true },
  extractedDestination: 'Neutral Bay',
  savedStart: '2026-10-07',
  savedEnd: '2026-10-09',
});
assert.equal(chat, 2);
assert.notEqual(systems[0], systems[1]);
assert.equal(systems[0].includes('first_intake_question_count'), false);
assert.match(systems[1], /first_intake_question_count/);
assert.equal(neutralReply.reply, 'Who is traveling with you?');
assert.equal((neutralReply.reply.match(/\?/g) || []).length, 1);
assert.equal(neutralReply.reason, null);
stamped(neutralReply.reply);

chat = 0;
systems.length = 0;
drafts.length = 0;
drafts.push('See you Monday. Who is traveling with you? Do you already have lodging booked?', 'See you Monday. Who is traveling with you? Do you already have lodging booked?');
const stillBad = await produceFirstIntakeReply({
  customerTurn: neutral,
  session: { first_name: 'Buyer' },
  env: { OPENROUTER_API_KEY: 'test-key' },
  rules: { ok: true },
  extractedDestination: 'Neutral Bay',
  savedStart: '2026-10-07',
  savedEnd: '2026-10-09',
});
assert.equal(stillBad.reply, null);
assert.equal(stillBad.reason, 'first_intake_reply_flagged');
assert.ok(stillBad.blockedReasons.includes('first_intake_weekday_not_allowed:Monday'));

chat = 0;
systems.length = 0;
drafts.length = 0;
drafts.push(inventedDay, inventedAccess);
const logs2 = [];
console.error = (...args) => { logs2.push(args.map(String).join(' ')); };
const blocked = await produceFirstIntakeReply({
  customerTurn: HILO,
  session: { first_name: 'Avery' },
  env: { OPENROUTER_API_KEY: 'test-key' },
  rules: { ok: true },
  extractedDestination: 'Hilo',
  savedStart: '2027-03-04',
  savedEnd: '2027-03-08',
});
console.error = write;
globalThis.fetch = originalFetch;
assert.equal(blocked.reply, null);
assert.equal(blocked.reason, 'first_intake_reply_flagged');
assert.ok(blocked.blockedReasons.includes('first_intake_invented_party'));
assert.equal(JSON.stringify(blocked.blockedReasons).includes('test-key'), false);

console.log('test_acceptance_1030_first_intake_ordinary: ok');
