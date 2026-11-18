function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function whole(value) {
  const number = finite(value);
  if (number == null || number < 0) return null;
  return Math.round(number);
}

function dollars(value) {
  const number = finite(value);
  if (number == null || number < 0) return null;
  return Math.round(number * 1e8) / 1e8;
}

function tokenFields(promptTokens, completionTokens, totalTokens) {
  const prompt = whole(promptTokens);
  const completion = whole(completionTokens);
  const total = whole(totalTokens) ?? (prompt != null && completion != null ? prompt + completion : null);
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

function measuredTurnCost(source, amount, tokens = {}, extra = {}) {
  const counts = tokenFields(tokens.promptTokens, tokens.completionTokens, tokens.totalTokens);
  return {
    status: 'measured',
    dollars: dollars(amount),
    currency: dollars(amount) == null ? null : 'USD',
    source,
    ...counts,
    usagePercentDelta: finite(extra.usagePercentDelta),
    replyCount: whole(extra.replyCount),
    wallMs: whole(extra.wallMs),
  };
}

function unmeasuredTurnCost(tokens = {}, extra = {}) {
  const counts = tokenFields(tokens.promptTokens, tokens.completionTokens, tokens.totalTokens);
  return {
    status: 'unmeasured',
    dollars: null,
    currency: null,
    source: 'unmeasured',
    ...counts,
    usagePercentDelta: finite(extra.usagePercentDelta),
    replyCount: whole(extra.replyCount),
    wallMs: whole(extra.wallMs),
  };
}

export function sumTurnCost(...parts) {
  const rows = parts.flat().filter((row) => row && typeof row === 'object');
  if (!rows.length) return null;
  let prompt = 0;
  let completion = 0;
  let total = 0;
  let sawPrompt = false;
  let sawCompletion = false;
  let sawTotal = false;
  let amount = 0;
  let measured = true;
  let listed = false;
  let usage = false;
  for (const row of rows) {
    if (row.status !== 'measured' || dollars(row.dollars) == null) measured = false;
    else amount += row.dollars;
    if (row.source === 'openrouter_listed_price') listed = true;
    if (row.source === 'openrouter_usage_cost') usage = true;
    if (row.promptTokens != null) { prompt += row.promptTokens; sawPrompt = true; }
    if (row.completionTokens != null) { completion += row.completionTokens; sawCompletion = true; }
    if (row.totalTokens != null) { total += row.totalTokens; sawTotal = true; }
  }
  const tokens = {
    promptTokens: sawPrompt ? prompt : null,
    completionTokens: sawCompletion ? completion : null,
    totalTokens: sawTotal ? total : null,
  };
  if (!measured) return unmeasuredTurnCost(tokens);
  const source = listed ? 'openrouter_listed_price' : (usage ? 'openrouter_usage_cost' : rows[0].source);
  return measuredTurnCost(source, amount, tokens);
}

export function sumModelCost(previous, next) {
  if (!next || typeof next !== 'object') return previous || next;
  if (!previous || typeof previous !== 'object' || !previous.cost) return next;
  return { ...next, cost: sumTurnCost(previous.cost, next.cost) };
}

let listedPriceCache = null;
export function resetOpenRouterListedPriceCache() {
  listedPriceCache = null;
}
export async function openRouterListedPrices(modelId, modelsUrl, key, fetchImpl = fetch) {
  if (listedPriceCache) return listedPriceCache.get(modelId) || null;
  if (!key) return null;
  const response = await fetchImpl(modelsUrl, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!response?.ok) return null;
  const body = await response.json().catch(() => ({}));
  const map = new Map();
  for (const row of body.data || []) {
    const prompt = Number(row?.pricing?.prompt);
    const completion = Number(row?.pricing?.completion);
    if (row?.id && Number.isFinite(prompt) && Number.isFinite(completion)) map.set(row.id, { prompt, completion });
  }
  if (!map.size) return null;
  listedPriceCache = map;
  return map.get(modelId) || null;
}

export async function openRouterReplyCost(body, modelId, lookupPrice) {
  const usage = body?.usage && typeof body.usage === 'object' ? body.usage : {};
  const details = usage.cost_details && typeof usage.cost_details === 'object' ? usage.cost_details : {};
  const tokens = tokenFields(
    usage.prompt_tokens ?? usage.input_tokens,
    usage.completion_tokens ?? usage.output_tokens,
    usage.total_tokens,
  );
  const direct = dollars(usage.cost ?? details.upstream_inference_cost ?? body?.cost);
  if (direct != null) return measuredTurnCost('openrouter_usage_cost', direct, tokens);
  if (tokens.promptTokens == null || tokens.completionTokens == null) return unmeasuredTurnCost(tokens);
  const price = typeof lookupPrice === 'function' ? await lookupPrice(modelId) : null;
  const prompt = finite(price?.prompt);
  const completion = finite(price?.completion);
  if (prompt == null || completion == null) return unmeasuredTurnCost(tokens);
  const amount = dollars(tokens.promptTokens * prompt + tokens.completionTokens * completion);
  if (amount == null) return unmeasuredTurnCost(tokens);
  return measuredTurnCost('openrouter_listed_price', amount, tokens);
}

export function vkBotUsageCost(payload, wallMs) {
  const usage = payload?.usage && typeof payload.usage === 'object' ? payload.usage : {};
  const tokens = tokenFields(
    payload?.promptTokens ?? payload?.prompt_tokens ?? usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens,
    payload?.completionTokens ?? payload?.completion_tokens ?? usage.completionTokens ?? usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens,
    payload?.totalTokens ?? payload?.total_tokens ?? usage.totalTokens ?? usage.total_tokens,
  );
  const usagePercentDelta = finite(
    payload?.usagePercentDelta
    ?? payload?.usage_percent_delta
    ?? usage.usagePercentDelta
    ?? usage.usage_percent_delta
    ?? usage.percentDelta
    ?? payload?.usagePercent,
  );
  const extra = { usagePercentDelta, replyCount: 1, wallMs };
  if (tokens.promptTokens != null || tokens.completionTokens != null || tokens.totalTokens != null || usagePercentDelta != null) {
    return {
      ...measuredTurnCost('vk_bot_usage', null, tokens, extra),
      dollars: null,
      currency: null,
    };
  }
  return unmeasuredTurnCost(tokens, extra);
}

export function applyStoredTurnRoute(record, model) {
  if (!record || record.role !== 'app' || record.fixedOpener) return record;
  const backend = model?.backend
    || (model?.via === 'vk_bot_mcp' ? 'vk_bot_mcp' : (model?.via === 'openrouter-chat' ? 'openrouter' : null));
  const cost = model?.cost || model?.log?.cost || null;
  if (!backend && !cost) return record;
  record.backend = backend;
  record.cost = cost;
  if (record.model && typeof record.model === 'object') {
    record.model.backend = backend;
    record.model.cost = cost;
    if (model?.vkBotSessionId) record.model.vkBotSessionId = String(model.vkBotSessionId);
  }
  return record;
}
