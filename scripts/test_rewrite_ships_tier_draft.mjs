#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { liveTurnRecord, produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';

const TIER_MODEL = 'deepseek/deepseek-v3.2';
const HOLDING_MODEL = 'google/gemini-2.5-flash-lite';
const DRAFT = 'We have corrected Thursday into a town walk.';
const REWRITE = 'The garden morning moved, and we have corrected the week around it.';
const HOLDING = 'Thursday can stay a town walk.';

const env = {
  OPENROUTER_API_KEY: 'test-key',
  TIMESYNCHER_JEV_CLASSIFY_URL: 'https://jev.example/api/alpha/decisions',
};

function json(payload, status = 200) {
  return { ok: status < 400, status, json: async () => payload };
}

const originalFetch = globalThis.fetch;

async function withFetch(fetchImpl, run) {
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const tierCalls = [];
await withFetch(async (url, init = {}) => {
  const href = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  tierCalls.push({ href, body });
  if (href.includes('/api/alpha/decisions')) {
    if (body.questions?.model_tier) {
      return json({ answers: { model_tier: { score: 2 }, route_type: { choice: 'general' } } });
    }
    return json({
      answers: {
        overall_quality: { score: 0 },
        disposition: { choice: 'rewrite' },
        fix_focus: { choice: 'misses_ask' },
      },
    });
  }
  if (href.includes('/chat/completions')) {
    const model = body.model;
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    const user = body.messages?.find((message) => message.role === 'user')?.content || '';
    if (model === HOLDING_MODEL && /"template"/.test(system) && /canShip/.test(system)) {
      return json({ model, choices: [{ message: { content: '{"template":false,"canShip":true}' } }] });
    }
    if (model === HOLDING_MODEL && /Do not write a customer reply/.test(system)) {
      return json({ model, choices: [{ message: { content: '{"asksPrice":false,"asksAccess":false,"pullsAccess":false,"seats":[],"ask":false}' } }] });
    }
    if (model === HOLDING_MODEL) {
      return json({ model, choices: [{ message: { content: HOLDING } }] });
    }
    if (model === TIER_MODEL) {
      const text = user.includes('WHAT_I_CHANGED') ? REWRITE : DRAFT;
      return json({ model, choices: [{ message: { content: text } }] });
    }
    return json({ error: 'unexpected model' }, 404);
  }
  return json({ error: 'unexpected url' }, 404);
}, async () => {
  const produced = await produceLiveAppReply({
    customerTurn: 'Thursday is a town walk.',
    session: { token: 'sess', display_name: 'Noah' },
    priorTurns: [],
    tripTitle: '',
    env,
  });
  const record = liveTurnRecord({
    turnIndex: 2,
    role: 'app',
    modality: 'text',
    text: produced.reply,
    at: '2026-10-01T00:00:00.000Z',
    latencyMs: 1,
    sessionE2eMs: 1,
    jev: produced.jev,
    model: produced.model,
  });
  assert.equal(produced.reply, DRAFT);
  assert.notEqual(produced.reply, HOLDING);
  assert.notEqual(produced.reply, REWRITE);
  assert.equal(produced.log.interimReply.text, HOLDING);
  assert.equal(produced.log.interimReply.model, HOLDING_MODEL);
  assert.equal(produced.log.draftModel, TIER_MODEL);
  assert.equal(produced.log.shippedModel, TIER_MODEL);
  assert.equal(produced.model.responseModel, TIER_MODEL);
  assert.equal(record.modelId, TIER_MODEL);
  assert.equal(record.shippedModel, TIER_MODEL);
  assert.equal(produced.jev.modelTier, 3);
  assert.equal(produced.jev.responseModel, TIER_MODEL);
  const chats = tierCalls.filter((call) => call.href.includes('/chat/completions'));
  assert.equal(chats.some((call) => call.body.model === TIER_MODEL), true);
  assert.equal(chats.some((call) => call.body.model !== TIER_MODEL && call.body.model !== HOLDING_MODEL), false);
});

const jevCalls = [];
await withFetch(async (url, init = {}) => {
  const href = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  jevCalls.push({ href, body });
  if (href.includes('/api/alpha/decisions')) return json({}, 503);
  if (href.includes('/chat/completions')) {
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    if (/Do not write a customer reply/.test(system)) {
      return json({ model: body.model, choices: [{ message: { content: '{"asksPrice":false,"asksAccess":false,"seats":[],"ask":false}' } }] });
    }
    return json({ error: 'tier model must not run' }, 500);
  }
  return json({ error: 'unexpected url' }, 404);
}, async () => {
  const produced = await produceLiveAppReply({
    customerTurn: 'Thursday is a town walk.',
    session: { token: 'sess', display_name: 'Noah' },
    priorTurns: [],
    tripTitle: '',
    env,
  });
  const decisions = jevCalls.filter((call) => call.href.includes('/api/alpha/decisions'));
  const tierChats = jevCalls.filter((call) => {
    if (!call.href.includes('/chat/completions')) return false;
    const system = call.body.messages?.find((message) => message.role === 'system')?.content || '';
    return !/Do not write a customer reply/.test(system);
  });
  assert.equal(decisions.length, 2);
  assert.equal(tierChats.length, 0);
  assert.equal(produced.reply, null);
  assert.equal(produced.reason, 'Jev HTTP 503');
});

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const includeFiles = String(vercel.functions['api/[...route].mjs'].includeFiles || '');
const included = includeFiles.replace(/^\{|\}$/g, '').split(',').map((file) => file.trim()).filter(Boolean);
assert.ok(included.includes('dialog-runners/tier_models.json'));
assert.ok(included.every((file) => file.endsWith('.json')));
assert.equal(included.some((file) => /\.(mjs|js|cjs|py)$/.test(file)), false);

const route = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(route, /payload\.replyFailure = replyFailure/);
assert.match(route, /error: replyFailure/);
assert.doesNotMatch(route, /delete from transcript_turns where id = \$\{turnRows\[0\]\.id\}/);
assert.doesNotMatch(route, /Sorry|try again later|I could not write/i);

console.log('rewrite ships tier draft: ok');
