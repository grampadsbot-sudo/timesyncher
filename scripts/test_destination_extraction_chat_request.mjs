#!/usr/bin/env node
import assert from 'node:assert/strict';
import { openRouterTier1BakeoffModelId } from './openrouter-tier-provider.mjs';
import { destinationExtractionChatRequest } from '../src/vacation/trip-destination.mjs';

const corpus = 'We want to go to Kyoto for a week in April.';
const request = destinationExtractionChatRequest(corpus);

assert.equal(request.model, openRouterTier1BakeoffModelId());
assert.equal(request.max_tokens, 40);
assert.equal(request.temperature, 0);
assert.deepEqual(request.provider?.max_price, { prompt: 0.15, completion: 0.40 });
assert.equal(request.reasoning?.enabled, false);
assert.equal(request.reasoning?.effort, 'low');
assert.equal(request.messages.at(-1)?.content, corpus);
assert.match(request.messages[0]?.content || '', /only that place/);

console.log(JSON.stringify({
  ok: true,
  checked: 'destination-extraction-chat-request',
  model: request.model,
  maxTokens: request.max_tokens,
  reasoning: request.reasoning,
}));
