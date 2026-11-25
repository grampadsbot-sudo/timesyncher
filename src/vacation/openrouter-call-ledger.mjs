import { AsyncLocalStorage } from 'node:async_hooks';
import { openRouterListedPrices, openRouterReplyCost } from './turn-cost.mjs';

const turnContext = new AsyncLocalStorage();
const MEASURED = 'openrouter_usage_cost';
const ESTIMATED = 'openrouter_listed_price';

function logCall(row, turn) {
  console.log(JSON.stringify({
    event: 'openrouter_call', ...row, tripId: turn?.tripId ?? null, requestId: turn?.requestId ?? null,
  }));
}

function flushCalls(turn) {
  for (const row of turn.calls.slice(turn.logged)) logCall(row, turn);
  turn.logged = turn.calls.length;
}

export function withOpenRouterLedger(work, tripId = null) {
  const turn = { calls: [], pending: new Set(), logged: 0, closed: false, tripId, requestId: null };
  return turnContext.run(turn, async () => {
    try {
      return await work();
    } finally {
      turn.closed = true;
      flushCalls(turn);
    }
  });
}

export function bindOpenRouterLedger({ tripId, requestId, openrouterCalls }) {
  const turn = turnContext.getStore();
  if (!turn) return;
  if (tripId != null) turn.tripId = tripId;
  if (requestId != null) turn.requestId = requestId;
  if (Array.isArray(openrouterCalls) && turn.calls.length === 0) {
    turn.calls.push(...openrouterCalls);
    turn.logged = turn.calls.length;
  }
  if (turn.requestId != null) flushCalls(turn);
}

function addCost(totals, row) {
  totals.calls += 1;
  if (row.costSource === MEASURED) totals.measuredUsd += row.costUsd;
  else if (row.costSource === ESTIMATED) totals.estimatedUsd += row.costUsd;
  else totals.unpricedCalls += 1;
}

function emptyTotals() {
  return { calls: 0, measuredUsd: 0, estimatedUsd: 0, unpricedCalls: 0 };
}

export function openRouterTurnTelemetry() {
  const turn = turnContext.getStore();
  if (!turn) return {};
  const openrouterCalls = [...turn.calls];
  const byPurpose = {};
  const openrouterTotals = { ...emptyTotals(), byPurpose };
  for (const row of openrouterCalls) {
    addCost(openrouterTotals, row);
    addCost(byPurpose[row.purpose] ??= emptyTotals(), row);
  }
  for (const totals of [openrouterTotals, ...Object.values(byPurpose)]) {
    totals.measuredUsd = Number(totals.measuredUsd.toFixed(8));
    totals.estimatedUsd = Number(totals.estimatedUsd.toFixed(8));
  }
  return { openrouterCalls, openrouterTotals };
}

export function pendingOpenRouterCalls() {
  const pending = turnContext.getStore()?.pending;
  if (!pending?.size) return null;
  return (async () => {
    while (pending.size) await Promise.allSettled(pending);
  })();
}

function modelId(value, key) {
  if (typeof value !== 'string' || (key && value.includes(key))) return null;
  return /^[a-z\d][a-z\d._-]{0,79}\/[a-z\d][a-z\d._:-]{0,149}$/i.test(value) ? value : null;
}

function tokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function usageNumber(value) {
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

async function readJson(response) {
  if (typeof response?.json !== 'function') return { body: {}, unreadable: true };
  try {
    return { body: await response.json() };
  } catch (error) {
    return { body: {}, unreadable: true };
  }
}

export function fetchOpenRouterJson(url, options) {
  const pending = turnContext.getStore()?.pending;
  if (!pending || options.observe === false) return performOpenRouterCall(url, options);
  const result = performOpenRouterCall(url, options)
    .finally(() => pending.delete(result));
  pending.add(result);
  return result;
}

async function performOpenRouterCall(url, {
  purpose, endpoint = 'chat', payload, key, fetchImpl = fetch, readBody = readJson, replyCost = false, observe = true, ...init
}) {
  const requestBody = endpoint === 'chat' ? { ...payload, usage: { include: true } } : payload;
  let response;
  let parsed;
  let cost;
  const started = performance.now();
  try {
    response = await fetchImpl(url, { ...init, body: JSON.stringify(requestBody) });
    parsed = await readBody(response);
  } finally {
    if (observe) {
      const body = parsed?.body;
      const usage = body?.usage;
      const model = modelId(body?.model, key) || modelId(payload?.model, key);
      const latencyMs = Math.round(performance.now() - started);
      const lookups = new Map();
      const price = (id) => {
        if (!id) return null;
        if (!lookups.has(id)) lookups.set(id, openRouterListedPrices(id, new URL('/api/v1/models', url).href, key, fetchImpl).catch(() => null));
        return lookups.get(id);
      };
      const priced = await openRouterReplyCost({ usage: {
        cost: usageNumber(usage?.cost),
        prompt_tokens: usageNumber(usage?.prompt_tokens ?? usage?.input_tokens),
        completion_tokens: usageNumber(usage?.completion_tokens ?? usage?.output_tokens),
      } }, model, price);
      const row = {
        purpose, endpoint, model,
        promptTokens: priced.promptTokens,
        completionTokens: priced.completionTokens,
        cachedTokens: tokenCount(usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens),
        reasoningTokens: tokenCount(usage?.completion_tokens_details?.reasoning_tokens ?? usage?.output_tokens_details?.reasoning_tokens),
        costUsd: priced.dollars,
        costSource: priced.source === 'unmeasured' ? 'unpriced' : priced.source,
        latencyMs,
        ok: response?.ok === true && !parsed?.unreadable && !!body && typeof body === 'object' && body.ok !== false && !body.error,
        httpStatus: tokenCount(response?.status),
      };
      const turn = turnContext.getStore();
      if (turn) {
        turn.calls.push(row);
        if (turn.requestId != null || turn.closed) flushCalls(turn);
      } else {
        logCall(row, null);
      }
      if (replyCost && parsed) cost = await openRouterReplyCost(body, payload?.model, price);
    }
  }
  return { ...parsed, response, cost };
}
