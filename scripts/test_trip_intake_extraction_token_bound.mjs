#!/usr/bin/env node
import assert from 'node:assert/strict';
import { bakeoffTierModels } from '../scripts/vacation-app-reply-rules.mjs';
import {
  TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT,
  classifyTripIntake,
  tripIntakeExtractionChatRequest,
  tripIntakeExtractionJsonSchema,
  tripIntakeExtractionMaxTokens,
} from '../src/vacation/trip-intake-classify.mjs';

const tierModel = bakeoffTierModels()[1];
assert.equal(tierModel, 'deepseek/deepseek-v4-flash');

const schema = tripIntakeExtractionJsonSchema();
const bound = tripIntakeExtractionMaxTokens(schema);
assert.ok(bound >= 2048, `extraction max_tokens ${bound} is below the populated-schema floor`);

const request = tripIntakeExtractionChatRequest({
  message: "add Mama's Fish House for Saturday",
  model: tierModel,
});
assert.equal(request.model, tierModel);
assert.equal(request.max_tokens, bound);
assert.equal(request.temperature, 0);
assert.equal(request.provider.require_parameters, true);
assert.deepEqual(request.provider.max_price, { prompt: 0.15, completion: 0.40 });
assert.equal(request.response_format.type, 'json_schema');
assert.equal(request.response_format.json_schema.strict, true);
assert.equal(request.response_format.json_schema.name, 'trip_intake_extraction');

const root = schema.json_schema.schema;
for (const key of root.required) {
  assert.match(TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT, new RegExp(key), `prompt missing schema key ${key}`);
}
assert.doesNotMatch(TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT, /number\|null/);
assert.match(TRIP_INTAKE_EXTRACTION_SYSTEM_PROMPT, /"age":null/);
assert.deepEqual(root.properties.roster.items.properties.age.type, ['number', 'null']);

const calls = [];
const classified = await classifyTripIntake({
  text: 'Maui March 10-17 2027',
  apiKey: 'test-key',
  routerModel: 'test/jev-router',
  fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    if (String(url).includes('/decisions')) {
      return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.91 } } }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) };
  },
});

assert.equal(calls.length, 2, 'classifier failure stays one extraction call');
const extraction = calls[1];
assert.match(extraction.url, /chat\/completions$/);
assert.equal(extraction.body.model, tierModel);
assert.equal(extraction.body.max_tokens, bound);
assert.ok(extraction.body.max_tokens >= 2048);
assert.equal(extraction.body.provider.require_parameters, true);
assert.equal(extraction.body.response_format.json_schema.strict, true);
assert.deepEqual(extraction.body.response_format.json_schema.schema.required, root.required);
assert.equal(classified.ok, false);
assert.match(classified.error, /was not JSON/);
assert.equal(classified.things.length, 0);

console.log(JSON.stringify({
  ok: true,
  checked: 'trip-intake-extraction-token-bound',
  model: tierModel,
  maxTokens: bound,
}));
