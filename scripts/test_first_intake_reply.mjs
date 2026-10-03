import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bakeoffTierModels, replyRulesSystem } from './vacation-app-reply-rules.mjs';
import {
  FIRST_INTAKE_GAP_INSTRUCTION,
  FIRST_INTAKE_QUESTION_INSTRUCTION,
  FIRST_INTAKE_VOICE_INSTRUCTION,
  VIEW_WITHOUT_SIGN_IN,
  firstIntakeReplyFacts,
  firstIntakeReplyLeak,
  firstIntakeReplyPrompt,
  intakeCustomerName,
} from '../src/vacation/first-intake-reply.mjs';
import { loadTestSingleOwnerPlan, testPlanEnv, testSingleOwnerPlan } from './fixtures/reply-plan-test-fixtures.mjs';
import { liveTurnRecord, produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
const root = new URL('../', import.meta.url);
const rules = await readFile(new URL('scripts/vacation-app-reply-rules.mjs', root), 'utf8');
const phrase = /unlimited\s+\S*\s*vacations?/i;
const planEnv = testPlanEnv;
const testOwnerPlan = testSingleOwnerPlan;
const loadTestOwnerPlan = loadTestSingleOwnerPlan;
const intakeLive = { intake: true, priorTurns: [], session: { token: 'sess', trip_id: 'test-trip' }, env: { OPENROUTER_API_KEY: 'test-key', ...planEnv }, loadOwnerPlan: loadTestOwnerPlan };
const tiers = bakeoffTierModels();
assert.deepEqual(Object.values(tiers), [
  'google/gemini-2.5-flash-lite',
  'qwen/qwen3-235b-a22b-2507',
  'deepseek/deepseek-v3.2',
  'qwen/qwen3-max',
]);
for (const id of Object.values(tiers)) assert.doesNotMatch(id, /gpt-.*mini/i);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, phrase);
assert.doesNotMatch(FIRST_INTAKE_GAP_INSTRUCTION, phrase);
assert.doesNotMatch(rules, phrase);
assert.doesNotMatch(rules, /This is the intake dump/);
assert.doesNotMatch(rules, /On the long trip dump, use the words/);
assert.doesNotMatch(rules, /Say you are building the itinerary/);
const leakWord = /\b(?:tier|route|model|jev)\b/i;
assert.doesNotMatch(rules, /Jev already chose the model tier and route/);
const rulesPrompt = replyRulesSystem({}, '', 'forbidden', false, 'hello', {});
assert.doesNotMatch(rulesPrompt, leakWord);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, leakWord);
assert.doesNotMatch(FIRST_INTAKE_GAP_INSTRUCTION, leakWord);
assert.doesNotMatch(FIRST_INTAKE_QUESTION_INSTRUCTION, leakWord);
assert.equal(firstIntakeReplyLeak("I see you've already picked out your model tier and route"), true);
assert.equal(firstIntakeReplyLeak('I am putting the itinerary together from the house and the gardens.'), false);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /Confirm the itinerary is being built/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /end date/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /number of nights/);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /planned activities/);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /invite_contact_needed/);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /can be invited/);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /grant view or edit/i);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /until they agree/i);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /plan they already purchased/i);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /yearly/i);
assert.doesNotMatch(FIRST_INTAKE_VOICE_INSTRUCTION, /unlimited/i);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /exactly one question/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /exactly one question/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /Never ask a second question/);
assert.match(FIRST_INTAKE_VOICE_INSTRUCTION, /lodgingAsk/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /Start the trip draft anyway/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /voice note/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /second person/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /Do not offer to add collaborators/);
assert.match(FIRST_INTAKE_GAP_INSTRUCTION, /Do not pitch a plan/);
assert.doesNotMatch(FIRST_INTAKE_GAP_INSTRUCTION, /Pitch the yearly plan/);
assert.doesNotMatch(FIRST_INTAKE_GAP_INSTRUCTION, /Offer to add collaborators, naming/);
assert.match(FIRST_INTAKE_QUESTION_INSTRUCTION, /Answer the question first/);
assert.match(FIRST_INTAKE_QUESTION_INSTRUCTION, /view_without_sign_in/);
assert.match(FIRST_INTAKE_QUESTION_INSTRUCTION, /no name or contact/);
assert.match(FIRST_INTAKE_QUESTION_INSTRUCTION, /just the two of you/);
assert.match(FIRST_INTAKE_QUESTION_INSTRUCTION, /exactly one question/);
function assertCleanFacts(facts) {
  const walk = (value) => {
    if (value == null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      assert.doesNotMatch(String(value), leakWord);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        assert.doesNotMatch(key, leakWord);
        walk(item);
      }
    }
  };
  walk(facts);
}
const voiceNote = [
  'Okay, this is a voice note about the trip.',
  'We are going to the Big Island of Hawaii.',
  'We leave Friday April third and come home Sunday April twelfth, twenty twenty-six.',
  'We are staying in a house in Kailua-Kona.',
  'Nico wants gardens.',
  'Tess wants a swim later if the beach is windy.',
  'Mara does not want two big activities stacked on the same day.',
  'Groceries the day we land, then a quiet dinner.',
  'That is the rough shape, and I can fill in more after this note.',
].join(' ');
const voiceInput = {
  customerTurn: voiceNote,
  tripTitle: 'Hawaii trip',
  ownerPlan: testOwnerPlan,
  tripId: 'test-trip',
  extractedDestination: 'Big Island of Hawaii',
  wantedThings: [
    { name: 'gardens', kind: 'activity', who: 'Nico' },
    { name: 'swim', kind: 'activity', who: 'Tess' },
    { name: 'house in Kailua-Kona', kind: 'hotel' },
  ],
  roster: [
    { name: 'Nico', role: 'collaborator' },
    { name: 'Tess', role: 'collaborator' },
    { name: 'Mara', role: 'collaborator' },
    { name: 'Sam', role: 'child' },
    { name: '', role: 'collaborator' },
  ],
};
const voiceFacts = firstIntakeReplyFacts(voiceInput);
const voicePrompt = firstIntakeReplyPrompt(voiceInput);
assert.equal(voiceFacts.shape, 'voice-note');
assert.equal(voiceFacts.customer_said, voiceNote);
assert.equal(voiceFacts.where, 'Big Island of Hawaii');
assert.equal(voiceFacts.lodging, 'house in Kailua-Kona');
assert.deepEqual(voiceFacts.plans, ['gardens', 'swim']);
assert.deepEqual(voiceFacts.activities, ['gardens', 'swim']);
assert.equal(voiceFacts.collaborators, undefined);
assert.equal(voiceFacts.invite_contact_needed, true);
assert.ok(voiceFacts.gaps.includes('invite_contact'));
assert.ok(!voiceFacts.gaps.includes('lodging'));
assert.deepEqual(voiceFacts.who, ['Sam', 'Nico', 'Tess', 'Mara']);
assert.equal(voiceFacts.plan.plan_id, 'timesyncher_vacation_single');
assert.equal(voiceFacts.plan.plan_name, 'TimeSyncher Vacation Single');
assert.equal(voiceFacts.plan.purchased_plan, 'single');
assert.equal(voiceFacts.plan.plan_owned, true);
assert.equal(voiceFacts.plan.price, undefined);
assert.match(voicePrompt, /Nico/);
assert.match(voicePrompt, /Tess/);
assert.match(voicePrompt, /Mara/);
assert.match(voicePrompt, /Big Island of Hawaii/);
assert.match(voicePrompt, /house in Kailua-Kona/);
assert.match(voicePrompt, /gardens/);
assert.match(voicePrompt, /TimeSyncher Vacation Single/);
assert.doesNotMatch(voicePrompt, phrase);
assert.doesNotMatch(voicePrompt, leakWord);
assert.doesNotMatch(JSON.stringify(voiceFacts), /"price"/);
assertCleanFacts(voiceFacts);
const dated = firstIntakeReplyFacts({
  ...voiceInput,
  savedStart: '2026-04-03',
  savedEnd: '2026-04-12',
});
assert.equal(dated.start, '2026-04-03');
assert.equal(dated.end, '2026-04-12');
assert.equal(dated.nights, 9);
assert.equal(dated.when, '2026-04-03 to 2026-04-12');
assertCleanFacts(dated);

const shortInput = { customerTurn: 'Maybe a trip sometime.', tripTitle: '' };
const vagueInput = {
  customerTurn: 'We might do something sometime if everyone is free, but nothing is chosen.',
};
const customerId = '11111111-2222-4333-8444-555555555555';
assert.equal(intakeCustomerName({ customer_id: customerId, first_name: customerId }), '');
assert.equal(intakeCustomerName({ customer_id: customerId, first_name: 'Ada' }), 'Ada');
assert.equal(intakeCustomerName({ customer_id: customerId }), '');
for (const input of [shortInput, vagueInput]) {
  const facts = firstIntakeReplyFacts(input);
  const prompt = firstIntakeReplyPrompt(input);
  assert.equal(facts.shape, 'gaps');
  assert.equal(facts.customer_said, input.customerTurn);
  assert.equal(facts.collaborators, undefined);
  assert.equal(facts.plan, undefined);
  assert.equal(facts.customer_name, undefined);
  assert.doesNotMatch(prompt, /timesyncher_vacation_single/);
  assert.doesNotMatch(prompt, /plan they already purchased/);
  assert.doesNotMatch(prompt, /Offer to add collaborators, naming/);
  assert.doesNotMatch(prompt, leakWord);
  assert.match(prompt, /Start the trip draft anyway/);
  assert.match(prompt, /voice note/);
  assert.match(prompt, /second person/);
  assert.equal(prompt.startsWith(FIRST_INTAKE_GAP_INSTRUCTION), true);
  assertCleanFacts(facts);
}
const idNamed = firstIntakeReplyFacts({ customerTurn: shortInput.customerTurn, customerName: customerId });
assert.equal(idNamed.customer_name, undefined);
assert.equal(JSON.stringify(idNamed).includes(customerId), false);
const adaGaps = firstIntakeReplyFacts({ customerTurn: shortInput.customerTurn, customerName: 'Ada' });
assert.equal(adaGaps.customer_name, 'Ada');
assert.equal(adaGaps.shape, 'gaps');
const nightFacts = firstIntakeReplyFacts({ customerTurn: 'We want 9 nights somewhere.' });
assert.equal(nightFacts.nights, 9);
assert.equal(nightFacts.shape, 'gaps');

const questionTurn = 'Can he view without signing in?';
const questionFacts = firstIntakeReplyFacts({
  customerTurn: questionTurn,
  customerName: 'Ada',
  roster: [{ name: '', role: 'collaborator' }, { name: 'he', role: 'collaborator' }],
});
const questionPrompt = firstIntakeReplyPrompt({
  customerTurn: questionTurn,
  customerName: 'Ada',
  roster: [{ name: '', role: 'collaborator' }, { name: 'he', role: 'collaborator' }],
});
assert.equal(questionFacts.shape, 'question');
assert.equal(questionFacts.customer_name, 'Ada');
assert.equal(questionFacts.view_without_sign_in, VIEW_WITHOUT_SIGN_IN);
assert.equal(questionFacts.missing_name, true);
assert.equal(questionFacts.collaborators, undefined);
assert.equal(questionFacts.who, undefined);
assert.equal(questionFacts.plan, undefined);
assert.equal(JSON.stringify(questionFacts).includes('just the two of you'), false);
assert.equal(questionPrompt.startsWith(FIRST_INTAKE_QUESTION_INSTRUCTION), true);
assert.match(questionPrompt, /Answer the question first/);
assert.doesNotMatch(questionPrompt, leakWord);
assertCleanFacts(questionFacts);

const voiceReply = 'I am putting the itinerary together from the Big Island of Hawaii, the April dates, the house in Kailua-Kona, gardens, and a swim. Nico, Tess, and Mara can join and help shape it. You are on the TimeSyncher Vacation Single plan for this trip. What is still open about dinner the day you land?';
const gapReply = 'I can start a short draft from that. Where are you hoping to go? How long will you be away, and who is coming? A voice note would help.';
const originalFetch = globalThis.fetch;
const env = intakeLive.env;

function jevOk(score = 0) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      answers: { model_tier: { score }, route_type: { choice: 'general' } },
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
    assert.equal(body.model, tiers[1]);
    assert.doesNotMatch(body.model, /gpt-.*mini/i);
    const user = JSON.parse(body.messages.find((message) => message.role === 'user')?.content || '{}');
    const promptFacts = JSON.parse(voicePrompt.slice(voicePrompt.indexOf('Intake facts: ') + 'Intake facts: '.length));
    assert.deepEqual(user, promptFacts);
    assert.equal(voiceFacts.invite_contact_needed, true);
    assert.equal(user.invite_contact_needed, undefined);
    assert.equal(user.jev, undefined);
    assert.equal(user.pipeline, undefined);
    assertCleanFacts(user);
    assert.doesNotMatch(system, leakWord);
    assert.match(system, /Confirm the itinerary is being built/);
    assert.doesNotMatch(system, /When collaborators is present/);
    assert.doesNotMatch(system, /grant view or edit/i);
    assert.doesNotMatch(system, /plan they already purchased/i);
    assert.doesNotMatch(system, /yearly/i);
    assert.doesNotMatch(system, /unlimited/i);
    assert.match(system, /exactly one question/);
    assert.doesNotMatch(system, /invite_contact/);
    assert.match(system, /"plan_id":"timesyncher_vacation_single"/);
    assert.match(system, /"plan_name":"TimeSyncher Vacation Single"/);
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
  const produced = await produceLiveAppReply({ ...voiceInput, ...intakeLive });
  assert.equal(chatCalls.length, 1);
  assert.equal(produced.reply, voiceReply);
  assert.equal(produced.reason, null);
  assert.equal(produced.jev.modelTier, 1);
  assert.equal(produced.model.responseModel, tiers[1]);
  assert.equal(Number.isFinite(produced.jev.jevLatencyMs), true);
  assert.equal(Number.isFinite(produced.model.genLatencyMs), true);
  const stored = liveTurnRecord({
    turnIndex: 2,
    role: 'app',
    modality: 'text',
    text: produced.reply,
    at: new Date().toISOString(),
    latencyMs: 10,
    sessionE2eMs: 10,
    jev: produced.jev,
    model: produced.model,
    rules: produced.rules,
  });
  assert.equal(stored.tier, 1);
  assert.equal(stored.modelId, tiers[1]);
  assert.equal(stored.jevLatencyMs, produced.jev.jevLatencyMs);
  assert.equal(stored.generationMs, produced.model.genLatencyMs);
  assert.doesNotMatch(stored.modelId, /gpt-.*mini/i);

  chatCalls.length = 0;
  const gapPrompt = firstIntakeReplyPrompt({ ...shortInput, customerName: 'Ada' });
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      const system = body.messages?.find((message) => message.role === 'system')?.content || '';
      assert.equal(system, gapPrompt);
      const user = JSON.parse(body.messages.find((message) => message.role === 'user')?.content || '{}');
      assert.equal(user.customer_name, 'Ada');
      assert.equal(JSON.stringify(user).includes(customerId), false);
      assert.equal(user.jev, undefined);
      assertCleanFacts(user);
      assert.doesNotMatch(system, leakWord);
      assert.match(system, /Start the trip draft anyway/);
      assert.match(system, /voice note/);
      assert.match(system, /second person/);
      assert.doesNotMatch(system, /timesyncher_vacation_single/);
      assert.doesNotMatch(system, /plan they already purchased/);
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
    session: { customer_id: customerId, first_name: 'Ada' },
    env,
  });
  assert.ok(chatCalls.length >= 1 && chatCalls.length <= 2, `chatCalls=${chatCalls.length}`);
  assert.equal(gaps.reply, gapReply);
  assert.equal(gaps.reason, null);

  chatCalls.length = 0;
  const questionReply = 'Yes. Anyone with the trip link can view plans and photos without signing in. What is his name?';
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      const system = body.messages?.find((message) => message.role === 'system')?.content || '';
      const user = JSON.parse(body.messages.find((message) => message.role === 'user')?.content || '{}');
      assert.equal(system, questionPrompt);
      assert.equal(user.view_without_sign_in, VIEW_WITHOUT_SIGN_IN);
      assert.equal(user.customer_name, 'Ada');
      assert.equal(user.collaborators, undefined);
      assert.equal(user.missing_name, true);
      assert.equal(JSON.stringify(user).includes(customerId), false);
      assert.equal(JSON.stringify(user).includes('just the two of you'), false);
      assert.doesNotMatch(system, leakWord);
      assertCleanFacts(user);
      return {
        ok: true,
        json: async () => ({
          model: body.model,
          choices: [{ message: { content: questionReply } }],
        }),
      };
    }
    throw new Error(`unexpected ${target}`);
  };
  const asked = await produceLiveAppReply({
    customerTurn: questionTurn,
    intake: true,
    priorTurns: [],
    session: { customer_id: customerId, first_name: 'Ada' },
    env,
  });
  assert.equal(chatCalls.length, 1);
  assert.equal(asked.reply, questionReply);
  assert.equal(asked.reason, null);

  chatCalls.length = 0;
  const leaked = "I see you've already picked out your model tier and route.";
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      return {
        ok: true,
        json: async () => ({
          model: body.model,
          choices: [{ message: { content: leaked } }],
        }),
      };
    }
    throw new Error(`unexpected ${target}`);
  };
  const flagged = await produceLiveAppReply({ ...voiceInput, ...intakeLive });
  assert.equal(chatCalls.length, 2);
  assert.equal(flagged.reply, null);
  assert.equal(flagged.reason, 'first_intake_reply_flagged');
  assert.equal(firstIntakeReplyLeak(leaked), true);

  chatCalls.length = 0;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk(2);
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      assert.equal(body.model, tiers[3]);
      assert.doesNotMatch(body.model, /gpt-.*mini/i);
      const system = body.messages?.find((message) => message.role === 'system')?.content || '';
      assert.doesNotMatch(system, leakWord);
      return {
        ok: true,
        json: async () => ({
          model: body.model,
          choices: [{ message: { content: voiceReply } }],
        }),
      };
    }
    throw new Error(`unexpected ${target}`);
  };
  const tierThree = await produceLiveAppReply({ ...voiceInput, ...intakeLive });
  assert.equal(chatCalls.length, 1);
  assert.equal(tierThree.reply, voiceReply);
  assert.equal(tierThree.jev.modelTier, 3);
  assert.equal(tierThree.model.responseModel, tiers[3]);

  chatCalls.length = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/api/alpha/decisions')) {
      return { ok: false, status: 503, json: async () => ({ error: { message: 'jev down' } }) };
    }
    if (target.includes('/chat/completions')) {
      chatCalls.push({});
      throw new Error('fallback model was called');
    }
    throw new Error(`unexpected ${target}`);
  };
  const jevFailed = await produceLiveAppReply({ ...voiceInput, ...intakeLive });
  assert.equal(chatCalls.length, 0);
  assert.equal(jevFailed.reply, null);
  assert.equal(jevFailed.reason, 'jev down');
  assert.equal(jevFailed.model, null);

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
  const failed = await produceLiveAppReply({ ...voiceInput, ...intakeLive, session: { trip_id: 'test-trip' } });
  assert.equal(chatCalls.length, 2);
  assert.equal(failed.reply, null);
  assert.equal(failed.reason, 'model down');
  assert.doesNotMatch(JSON.stringify({ reply: failed.reply, reason: failed.reason }), phrase);
  assert.notEqual(failed.reply, 'I am building the itinerary from that now');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('first intake reply passed');
