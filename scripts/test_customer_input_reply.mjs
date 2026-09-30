import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { callTieredModel, replyRulesSystem } from './vacation-app-reply-rules.mjs';
import { draftingFacts } from '../src/vacation/live-app-turn.mjs';

const MODEL = 'google/gemini-2.5-flash-lite';
const cannedQuestion = /what(?:'s| is) your preferred airline|which airline|do you need a (?:car|flight)|rent a car|book a flight|preferred airline\?/i;

const rulesSource = await readFile(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
const liveSource = await readFile(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(rulesSource, cannedQuestion);
assert.doesNotMatch(liveSource, cannedQuestion);

const carried = draftingFacts([], 'Friday.', {
  things: [{ title: 'Swim' }],
  needsCustomerInput: ['car', 'flight'],
  flightAsk: 'preferredAirline',
});
assert.deepEqual(carried.needsCustomerInput, ['car', 'flight']);
assert.equal(carried.flightAsk, 'preferredAirline');
const absent = draftingFacts([], 'Friday.', { things: [{ title: 'Swim' }] });
assert.deepEqual(absent.needsCustomerInput, ['car', 'flight']);
assert.equal(absent.flightAsk, 'preferredAirline');

const inputContext = {
  itinerary: ['Swim: Monday'],
  dates: 'Saved trip dates: Fri through Sun.',
  roster: 'Traveling: Ada.',
  needsCustomerInput: ['car', 'flight'],
  flightAsk: 'preferredAirline',
};
const withInput = replyRulesSystem({}, '', 'forbidden', false, 'We arrive Friday.', { tripContext: inputContext });
assert.match(withInput, /"needsCustomerInput":\["car","flight"\]/);
assert.match(withInput, /"flightAsk":"preferredAirline"/);
assert.match(withInput, /Ask for that in your own words/);
assert.doesNotMatch(withInput, cannedQuestion);

const withoutInput = replyRulesSystem({}, '', 'forbidden', false, 'We arrive Friday.', {
  tripContext: { itinerary: ['Swim: Monday'], dates: '', roster: '', rule: '' },
});
assert.doesNotMatch(withoutInput, /needsCustomerInput|flightAsk|customer input that is still needed/);

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : {};
  calls.push({ url: String(url), body });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: body.model,
      choices: [{ message: { content: 'Tell me what you still need to decide.\nBEAT: asked for input' } }],
    }),
  };
};

try {
  calls.length = 0;
  const asked = await callTieredModel({
    rules: {},
    jev: { jevRan: true, modelTier: 1 },
    customerTurn: 'We arrive Friday.',
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination: '',
    memory: [],
    upsell: 'forbidden',
    env: { OPENROUTER_API_KEY: 'test-key' },
    forceModel: MODEL,
    tripContext: inputContext,
  });
  assert.equal(asked.called, true);
  assert.equal(asked.responseModel, MODEL);
  const system = calls[0].body.messages.find((message) => message.role === 'system').content;
  const user = calls[0].body.messages.find((message) => message.role === 'user').content;
  assert.match(system, /"needsCustomerInput":\["car","flight"\]/);
  assert.match(system, /"flightAsk":"preferredAirline"/);
  assert.match(user, /"needsCustomerInput":\["car","flight"\]/);
  assert.match(user, /"flightAsk":"preferredAirline"/);
  assert.doesNotMatch(system, cannedQuestion);
  assert.doesNotMatch(user, cannedQuestion);
  assert.equal(calls[0].body.model, MODEL);

  calls.length = 0;
  await callTieredModel({
    rules: {},
    jev: { jevRan: true, modelTier: 1 },
    customerTurn: 'We arrive Friday.',
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination: '',
    memory: [],
    upsell: 'forbidden',
    env: { OPENROUTER_API_KEY: 'test-key' },
    forceModel: MODEL,
    tripContext: { itinerary: ['Swim: Monday'] },
  });
  const quiet = calls[0].body.messages.map((message) => message.content).join('\n');
  assert.doesNotMatch(quiet, /needsCustomerInput|flightAsk|customer input that is still needed/);
  assert.doesNotMatch(quiet, cannedQuestion);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('customer input reply: ok');
