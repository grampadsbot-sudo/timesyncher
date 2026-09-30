import assert from 'node:assert/strict';
import { configuredSeatDollars } from '../src/vacation/seat-price.mjs';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';

const priceKeys = [
  'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS',
  'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS',
  'TIMESYNCHER_COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS',
  'TIMESYNCHER_BASE_PRICE_CENTS',
  'TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS',
  'TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS',
  'TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS',
  'TIMESYNCHER_CHECKOUT_CURRENCY',
];
const saved = {};
for (const key of priceKeys) {
  saved[key] = process.env[key];
  delete process.env[key];
}

assert.equal(configuredSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }), 19);
assert.equal(configuredSeatDollars({}), null);

const modelEnv = {
  OPENROUTER_API_KEY: 'test-key',
  TIMESYNCHER_JEV_CLASSIFY_URL: 'https://openrouter.ai/api/alpha/decisions',
};
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  calls.push({ href, body });
  const json = (payload, status = 200) => ({ ok: status < 400, status, json: async () => payload });
  if (href.includes('/api/alpha/decisions')) {
    return json({ answers: { model_tier: { score: 1 }, route_type: { choice: 'general' }, overall_quality: { score: 3 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' } } });
  }
  const system = String(body.messages?.find((message) => message.role === 'system')?.content || '');
  const user = String(body.messages?.find((message) => message.role === 'user')?.content || '');
  if (system.includes('Return one JSON object') || user.includes('asksPrice')) {
    return json({ choices: [{ message: { content: '{"asksPrice":true,"asksAccess":false,"pullsAccess":false,"seats":[{"name":"Ada","payer":"you"}],"ask":false}' } }] });
  }
  if (body.model === 'google/gemini-2.5-flash-lite') {
    return json({ model: body.model, choices: [{ message: { content: 'The plan for Ada is $19, paid by you.' } }] });
  }
  if (user.includes('PRICE UNSET')) {
    return json({ model: body.model, choices: [{ message: { content: 'Thursday stays open.' } }] });
  }
  return json({ model: body.model, choices: [{ message: { content: '' } }] });
};

function dollarHits(predicate) {
  return calls.filter((call) => {
    if (!String(call.href).includes('/chat/completions')) return false;
    const system = String(call.body?.messages?.find((message) => message.role === 'system')?.content || '');
    return predicate(call, system);
  }).map((call) => {
    const system = String(call.body?.messages?.find((message) => message.role === 'system')?.content || '');
    const match = system.match(/\$(\d+)/);
    return match ? Number(match[1]) : null;
  });
}

try {
  const priced = await produceLiveAppReply({
    customerTurn: 'How much is the plan? I pay for Ada.',
    session: { token: 'sess', display_name: 'Noah' },
    priorTurns: [],
    roster: [{ name: 'Ada', role: 'collaborator', payer: 'you' }],
    tripTitle: '',
    env: modelEnv,
    seatDollars: configuredSeatDollars({ TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' }),
  });
  assert.equal(priced.reply, 'The plan for Ada is $19, paid by you.');
  const mainDollars = dollarHits((call, system) => system.includes('vacation-app producer'));
  const interimDollars = dollarHits((call, system) => system.includes('State the payer line exactly') && call.body?.model === 'google/gemini-2.5-flash-lite');
  assert.ok(mainDollars.length > 0, 'main reply path received no price');
  assert.ok(interimDollars.length > 0, 'interim reply path received no price');
  assert.equal(mainDollars[0], 19);
  assert.equal(interimDollars[0], 19);

  calls.length = 0;
  const unset = await produceLiveAppReply({
    customerTurn: 'How much is the plan? PRICE UNSET.',
    session: { token: 'sess', display_name: 'Noah' },
    priorTurns: [],
    tripTitle: '',
    env: modelEnv,
    seatDollars: configuredSeatDollars({}),
  });
  assert.equal(unset.reply, 'Thursday stays open.');
  const bodies = calls.map((call) => JSON.stringify(call.body || {}));
  assert.equal(bodies.some((body) => /price not configured|configured price is missing|configured seat price is missing/i.test(body)), false);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of priceKeys) {
    if (saved[key] == null) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

console.log('seat price data: ok');
