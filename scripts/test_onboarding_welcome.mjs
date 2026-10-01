import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ONBOARDING_WELCOME_INSTRUCTION,
  onboardingWelcomeFacts,
  onboardingWelcomePrompt,
  produceOnboardingOpener,
} from '../src/vacation/live-app-turn.mjs';

const root = new URL('../', import.meta.url);
const cannedWelcome = /I can help you plan your trip|What destination do you have in mind|Welcome aboard|Your website is not built yet|Tell me the trip basics|onboardingOpenerText|ONBOARDING_OPENER_WITH_SITE|ONBOARDING_OPENER_CHAT_ONLY|CANNED_APP_REPLY/;

async function sourceFiles() {
  const named = [
    'src/vacation/live-app-turn.mjs',
    'scripts/vacation-app-reply-rules.mjs',
  ];
  const dirs = ['routes', 'api'];
  const files = named.map((file) => new URL(file, root));
  for (const dir of dirs) {
    const abs = new URL(`${dir}/`, root);
    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
      files.push(new URL(path.join(dir, entry.name), root));
    }
  }
  return files;
}

for (const file of await sourceFiles()) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, cannedWelcome, file.pathname);
}

const facts = onboardingWelcomeFacts({ returning: true, tripTitle: 'Anniversary' });
assert.equal(facts.first_message, true);
assert.equal(facts.customer_said, null);
assert.equal(facts.returning_trip, true);
assert.equal(facts.product, 'TimeSyncher');
assert.deepEqual(facts.product_does, [
  'plans the trip',
  'remembers and keeps the trip',
  'invites travel companions',
  'turns the trip into keepsakes',
]);
assert.equal(facts.prices, null);
const prompt = onboardingWelcomePrompt({ returning: true, tripTitle: 'Anniversary' });
assert.match(prompt, new RegExp(ONBOARDING_WELCOME_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(prompt, /Welcome facts: /);
assert.match(prompt, /"prices":null/);
assert.doesNotMatch(prompt, /\$\d+/);
assert.doesNotMatch(prompt, cannedWelcome);
assert.doesNotMatch(prompt, /Ask the customer where the trip is/);
assert.doesNotMatch(prompt, /Do not insert a welcome the customer did not ask for/);

const modelWelcome = 'Glad you are here. TimeSyncher plans the vacation, remembers and keeps the trip, invites travel companions, and turns it into keepsakes. Send a long voice note, or type if you prefer, and tell the whole story: where, when, who is coming, what you want to do, and what matters to you.';
const originalFetch = globalThis.fetch;
const chatCalls = [];

function jevOk() {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      answers: {
        model_tier: { score: 0 },
        route_type: { choice: 'general' },
      },
    }),
  };
}

globalThis.fetch = async (url, init) => {
  const target = String(url);
  const body = init?.body ? JSON.parse(init.body) : {};
  if (target.includes('/api/alpha/decisions')) return jevOk();
  if (target.includes('/chat/completions')) {
    chatCalls.push(body);
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    assert.equal(system, onboardingWelcomePrompt({ returning: true, tripTitle: 'Anniversary' }));
    assert.match(system, /Warmly welcome them/);
    assert.match(system, /"product_does":\["plans the trip"/);
    assert.doesNotMatch(system, cannedWelcome);
    return {
      ok: true,
      json: async () => ({
        model: body.model,
        choices: [{ message: { content: `${modelWelcome}\nBEAT: welcomed the customer` } }],
      }),
    };
  }
  throw new Error(`unexpected ${target}`);
};

try {
  const produced = await produceOnboardingOpener({
    returning: true,
    tripTitle: 'Anniversary',
    env: { OPENROUTER_API_KEY: 'test-key' },
  });
  assert.equal(chatCalls.length, 1);
  assert.equal(produced.reply, modelWelcome);
  assert.equal(produced.reason, null);
  assert.doesNotMatch(produced.reply, cannedWelcome);

  chatCalls.length = 0;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(body);
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'model down' } }),
      };
    }
    throw new Error(`unexpected ${target}`);
  };
  const failed = await produceOnboardingOpener({
    returning: false,
    env: { OPENROUTER_API_KEY: 'test-key' },
  });
  assert.equal(chatCalls.length, 2);
  assert.equal(failed.reply, null);
  assert.equal(failed.reason, 'model down');
  assert.doesNotMatch(String(failed.reason), cannedWelcome);
  assert.notEqual(failed.reply, 'I can help you plan your trip. What destination do you have in mind for this vacation?');

  chatCalls.length = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/api/alpha/decisions')) return jevOk();
    if (target.includes('/chat/completions')) {
      chatCalls.push(target);
      throw new Error('socket closed');
    }
    throw new Error(`unexpected ${target}`);
  };
  const thrown = await produceOnboardingOpener({
    returning: false,
    env: { OPENROUTER_API_KEY: 'test-key' },
  });
  assert.equal(chatCalls.length, 2);
  assert.equal(thrown.reply, null);
  assert.match(thrown.reason, /socket closed/);
  assert.doesNotMatch(String(thrown.reason), cannedWelcome);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('onboarding welcome passed');
