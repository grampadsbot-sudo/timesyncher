import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  FIRST_INTAKE_GAP_INSTRUCTION,
  FIRST_INTAKE_VOICE_INSTRUCTION,
  YEARLY_PLAN_ID,
  firstIntakeReplyFacts,
  firstIntakeReplyPrompt,
  produceLiveAppReply,
} from '../src/vacation/live-app-turn.mjs';

const root = new URL('../', import.meta.url);
const live = await readFile(new URL('src/vacation/live-app-turn.mjs', root), 'utf8');
const rules = await readFile(new URL('scripts/vacation-app-reply-rules.mjs', root), 'utf8');
const phrase = /unlimited\s+\S*\s*vacations?/i;
const intakeBlock = live.slice(
  live.indexOf('export const YEARLY_PLAN_ID'),
  live.indexOf('export function customerModality'),
);

assert.match(intakeBlock, /timesyncher_vacation_unlimited/);
assert.equal(YEARLY_PLAN_ID, 'timesyncher_vacation_unlimited');
assert.doesNotMatch(intakeBlock, phrase);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, phrase);
assert.doesNotMatch(FIRST_INTAKE_GAP_INSTRUCTION, phrase);
assert.doesNotMatch(rules, phrase);
assert.doesNotMatch(rules, /This is the intake dump/);
assert.doesNotMatch(rules, /On the long trip dump, use the words/);
assert.doesNotMatch(rules, /Say you are building the itinerary/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /Confirm the itinerary is being built/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /Reflect where, when, who, lodging, and plans/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /Offer to add collaborators/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /Pitch the yearly plan/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /exactly one question/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /Ask two or three questions/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /voice note/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /Do not offer to add collaborators/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /Do not pitch a plan/);
assert.doesNotMatch(FIRST_INTAKE_GAP_INSTRUCTION, /Pitch the yearly plan/);
assert.doesNotMatch(FIRST_INTAKE_GAP_INSTRUCTION, /Offer to add collaborators, naming/);

const voiceNote = [
  'Okay, this is a voice note about the trip.',
  'We are going to the Big Island of Hawaii.',
  'We leave Friday April third and come home Sunday April twelfth, twenty twenty-six.',
  'We are staying in a house in Kailua-Kona.',
  'Kimberly wants gardens.',
  'Tyler wants a swim later if the beach is windy.',
  'Lauren does not want two big activities stacked on the same day.',
  'Groceries the day we land, then a quiet dinner.',
  'That is the rough shape, and I can fill in more after this note.',
].join(' ');

const voiceInput = {
  customerTurn: voiceNote,
  tripTitle: 'Hawaii trip',
  extractedDestination: 'Big Island of Hawaii',
  wantedThings: [
    { name: 'gardens', kind: 'activity', who: 'Kimberly' },
    { name: 'swim', kind: 'activity', who: 'Tyler' },
    { name: 'house in Kailua-Kona', kind: 'hotel' },
  ],
  roster: [
    { name: 'Kimberly', role: 'collaborator' },
    { name: 'Tyler', role: 'collaborator' },
    { name: 'Lauren', role: 'collaborator' },
  ],
};

const voiceFacts = firstIntakeReplyFacts(voiceInput);
const voicePrompt = firstIntakeReplyPrompt(voiceInput);
assert.equal(voiceFacts.shape, 'voice-note');
assert.equal(voiceFacts.customer_said, voiceNote);
assert.equal(voiceFacts.where, 'Big Island of Hawaii');
assert.equal(voiceFacts.lodging, 'house in Kailua-Kona');
assert.deepEqual(voiceFacts.plans, ['gardens', 'swim']);
assert.deepEqual(voiceFacts.collaborators, ['Kimberly', 'Tyler', 'Lauren']);
assert.equal(voiceFacts.plan.plan_id, 'timesyncher_vacation_unlimited');
assert.equal(voiceFacts.plan.plan_owned, false);
assert.equal(voiceFacts.plan.price, undefined);
assert.match(voicePrompt, /Kimberly/);
assert.match(voicePrompt, /Tyler/);
assert.match(voicePrompt, /Lauren/);
assert.match(voicePrompt, /Big Island of Hawaii/);
assert.match(voicePrompt, /house in Kailua-Kona/);
assert.match(voicePrompt, /gardens/);
assert.match(voicePrompt, /timesyncher_vacation_unlimited/);
assert.doesNotMatch(voicePrompt, phrase);
assert.doesNotMatch(JSON.stringify(voiceFacts), /"price"/);

const shortInput = { customerTurn: 'Maybe a trip sometime.', tripTitle: '' };
const vagueInput = {
  customerTurn: 'We might do something sometime if everyone is free, but nothing is chosen.',
};
for (const input of [shortInput, vagueInput]) {
  const facts = firstIntakeReplyFacts(input);
  const prompt = firstIntakeReplyPrompt(input);
  assert.equal(facts.shape, 'gaps');
  assert.equal(facts.customer_said, input.customerTurn);
  assert.equal(facts.collaborators, undefined);
  assert.equal(facts.plan, undefined);
  assert.doesNotMatch(prompt, /timesyncher_vacation_unlimited/);
  assert.doesNotMatch(prompt, /Pitch the yearly plan/);
  assert.doesNotMatch(prompt, /Offer to add collaborators, naming/);
  assert.match(prompt, /Ask two or three questions/);
  assert.match(prompt, /voice note/);
  assert.equal(prompt.startsWith(FIRST_INTAKE_GAP_INSTRUCTION), true);
}

const voiceReply = 'I am putting the itinerary together from the Big Island of Hawaii, the April dates, the house in Kailua-Kona, gardens, and a swim. Kimberly, Tyler, and Lauren can join and help shape it. The yearly plan for that is timesyncher_vacation_unlimited. What is still open about dinner the day you land?';
const gapReply = 'Where are you hoping to go, when would you leave, and who is coming? A longer voice note on those would help.';
const originalFetch = globalThis.fetch;
const env = { OPENROUTER_API_KEY: 'test-key' };

function jevOk() {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
    }),
  };
}

const chatCalls = [];
globalThis.fetch = async (url, init) => {
  const target = String(url);
  const body = init?.body ? JSON.parse(init.body) : {};
  if (target.includes('/api/alpha/decisions')) return jevOk();
  if (target.includes('/chat/completions')) {
    chatCalls.push(body);
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    assert.equal(system, voicePrompt);
    assert.match(system, /Confirm the itinerary is being built/);
    assert.match(system, /Offer to add collaborators/);
    assert.match(system, /Pitch the yearly plan/);
    assert.match(system, /exactly one question/);
    assert.match(system, /"collaborators":\["Kimberly","Tyler","Lauren"\]/);
    assert.match(system, /"plan_id":"timesyncher_vacation_unlimited"/);
    assert.match(system, /Big Island of Hawaii/);
    assert.doesNotMatch(system, phrase);
    return {
      ok: true,
      json: async () => ({
        model: body.model,
        choices: [{ message: { content: `${voiceReply}\nBEAT: reflected the intake` } }],
      }),
    };
  }
  throw new Error(`unexpected ${target}`);
};

try {
  const produced = await produceLiveAppReply({
    ...voiceInput,
    intake: true,
    priorTurns: [],
    session: { token: 'sess' },
    env,
  });
  assert.equal(chatCalls.length, 1);
  assert.equal(produced.reply, voiceReply);
  assert.equal(produced.reason, null);

  chatCalls.length = 0;
  const gapPrompt = firstIntakeReplyPrompt(shortInput);
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      const system = body.messages?.find((message) => message.role === 'system')?.content || '';
      assert.equal(system, gapPrompt);
      assert.match(system, /Ask two or three questions/);
      assert.match(system, /voice note/);
      assert.doesNotMatch(system, /timesyncher_vacation_unlimited/);
      assert.doesNotMatch(system, /Pitch the yearly plan/);
      assert.doesNotMatch(system, /Offer to add collaborators, naming/);
      return {
        ok: true,
        json: async () => ({
          model: body.model,
          choices: [{ message: { content: `${gapReply}\nBEAT: asked for the gaps` } }],
        }),
      };
    }
    throw new Error(`unexpected ${target}`);
  };
  const gaps = await produceLiveAppReply({
    customerTurn: shortInput.customerTurn,
    intake: true,
    priorTurns: [],
    session: {},
    env,
  });
  assert.equal(chatCalls.length, 1);
  assert.equal(gaps.reply, gapReply);
  assert.equal(gaps.reason, null);

  chatCalls.length = 0;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      return { ok: false, status: 503, json: async () => ({ error: { message: 'model down' } }) };
    }
    throw new Error(`unexpected ${target}`);
  };
  const failed = await produceLiveAppReply({
    ...voiceInput,
    intake: true,
    priorTurns: [],
    session: {},
    env,
  });
  assert.equal(chatCalls.length, 2);
  assert.equal(failed.reply, null);
  assert.equal(failed.reason, 'model down');
  assert.doesNotMatch(JSON.stringify({ reply: failed.reply, reason: failed.reason }), phrase);
  assert.notEqual(failed.reply, 'I am building the itinerary from that now');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('first intake reply passed');
