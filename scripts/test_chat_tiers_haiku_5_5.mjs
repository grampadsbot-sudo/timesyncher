#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  INTERIM_MODEL,
  assertBakeoffMap,
  bakeoffTierModels,
  callTieredModel,
  isBakeoffModelId,
} from './vacation-app-reply-rules.mjs';
import {
  openRouterProviderForTier,
  openRouterTierReasoningSpread,
} from './openrouter-tier-provider.mjs';
import { tripIntakeExtractionChatRequest } from '../src/vacation/trip-intake-classify.mjs';

const HAIKU = 'anthropic/claude-haiku-5.5';
const CANONICAL = 'anthropic/claude-haiku-5.5-20261007';
const BANNED_MINI = fs.readFileSync(new URL('./fixtures/hardcoded-content/model-allowlist.mjs', import.meta.url), 'utf8').match(/gpt-[a-z0-9.]+-mini/)[0];

const file = JSON.parse(fs.readFileSync(new URL('../dialog-runners/tier_models.json', import.meta.url), 'utf8'));
assert.equal(file.no_gpt5mini, true);
for (const tier of [1, 2, 3, 4]) {
  assert.equal(file.models[String(tier)], HAIKU);
  assert.equal(bakeoffTierModels()[tier], HAIKU);
}
assert.equal(assertBakeoffMap(file.models), true);
assert.equal(INTERIM_MODEL, HAIKU);

for (const tier of ['1', '2', '3', '4']) {
  assert.throws(() => assertBakeoffMap({ ...file.models, [tier]: 'deepseek/deepseek-v3.2' }), /refused/);
  assert.throws(() => assertBakeoffMap({ ...file.models, [tier]: BANNED_MINI }), /refused/);
}
assert.equal(isBakeoffModelId(BANNED_MINI), false);
assert.equal(isBakeoffModelId(CANONICAL), false);
assert.equal(isBakeoffModelId('qwen/qwen3-max'), false);

assert.deepEqual(openRouterTierReasoningSpread(1), { reasoning: { enabled: false, effort: 'low' } });
assert.deepEqual(openRouterTierReasoningSpread(2), { reasoning: { effort: 'low', max_tokens: 512 } });
assert.deepEqual(openRouterTierReasoningSpread(3), { reasoning: { effort: 'medium', max_tokens: 1024 } });
assert.deepEqual(openRouterTierReasoningSpread(4), { reasoning: { effort: 'high', max_tokens: 2048 } });
assert.deepEqual(openRouterTierReasoningSpread(0), {});
assert.ok(openRouterProviderForTier(1).max_price.completion >= 0.50);

const extraction = tripIntakeExtractionChatRequest({ message: 'Maui in March', model: HAIKU });
assert.equal(extraction.provider.require_parameters, true);
assert.equal('temperature' in extraction, false);
assert.equal(tripIntakeExtractionChatRequest({ message: 'Maui in March', model: 'deepseek/deepseek-v3.2' }).temperature, 0);

const calls = [];
let returnedModel = (body) => body.model;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const body = JSON.parse(init.body);
  calls.push(body);
  return {
    ok: true,
    status: 200,
    json: async () => ({ model: returnedModel(body), choices: [{ message: { content: 'Thursday stays open.' } }] }),
  };
};

function ask(extra) {
  calls.length = 0;
  return callTieredModel({
    rules: {},
    customerTurn: 'Thursday is a town walk.',
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    destination: '',
    memory: [],
    upsell: 'forbidden',
    env: { OPENROUTER_API_KEY: 'test-key' },
    ...extra,
  });
}

try {
  const expected = {
    1: { reasoning: { enabled: false, effort: 'low' }, maxTokens: 900 },
    2: { reasoning: { effort: 'low', max_tokens: 512 }, maxTokens: 1412 },
    3: { reasoning: { effort: 'medium', max_tokens: 1024 }, maxTokens: 1924 },
    4: { reasoning: { effort: 'high', max_tokens: 2048 }, maxTokens: 2948 },
  };
  for (const tier of [1, 2, 3, 4]) {
    const reply = await ask({ jev: { jevRan: true, modelTier: tier } });
    assert.equal(reply.called, true, reply.reason);
    assert.equal(reply.maxTokens, 900);
    assert.equal(reply.responseModel, HAIKU);
    assert.equal(calls[0].model, HAIKU);
    assert.equal(calls[0].max_tokens, expected[tier].maxTokens);
    assert.deepEqual(calls[0].reasoning, expected[tier].reasoning);
    assert.equal('temperature' in calls[0], false);
  }

  const interim = await ask({ jev: { jevRan: true, modelTier: 3 }, forceModel: INTERIM_MODEL, tier1CompactReasoning: true });
  assert.equal(interim.called, true, interim.reason);
  assert.equal(interim.maxTokens, 900);
  assert.equal(calls[0].max_tokens, 900);
  assert.deepEqual(calls[0].reasoning, { enabled: false, effort: 'low' });

  const rewrite = await ask({ jev: { jevRan: true, modelTier: 3 }, forceModel: HAIKU });
  assert.equal(rewrite.called, true, rewrite.reason);
  assert.equal(rewrite.maxTokens, 900);
  assert.equal(calls[0].max_tokens, 1924);
  assert.deepEqual(calls[0].reasoning, { effort: 'medium', max_tokens: 1024 });

  returnedModel = () => CANONICAL;
  const canonical = await ask({ jev: { jevRan: true, modelTier: 2 } });
  assert.equal(canonical.called, true, canonical.reason);
  assert.equal(canonical.responseModel, HAIKU);

  for (const other of [`${CANONICAL}-beta`, 'vendor/not-on-bakeoff-1', 'qwen/qwen3-max', BANNED_MINI]) {
    returnedModel = () => other;
    const refused = await ask({ jev: { jevRan: true, modelTier: 2 } });
    assert.equal(refused.called, false);
    assert.equal(refused.reason, 'model_not_in_bakeoff_map');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('chat tiers haiku 5.5: ok');
