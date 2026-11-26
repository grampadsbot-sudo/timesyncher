import assert from 'node:assert/strict';
import { queueVacationAppTurn } from '../routes/vacation-app-chat-queue.mjs';
import { liveTranscriptFromRows, liveTurnRecord } from '../src/vacation/live-app-turn.mjs';
import { replyActionClaimReason } from '../src/vacation/reply-action-claim.mjs';
import {
  openRouterListedPrices,
  openRouterReplyCost,
  resetOpenRouterListedPriceCache,
  sumTurnCost,
} from '../src/vacation/turn-cost.mjs';
import { callVkBotMcp, routeVkBotMcpReply, sessionReplyBackend } from '../src/vacation/vk-bot-mcp-reply.mjs';
import { OPENROUTER_CHAT_COMPLETIONS_URL } from './vacation-app-reply-rules.mjs';

const MCP = 'http://127.0.0.1:9/v1/mcp';
const env = {
  TIMESYNCHER_VK_BOT_MCP: '1',
  TIMESYNCHER_VK_INTAKE_MCP_URL: MCP,
  TIMESYNCHER_VK_INTAKE_MCP_TOKEN: 'test-token',
  TIMESYNCHER_VK_INTAKE_MODEL: 'vk-intake',
};

function rpc(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
    }),
    json: async () => payload,
  };
}

function callsOf(fetchImpl) {
  return fetchImpl.urls;
}

function scriptedFetch(handler) {
  const urls = [];
  const fetchImpl = async (url, options = {}) => {
    urls.push(String(url));
    const header = options.headers?.authorization || '';
    assert.equal(header.includes('test-token') || !header, true);
    assert.equal(JSON.stringify(options).includes('test-token') || !options.body, true);
    return handler(String(url), options);
  };
  fetchImpl.urls = urls;
  return fetchImpl;
}

const off = await routeVkBotMcpReply({
  customerTurn: 'Tuesday gardens',
  session: { replyBackend: 'vk_bot_mcp' },
  env: { TIMESYNCHER_VK_INTAKE_MCP_URL: MCP },
  fetchImpl: () => { throw new Error('fetch'); },
});
assert.equal(off, null);

const fetchReply = scriptedFetch(async (url, options) => {
  assert.equal(url.includes('openrouter'), false);
  if (options.method === 'GET') return { ok: false, status: 404, headers: { get: () => 'application/json' }, text: async () => '', json: async () => ({}) };
  const body = JSON.parse(options.body);
  assert.equal(body.method, 'tools/call');
  assert.equal(body.params.name, 'ask');
  assert.match(body.params.arguments.message, /Tuesday gardens/);
  return rpc({ status: 'done', sessionId: 'ses_test', reply: 'Tuesday works for the gardens.', model: 'vk-intake' });
});
const routed = await routeVkBotMcpReply({
  customerTurn: 'Tuesday gardens',
  session: { metadata: { replyBackend: 'vk_bot_mcp' } },
  priorTurns: [],
  tripTitle: 'Harbor week',
  env,
  fetchImpl: fetchReply,
});
assert.equal(routed.reply, 'Tuesday works for the gardens.');
assert.equal(routed.model.backend, 'vk_bot_mcp');
assert.equal(routed.model.responseModel, 'vk-intake');
assert.equal(routed.model.via, 'vk_bot_mcp');
assert.equal(routed.reason, null);
assert.equal(routed.model.cost.status, 'unmeasured');
assert.equal(routed.model.cost.dollars, null);
assert.equal(routed.model.cost.replyCount, 1);
assert.equal(Number.isFinite(routed.model.cost.wallMs), true);
assert.deepEqual(callsOf(fetchReply).filter((url) => url.includes('openrouter')), []);

const stored = liveTurnRecord({
  turnIndex: 2,
  role: 'app',
  modality: 'text',
  text: routed.reply,
  at: new Date().toISOString(),
  latencyMs: 800,
  sessionE2eMs: 900,
  jev: routed.jev,
  model: routed.model,
});
assert.equal(stored.backend, 'vk_bot_mcp');
assert.equal(stored.modelId, 'vk-intake');
assert.equal(stored.cost.status, 'unmeasured');
assert.equal(stored.model.backend, 'vk_bot_mcp');
assert.equal(stored.model.cost.replyCount, 1);
const reread = liveTranscriptFromRows({
  session: { token: 'session-a' },
  rows: [{ body: routed.reply, payload: { liveTranscript: stored } }],
});
assert.equal(reread.turns[0].backend, 'vk_bot_mcp');
assert.equal(reread.turns[0].cost.status, 'unmeasured');
assert.equal(reread.turns[0].modelId, 'vk-intake');

const turn110 = "Please add a family collaborator with edit access, and tell me what they can do on the trip once they're added. Please keep planning only.";
const inviteClaim = "I've added your family member as a collaborator with edit access.";
assert.equal(replyActionClaimReason(inviteClaim, {}), 'reply_action_claim_unbacked');

async function verifyTurn110(mcpEnabled) {
  const trip = { id: 'trip-110', title: 'Family vacation', destination: 'Orlando, FL' };
  const appTurns = [];
  const turnWrites = [];
  const collaboratorQueries = [];
  const queueDb = async (strings, ...values) => {
    const sql = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (/vacation_collaborator|collaborator_seat/i.test(sql)) collaboratorQueries.push(sql);
    if (sql.startsWith('select count(*)::int as n,')) return [{ n: 109 }];
    if (sql.startsWith('insert into vacation_requests')) return [{ id: 'request-110' }];
    if (sql.startsWith('insert into worker_jobs')) return [{ id: 'job-110' }];
    if (sql.startsWith('insert into transcript_turns')) {
      if (sql.includes("'outbound'")) {
        appTurns.push({ requestId: values[2], body: values[3], payload: values[4] });
        return [];
      }
      return [{ id: 'customer-turn-110' }];
    }
    if (sql.startsWith('update transcript_turns set payload =') && values[1] === 'customer-turn-110') {
      turnWrites.push(structuredClone(values[0]));
    }
    return [];
  };

  const queueEnv = {
    TIMESYNCHER_VK_BOT_MCP: mcpEnabled ? '1' : '0',
    TIMESYNCHER_VK_INTAKE_MCP_URL: MCP,
    TIMESYNCHER_VK_INTAKE_MCP_TOKEN: 'offline-test',
    TIMESYNCHER_JEV_CLASSIFY_URL: 'http://127.0.0.1:9/api/alpha/decisions',
    TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1200',
    TIMESYNCHER_JEV_CLASSIFY_TOKEN: 'offline-test',
    TIMESYNCHER_GBRAIN_HTTP_BASE: '',
    DATABASE_URL: '',
  };
  const priorEnv = Object.fromEntries(Object.keys(queueEnv).map((key) => [key, process.env[key]]));
  const priorFetch = globalThis.fetch;
  const unexpectedRequests = [];
  const judgedDrafts = [];
  let draftCalls = 0;
  let queued;
  try {
    Object.assign(process.env, queueEnv);
    globalThis.fetch = async (url, options) => {
      const request = JSON.parse(options?.body || '{}');
      if (String(url) === MCP) {
        draftCalls += 1;
        assert.equal(request.params.name, 'ask');
        assert.ok(request.params.arguments.message.includes(turn110));
        return rpc({ status: 'done', reply: inviteClaim, model: 'vk-intake' });
      }
      if (String(url) === OPENROUTER_CHAT_COMPLETIONS_URL && !mcpEnabled && draftCalls === 0) {
        draftCalls += 1;
        assert.ok(JSON.stringify(request.messages).includes(turn110));
        return Response.json({
          choices: [{ message: { content: inviteClaim } }],
          model: request.model,
          usage: { cost: 0.0001 },
        });
      }
      if (String(url) === queueEnv.TIMESYNCHER_JEV_CLASSIFY_URL && request.questions?.overall_quality) {
        judgedDrafts.push(request.state.draft);
        return Response.json({
          answers: {
            route_type: { choice: 'access_pricing' },
            overall_quality: { score: 4 },
            disposition: { choice: 'keep' },
          },
          usage: { cost: 0.0001 },
        });
      }
      unexpectedRequests.push(String(url));
      throw new Error('Unexpected request in offline turn 110 test');
    };
    queued = await queueVacationAppTurn(
      queueDb,
      { id: 'session-110', customer_id: 'customer-110', replyBackend: 'vk_bot_mcp' },
      trip,
      { text: turn110 },
      { recordCustomerThingNotes: async () => [] },
      { classification: { ok: true, intake: false, turnKind: 'other', things: [], roster: [], understanding: { intent: { asksAccess: true, asksPrice: false, pullsAccess: false, ask: false } } } },
    );
  } finally {
    globalThis.fetch = priorFetch;
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(draftCalls, 1, `${queued.status}: ${queued.error}`);
  assert.equal(judgedDrafts[0], inviteClaim);
  assert.equal(queued.ok, true, queued.error);
  assert.equal(queued.status, 'replied');
  assert.equal(queued.error, null);
  assert.equal(queued.turnIndex, 110);
  assert.deepEqual(queued.turnActionResults, {});
  assert.equal(replyActionClaimReason(queued.reply, queued.turnActionResults), '');
  assert.match(queued.reply, /name and email address/i);
  assert.match(queued.reply, /edit access.*update the itinerary/i);
  assert.equal(judgedDrafts[1], queued.reply);
  assert.equal(appTurns.length, 1);
  assert.equal(appTurns[0].requestId, 'request-110');
  assert.equal(appTurns[0].body, queued.reply);
  assert.equal(appTurns[0].payload.liveTranscript.backend, 'vk_bot_mcp');
  assert.equal(queued.jev.jevRan, !mcpEnabled);
  assert.ok(turnWrites.some((payload) => payload.liveTranscript?.text === turn110 && payload.turnActionResults));
  assert.ok(turnWrites.every((payload) => !payload.replyFailure));
  assert.deepEqual(collaboratorQueries, []);
  assert.deepEqual(unexpectedRequests, []);
}

await verifyTurn110(true);
await verifyTurn110(false);

const openRouterStored = liveTurnRecord({
  turnIndex: 3,
  role: 'app',
  modality: 'text',
  text: 'The garden is on Tuesday.',
  at: new Date().toISOString(),
  latencyMs: 500,
  sessionE2eMs: 700,
  jev: { jevRan: true, modelTier: 1, jevBeforeModel: true },
  model: {
    called: true,
    via: 'openrouter-chat',
    responseModel: 'anthropic/claude-haiku-5.5',
    modelTier: 1,
    genLatencyMs: 480,
    cost: { status: 'measured', dollars: 0.0012, currency: 'USD', source: 'openrouter_usage_cost', promptTokens: 10, completionTokens: 4, totalTokens: 14, usagePercentDelta: null, replyCount: null, wallMs: null },
  },
});
assert.equal(openRouterStored.backend, 'openrouter');
assert.equal(openRouterStored.modelId, 'anthropic/claude-haiku-5.5');
assert.equal(openRouterStored.cost.dollars, 0.0012);
assert.equal(openRouterStored.cost.source, 'openrouter_usage_cost');

const usageCost = await openRouterReplyCost({ usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, cost: 0.0012 } }, 'anthropic/claude-haiku-5.5', async () => { throw new Error('price'); });
assert.equal(usageCost.status, 'measured');
assert.equal(usageCost.dollars, 0.0012);
assert.equal(usageCost.source, 'openrouter_usage_cost');
assert.equal(usageCost.promptTokens, 10);

const listed = await openRouterReplyCost(
  { usage: { prompt_tokens: 1000, completion_tokens: 500 } },
  'anthropic/claude-haiku-5.5',
  async () => ({ prompt: 0.000001, completion: 0.000005 }),
);
assert.equal(listed.status, 'measured');
assert.equal(listed.source, 'openrouter_listed_price');
assert.equal(listed.dollars, 0.0035);

const missing = await openRouterReplyCost({ usage: { prompt_tokens: 3, completion_tokens: 2 } }, 'anthropic/claude-haiku-5.5', async () => null);
assert.equal(missing.status, 'unmeasured');
assert.equal(missing.dollars, null);
assert.equal(missing.totalTokens, 5);

const summed = sumTurnCost(usageCost, listed);
assert.equal(summed.status, 'measured');
assert.equal(summed.dollars, 0.0047);
assert.equal(summed.source, 'openrouter_listed_price');
assert.equal(summed.promptTokens, 1010);

resetOpenRouterListedPriceCache();
const catalog = scriptedFetch(async () => rpc({
  data: [{ id: 'anthropic/claude-haiku-5.5', pricing: { prompt: '0.000002', completion: '0.000008' } }],
}, 200));
const price = await openRouterListedPrices('anthropic/claude-haiku-5.5', 'http://127.0.0.1:9/api/v1/models', 'test-token', catalog);
assert.deepEqual(price, { prompt: 0.000002, completion: 0.000008 });
resetOpenRouterListedPriceCache();

const tokenBot = scriptedFetch(async (url, options) => {
  assert.equal(url.includes('openrouter'), false);
  const body = JSON.parse(options.body);
  assert.equal(body.params.name, 'ask');
  return rpc({
    status: 'done',
    sessionId: 'ses_usage',
    reply: 'The garden stays on Tuesday.',
    model: 'vk-intake',
    usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
  });
});
const withTokens = await callVkBotMcp({ message: 'Tuesday gardens', env, fetchImpl: tokenBot });
assert.equal(withTokens.called, true);
assert.equal(withTokens.cost.status, 'measured');
assert.equal(withTokens.cost.source, 'vk_bot_usage');
assert.equal(withTokens.cost.dollars, null);
assert.equal(withTokens.cost.totalTokens, 18);
assert.equal(withTokens.cost.replyCount, 1);
assert.equal(callsOf(tokenBot).length, 1);

const percentBot = scriptedFetch(async () => rpc({
  status: 'done',
  reply: 'Tuesday still works.',
  usagePercentDelta: 0.25,
}));
const withPercent = await callVkBotMcp({ message: 'Tuesday gardens', env, fetchImpl: percentBot });
assert.equal(withPercent.cost.status, 'measured');
assert.equal(withPercent.cost.usagePercentDelta, 0.25);
assert.equal(withPercent.cost.dollars, null);

const checked = scriptedFetch(async (url, options) => {
  if (options.method === 'GET') return { ok: false, status: 404, headers: { get: () => 'application/json' }, text: async () => '', json: async () => ({}) };
  const body = JSON.parse(options.body);
  if (body.params.name === 'ask') return rpc({ status: 'running', sessionId: 'ses_wait' });
  assert.equal(body.params.name, 'check');
  assert.equal(body.params.arguments.sessionId, 'ses_wait');
  return rpc({ status: 'done', sessionId: 'ses_wait', reply: 'Checked reply.', modelId: 'vk-intake' });
});
const afterCheck = await callVkBotMcp({ message: 'Tuesday gardens', env, fetchImpl: checked, timeoutMs: 5000 });
assert.equal(afterCheck.called, true);
assert.equal(afterCheck.text, 'Checked reply.');
assert.equal(afterCheck.vkBotSessionId, 'ses_wait');

const hung = scriptedFetch(async (url, options) => {
  assert.equal(String(url).includes('openrouter'), false);
  assert.equal(options.signal instanceof AbortSignal, true);
  const error = new Error('timeout');
  error.name = 'TimeoutError';
  throw error;
});
const timed = await callVkBotMcp({ message: 'Tuesday gardens', env, fetchImpl: hung, timeoutMs: 30 });
assert.equal(timed.called, false);
assert.equal(timed.reason, 'vk_bot_mcp_timeout');
assert.equal(timed.backend, 'vk_bot_mcp');
assert.deepEqual(callsOf(hung).filter((url) => url.includes('openrouter')), []);

const tripSelected = await routeVkBotMcpReply({
  customerTurn: 'Tuesday gardens',
  session: { trip_id: 'trip-local' },
  env,
  loadReplyBackend: async () => ({ metadata: { replyBackend: 'vk_bot_mcp' } }),
  fetchImpl: scriptedFetch(async (url, options) => {
    if (options.method === 'GET') return { ok: false, status: 404, headers: { get: () => 'application/json' }, text: async () => '', json: async () => ({}) };
    return rpc({ status: 'done', reply: 'From the trip flag.', model: 'vk-intake' });
  }),
});
assert.equal(tripSelected.reply, 'From the trip flag.');

const sessionWins = await routeVkBotMcpReply({
  customerTurn: 'Tuesday gardens',
  session: { replyBackend: 'openrouter', trip_id: 'trip-local' },
  env,
  loadReplyBackend: async () => { throw new Error('trip lookup'); },
  fetchImpl: () => { throw new Error('fetch'); },
});
assert.equal(sessionWins, null);
assert.equal(sessionReplyBackend({ replyBackend: 'openrouter' }), 'openrouter');

console.log('test_vk_bot_mcp_reply: ok');
