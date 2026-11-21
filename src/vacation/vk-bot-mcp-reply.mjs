import { vkBotUsageCost } from './turn-cost.mjs';

const VK_BOT_MCP_TIMEOUT_MS = 25000;
const VK_BOT_MCP_MODEL = 'vk-intake';

function text(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function vkBotMcpFlagEnabled(env = process.env) {
  const flag = text(env?.TIMESYNCHER_VK_BOT_MCP, 20).toLowerCase();
  return flag === '1' || flag === 'true';
}

function namedBackend(value) {
  const name = text(value, 40).toLowerCase();
  if (name === 'vk_bot_mcp') return 'vk_bot_mcp';
  if (name === 'openrouter' || name === 'openrouter-chat') return 'openrouter';
  return '';
}

export function sessionReplyBackend(session) {
  const meta = session?.metadata && typeof session.metadata === 'object' ? session.metadata : {};
  return namedBackend(session?.replyBackend) || namedBackend(meta.replyBackend);
}

function tripReplyBackend(trip) {
  const meta = trip?.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  return namedBackend(trip?.replyBackend) || namedBackend(meta.replyBackend);
}

function timeoutMs(env) {
  const parsed = Number(env?.TIMESYNCHER_VK_BOT_MCP_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 1000 && parsed <= 60000) return parsed;
  return VK_BOT_MCP_TIMEOUT_MS;
}

function priorBotSession(priorTurns) {
  const turns = Array.isArray(priorTurns) ? priorTurns : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const id = text(turn?.vkBotSessionId || turn?.model?.vkBotSessionId, 120);
    if (id) return id;
  }
  return '';
}

function customerMessage(customerTurn, priorTurns, tripTitle) {
  const recent = (Array.isArray(priorTurns) ? priorTurns : []).slice(-6).map((turn) => {
    const role = turn?.role === 'app' ? 'app' : 'customer';
    const line = text(turn?.text, 500);
    return line ? `${role}: ${line}` : '';
  }).filter(Boolean);
  const title = text(tripTitle, 180);
  return [
    title ? `Vacation: ${title}` : '',
    recent.length ? `Recent conversation:\n${recent.join('\n')}` : '',
    `Customer message:\n${text(customerTurn, 4000)}`,
  ].filter(Boolean).join('\n\n');
}

function mcpMessages(raw, contentType) {
  if (!/event-stream/i.test(String(contentType || ''))) {
    try {
      return [JSON.parse(raw)];
    } catch (error) {
      return [{ error: { code: 'parse', name: error?.name || 'parse' } }];
    }
  }
  const out = [];
  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      out.push(JSON.parse(data));
    } catch (error) {
      out.push({ error: { code: 'parse', name: error?.name || 'parse' } });
    }
  }
  return out;
}

function payloadFromResult(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const content = Array.isArray(result?.content) ? result.content : [];
  const joined = content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim();
  if (!joined) return { status: result?.isError ? 'error' : 'done', reply: '' };
  try {
    const parsed = JSON.parse(joined);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (error) {
    return { status: 'done', reply: joined, parseError: error?.name || 'parse' };
  }
  return { status: 'done', reply: joined };
}

async function mcpToolsCall(url, token, name, args, signal, fetchImpl) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: String(Date.now()), method: 'tools/call', params: { name, arguments: args } }),
    signal,
  });
  const raw = await response.text();
  const messages = mcpMessages(raw, response.headers?.get?.('content-type'));
  const message = messages.find((item) => item && (item.result || item.error)) || messages[0] || {};
  if (!response.ok || message.error) return { ok: false, reason: response.ok ? 'vk_bot_mcp_error' : `vk_bot_mcp_http_${response.status}` };
  return { ok: true, payload: payloadFromResult(message.result) };
}

function costUrl(mcpUrl, sessionId) {
  const url = new URL(mcpUrl);
  url.pathname = url.pathname.replace(/\/mcp\/?$/, `/session/${encodeURIComponent(sessionId)}/cost`);
  url.search = '';
  return url.toString();
}

async function readBotUsage(mcpUrl, token, sessionId, signal, fetchImpl) {
  if (!sessionId) return null;
  try {
    const headers = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(costUrl(mcpUrl, sessionId), { method: 'GET', headers, signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return error ? null : null;
  }
}

function modelIdFrom(payload, env) {
  return text(payload?.model || payload?.modelId || env?.TIMESYNCHER_VK_INTAKE_MODEL || VK_BOT_MCP_MODEL, 120) || VK_BOT_MCP_MODEL;
}

export async function callVkBotMcp({ message, sessionId = '', env = process.env, fetchImpl = fetch, timeoutMs: budgetMs = 0 } = {}) {
  const started = Date.now();
  const url = text(env?.TIMESYNCHER_VK_INTAKE_MCP_URL, 500);
  const token = text(env?.TIMESYNCHER_VK_INTAKE_MCP_TOKEN, 500);
  const budget = budgetMs > 0 ? budgetMs : timeoutMs(env);
  const deadline = started + budget;
  const fail = (reason, modelId = VK_BOT_MCP_MODEL) => ({
    called: false,
    via: 'vk_bot_mcp',
    backend: 'vk_bot_mcp',
    responseModel: modelId,
    reason,
    genLatencyMs: Math.max(0, Date.now() - started),
    cost: vkBotUsageCost({}, Math.max(0, Date.now() - started)),
  });
  if (!url) return fail('vk_bot_mcp_unconfigured', null);
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch (error) {
    return fail(error ? 'vk_bot_mcp_unconfigured' : 'vk_bot_mcp_unconfigured', null);
  }
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== '127.0.0.1' && endpoint.hostname !== 'localhost') {
    return fail('vk_bot_mcp_unconfigured', null);
  }
  const remaining = () => deadline - Date.now();
  const signal = () => AbortSignal.timeout(Math.max(1, remaining()));
  try {
    if (remaining() <= 0) return fail('vk_bot_mcp_timeout');
    const ask = await mcpToolsCall(url, token, 'ask', { message, sessionId: sessionId || undefined }, signal(), fetchImpl);
    if (!ask.ok) return fail(ask.reason);
    let payload = ask.payload || {};
    const session = text(payload.sessionId, 120);
    const running = text(payload.status, 40).toLowerCase() === 'running' || (!text(payload.reply || payload.text, 20) && session);
    if (running && session && remaining() > 500) {
      const waitSeconds = Math.max(1, Math.min(20, Math.floor(remaining() / 1000)));
      const check = await mcpToolsCall(url, token, 'check', { sessionId: session, waitSeconds }, signal(), fetchImpl);
      if (!check.ok) return fail(check.reason, modelIdFrom(payload, env));
      payload = { ...payload, ...(check.payload || {}) };
    }
    const reply = text(payload.reply || payload.text, 3500);
    const modelId = modelIdFrom(payload, env);
    if (!reply || text(payload.status, 40).toLowerCase() === 'running') return fail(remaining() <= 0 ? 'vk_bot_mcp_timeout' : 'vk_bot_mcp_empty', modelId);
    let usagePayload = payload;
    const exposed = vkBotUsageCost(payload, 0);
    if (exposed.status !== 'measured' && session && remaining() > 300) {
      const costBody = await readBotUsage(url, token, session, signal(), fetchImpl);
      if (costBody && typeof costBody === 'object') {
        const usageFields = { ...costBody };
        delete usageFields.reply;
        delete usageFields.text;
        delete usageFields.message;
        usagePayload = { ...payload, ...usageFields, usage: { ...(payload.usage || {}), ...(costBody.usage || {}) } };
      }
    }
    const wall = Math.max(0, Date.now() - started);
    return {
      called: true,
      via: 'vk_bot_mcp',
      backend: 'vk_bot_mcp',
      responseModel: modelId,
      text: reply,
      vkBotSessionId: text(payload.sessionId, 120) || session || null,
      genLatencyMs: wall,
      cost: vkBotUsageCost(usagePayload, wall),
    };
  } catch (error) {
    const name = String(error?.name || '');
    return fail(name === 'TimeoutError' || name === 'AbortError' ? 'vk_bot_mcp_timeout' : 'vk_bot_mcp_error');
  }
}

function botResult(model) {
  const wall = Number(model?.genLatencyMs) || 0;
  return {
    reply: model?.called ? model.text : null,
    rules: { ok: true, via: 'vk_bot_mcp', slug: null, content_hash: null },
    jev: { jevRan: false, reason: 'vk_bot_mcp', jevBeforeModel: false, jevLatencyMs: null },
    model: {
      ...model,
      log: {
        draftModel: model?.responseModel || null,
        shippedModel: model?.called ? model.responseModel : null,
        rawModelText: model?.text || null,
        latencyMs: { draft: wall, rewrite: null, jevDraft: null, jevRewrite: null, total: wall },
        flagged: false,
        held: false,
        cost: model?.cost || null,
      },
    },
    reason: model?.called ? null : (model?.reason || 'vk_bot_mcp_error'),
  };
}

async function selectedTripBackend(session, env, loadReplyBackend) {
  if (typeof loadReplyBackend === 'function') {
    const saved = await loadReplyBackend(session, env);
    return typeof saved === 'string' ? namedBackend(saved) : tripReplyBackend(saved);
  }
  const tripId = session?.trip_id || session?.tripId;
  if (!tripId) return '';
  const { loadTripReplyBackend } = await import('./live-app-saved-trip-record.mjs');
  return namedBackend(await loadTripReplyBackend(session, env));
}

export async function routeVkBotMcpReply({
  customerTurn = '',
  session = null,
  priorTurns = [],
  tripTitle = '',
  env = process.env,
  loadReplyBackend = null,
  fetchImpl = fetch,
} = {}) {
  if (!vkBotMcpFlagEnabled(env)) return null;
  const fromSession = sessionReplyBackend(session);
  if (fromSession === 'openrouter') return null;
  const selected = fromSession === 'vk_bot_mcp' || await selectedTripBackend(session, env, loadReplyBackend) === 'vk_bot_mcp';
  if (!selected) return null;
  const model = await callVkBotMcp({
    message: customerMessage(customerTurn, priorTurns, tripTitle),
    sessionId: priorBotSession(priorTurns),
    env,
    fetchImpl,
  });
  return botResult(model);
}
