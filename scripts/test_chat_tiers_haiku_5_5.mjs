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
  openRouterChatVisibleText,
  openRouterProviderForTier,
  openRouterTierReasoningSpread,
  openRouterTierRequestMaxTokens,
} from './openrouter-tier-provider.mjs';
import { tripIntakeExtractionChatRequest } from '../src/vacation/trip-intake-classify.mjs';
import { useVacationDatabase } from '../src/vacation/db.mjs';
import { loadSavedTripRecord } from '../src/vacation/live-app-saved-trip-record.mjs';
import { draftingFacts, judgeInterimReply, savedThingPlaceResults } from '../src/vacation/live-app-turn.mjs';
import { chatQaProofErrors } from './chat_qa_live_probe.mjs';

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
assert.deepEqual(openRouterTierReasoningSpread(2), { reasoning: { effort: 'low' } });
assert.deepEqual(openRouterTierReasoningSpread(3), { reasoning: { effort: 'medium' } });
assert.deepEqual(openRouterTierReasoningSpread(4), { reasoning: { effort: 'high' } });
assert.equal(openRouterTierRequestMaxTokens(1, 900), 900);
assert.equal(openRouterTierRequestMaxTokens(2, 900), 3072);
assert.equal(openRouterTierRequestMaxTokens(3, 900), 4608);
assert.equal(openRouterTierRequestMaxTokens(4, 900), 6144);
assert.match(openRouterChatVisibleText([
  { type: 'reasoning', text: 'hidden chain' },
  { type: 'text', text: 'Visible reply.' },
]), /Visible reply/);
assert.equal(openRouterChatVisibleText([{ type: 'reasoning', text: 'only thinking' }]), '');
assert.deepEqual(openRouterTierReasoningSpread(0), {});
assert.ok(openRouterProviderForTier(1).max_price.completion >= 0.50);

const extraction = tripIntakeExtractionChatRequest({ message: 'Maui in March', model: HAIKU });
assert.equal(extraction.provider.require_parameters, true);
assert.equal('temperature' in extraction, false);
assert.equal(tripIntakeExtractionChatRequest({ message: 'Maui in March', model: 'deepseek/deepseek-v3.2' }).temperature, 0);

const calls = [];
let returnedModel = (body) => body.model;
const originalFetch = globalThis.fetch;
const sharedPayload = {
  places: [
    { id: 12, name: 'Carbone', category: { name: 'Restaurant' }, place_time: '19:00' },
    { id: 34, name: 'Zinc Bar', category: { name: 'Bar' } },
  ],
  days: [{ id: 2, day_number: 2, date: '2026-06-24' }, { id: 3, day_number: 3, date: '2026-06-25' }],
  assignments: { 3: [{ place_id: 12 }], 2: [{ place: { id: 34 } }] },
  thingOverrides: { 'place:12': { dayIds: [2], perDaySchedule: { 2: { startTime: '20:30' } } } },
};
let metadata = { sharedToken: 'bound-shared-trip', dialogParty: { primary: { name: 'Alex' } } };
const reads = [];
useVacationDatabase(async (parts) => {
  const query = parts.join('?');
  reads.push(query);
  assert.match(query, /^select /);
  if (query.includes('from trips')) return [{ destination: 'New York City', metadata }];
  assert.match(query, /from trip_things/);
  return [{ title: 'CARBONE', category: 'restaurant', metadata: { whenLabel: 'stale date', customerWhen: 'stale date', who: 'Alex', notes: ['Dinner'] } }];
});
const sharedEnv = { DATABASE_URL: 'offline', TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://shared.example' };
let sharedHttp = 200;
let sharedBody = sharedPayload;
const sharedCalls = [];
globalThis.fetch = async (url, init) => {
  sharedCalls.push({ url, init });
  assert.equal(url, 'https://shared.example/api/shared/bound-shared-trip/');
  assert.equal(init.method, 'GET');
  assert.equal(init.body, undefined);
  return { ok: sharedHttp === 200, status: sharedHttp, json: async () => sharedBody };
};
let groundedContext;
try {
  const record = await loadSavedTripRecord({ trip_id: 'trip-copy' }, sharedEnv);
  assert.deepEqual(record.things.map((thing) => thing.title), ['Carbone', 'Zinc Bar']);
  assert.equal(record.things[0].whenLabel, '2026-06-24 20:30');
  assert.equal(record.things[1].whenLabel, '2026-06-24');
  assert.equal(record.things[0].category, 'restaurant');
  assert.equal(record.things[0].customerWhen, '');
  assert.equal(record.things[0].who, 'Alex');
  assert.deepEqual(record.things[0].notes, ['Dinner']);
  assert.deepEqual(savedThingPlaceResults(record).map((place) => place.name), ['Carbone', 'Zinc Bar']);
  groundedContext = draftingFacts([], '', record);
  assert.match(groundedContext.itinerary.join('; '), /Carbone: 2026-06-24 20:30/);
  assert.match(groundedContext.itinerary.join('; '), /Zinc Bar/);
  assert.ok(reads.length > 0);
  sharedHttp = 503;
  assert.equal(await loadSavedTripRecord({ trip_id: 'trip-copy' }, sharedEnv), null);
  sharedHttp = 200;
  sharedBody = {};
  assert.equal(await loadSavedTripRecord({ trip_id: 'trip-copy' }, sharedEnv), null);
  sharedBody = sharedPayload;
  sharedPayload.thingOverrides['place:34'] = { timeline: false };
  assert.equal((await loadSavedTripRecord({ trip_id: 'trip-copy' }, sharedEnv)).things[1].whenLabel, '');
  const before = sharedCalls.length;
  metadata = { publicSlug: 'intake-local-trip', intakeShare: true };
  assert.equal((await loadSavedTripRecord({ trip_id: 'trip-local' }, sharedEnv)).things[0].title, 'CARBONE');
  metadata = {};
  await loadSavedTripRecord({ trip_id: 'trip-local' }, sharedEnv);
  assert.equal(await loadSavedTripRecord({ trip_id: 'trip-local' }, {}), null);
  assert.equal(sharedCalls.length, before);
} finally {
  useVacationDatabase(null);
  globalThis.fetch = originalFetch;
}
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
    2: { reasoning: { effort: 'low' }, maxTokens: 3072 },
    3: { reasoning: { effort: 'medium' }, maxTokens: 4608 },
    4: { reasoning: { effort: 'high' }, maxTokens: 6144 },
  };
  for (const tier of [1, 2, 3, 4]) {
    const reply = await ask({ jev: { jevRan: true, modelTier: tier }, tripContext: groundedContext });
    assert.equal(reply.called, true, reply.reason);
    assert.equal(reply.maxTokens, 900);
    assert.equal(reply.responseModel, HAIKU);
    assert.equal(calls[0].model, HAIKU);
    assert.equal(calls[0].max_tokens, expected[tier].maxTokens);
    assert.deepEqual(calls[0].reasoning, expected[tier].reasoning);
    assert.equal('temperature' in calls[0], false);
    const prompt = JSON.parse(calls[0].messages.find((message) => message.role === 'user').content);
    assert.ok(prompt.trip_context.itinerary.some((line) => line.includes('Carbone')));
    assert.ok(prompt.trip_context.itinerary.some((line) => line.includes('Zinc Bar')));
  }

  const interim = await ask({ jev: { jevRan: true, modelTier: 3 }, forceModel: INTERIM_MODEL, tier1CompactReasoning: true });
  assert.equal(interim.called, true, interim.reason);
  assert.equal(interim.maxTokens, 900);
  assert.equal(calls[0].max_tokens, 900);
  assert.deepEqual(calls[0].reasoning, { enabled: false, effort: 'low' });

  const rewrite = await ask({ jev: { jevRan: true, modelTier: 3 }, forceModel: HAIKU });
  assert.equal(rewrite.called, true, rewrite.reason);
  assert.equal(rewrite.maxTokens, 900);
  assert.equal(calls[0].max_tokens, 4608);
  assert.deepEqual(calls[0].reasoning, { effort: 'medium' });

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

  returnedModel = (body) => body.model;
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: returnedModel(body),
        choices: [{
          message: {
            content: [
              { type: 'reasoning', text: 'internal only' },
              { type: 'text', text: 'Happy hour near Lincoln Center stays open.\nBEAT: bar picks' },
            ],
          },
        }],
      }),
    };
  };
  const arrayBody = await ask({ jev: { jevRan: true, modelTier: 2 } });
  assert.equal(arrayBody.called, true, arrayBody.reason);
  assert.match(arrayBody.text, /Lincoln Center/);
} finally {
  globalThis.fetch = originalFetch;
}

const validProof = {
  buildSha: 'head', finalBuildSha: 'head', expectedHead: 'head',
  protectedBefore: 'hash', protectedAfter: 'hash', expectedProtectedHash: 'hash',
  placeNames: ['Carbone', 'Zinc Bar'],
  turns: [1, 2, 3, 4].map((tier) => ({
    httpStatus: 200, ok: true, modelTier: tier, jevRan: true, jevBeforeModel: true,
    responseModel: HAIKU, reply: 'Carbone is on your saved itinerary.', replyMs: 1200, generationMs: 1000,
  })),
};
assert.deepEqual(chatQaProofErrors(validProof), []);
for (const [field, value, expected] of [
  ['reply', '', 'empty_reply'], ['reply', 'Here is a generic day plan.', 'not_trip_grounded'],
  ['modelTier', 2, 'jev_tier_mismatch'], ['responseModel', 'vendor/other', 'model_mismatch'],
  ['replyMs', 70, 'generation_timing_missing_or_short'], ['generationMs', null, 'generation_timing_missing_or_short'],
  ['httpStatus', 500, 'http_or_app_failure'], ['ok', false, 'http_or_app_failure'],
]) {
  const proof = structuredClone(validProof);
  proof.turns[2][field] = value;
  assert.ok(chatQaProofErrors(proof).includes(`T3:${expected}`));
}
assert.ok(chatQaProofErrors({ ...validProof, turns: validProof.turns.slice(0, 3) }).includes('four_turns_required'));
assert.ok(chatQaProofErrors({ ...validProof, protectedAfter: 'changed' }).includes('protected_trip_changed'));
assert.ok(chatQaProofErrors({ ...validProof, expectedProtectedHash: 'other' }).includes('protected_hash_mismatch'));
assert.ok(chatQaProofErrors({ ...validProof, finalBuildSha: 'other' }).includes('staging_head_mismatch'));

const arrayJudge = await judgeInterimReply({
  text: 'Thursday stays a town walk.',
  customerTurn: 'Thursday is a town walk.',
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: [
            { type: 'reasoning', text: 'classify hold line' },
            { type: 'text', text: '{"template":false,"canShip":true}' },
          ],
        },
      }],
    }),
  }),
});
assert.equal(arrayJudge.template, false);
assert.equal(arrayJudge.canShip, true);

console.log('chat tiers haiku 5.5: ok');
