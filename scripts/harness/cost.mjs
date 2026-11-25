export const VK_BOT_USAGE_DOLLARS_PER_PERCENT = 2;

export const MODEL_TOKEN_RATES_USD_PER_M = Object.freeze([
  { match: /(?:^|\/)claude-haiku-5\.5/i, rates: { input: 0.10, output: 0.50, thinking: 0.50, cache_read: 0.01 } },
  { match: /(?:^|\/)claude-haiku/i, rates: { input: 0.80, output: 4.00, thinking: 4.00, cache_read: 0.08 } },
  { match: /(?:^|\/)claude-sonnet/i, rates: { input: 3.00, output: 15.00, thinking: 15.00, cache_read: 0.30 } },
  { match: /(?:^|\/)claude-opus/i, rates: { input: 15.00, output: 75.00, thinking: 75.00, cache_read: 1.50 } },
  { match: /(?:^|\/)claude(?:-|$)/i, rates: { input: 3.00, output: 15.00, thinking: 15.00, cache_read: 0.30 } },
  { match: /(?:^|\/)gemini-[^/]*flash/i, rates: { input: 0.30, output: 2.50, thinking: 2.50, cache_read: 0.075 } },
  { match: /(?:^|\/)gemini(?:-|$)/i, rates: { input: 1.25, output: 10.00, thinking: 10.00, cache_read: 0.3125 } },
  { match: /(?:^|\/)gpt-[^/]*mini/i, rates: { input: 0.25, output: 2.00, thinking: 2.00, cache_read: 0.025 } },
  { match: /(?:^|\/)gpt-5/i, rates: { input: 1.25, output: 10.00, thinking: 10.00, cache_read: 0.125 } },
  { match: /(?:^|\/)gpt-4/i, rates: { input: 2.50, output: 10.00, thinking: 10.00, cache_read: 0.25 } },
  { match: /(?:^|\/)gpt(?:-|$)/i, rates: { input: 1.25, output: 10.00, thinking: 10.00, cache_read: 0.125 } },
  { match: /(?:^|\/)composer(?:-|$)/i, rates: { input: 0.50, output: 2.50, thinking: 2.50, cache_read: 0.05 } },
]);

export function modelTokenRates(model) {
  const name = String(model || '').trim();
  if (!name) return null;
  const hit = MODEL_TOKEN_RATES_USD_PER_M.find((row) => row.match.test(name));
  return hit ? { ...hit.rates } : null;
}

function roundUsd(value) {
  return Math.round(Number(value) * 1e8) / 1e8;
}

export function tokenUsageToUsd(usage, model) {
  const name = String(model || '').trim();
  const bag = usage && typeof usage === 'object' ? usage : null;
  if (!bag) return { status: 'unpriced', dollars: null, model: name };
  const nested = storedCost(bag);
  const direct = firstNumber(bag.generationCost, bag.generation_cost, bag.costUsd, bag.cost_usd, bag.dollars, nested?.dollars, nested?.generationCost);
  if (direct != null) return { status: 'priced', dollars: roundUsd(direct), model: name, source: 'direct_usd' };
  const rates = modelTokenRates(name);
  if (!rates) return { status: 'unpriced', dollars: null, model: name };
  const src = nested && (nested.promptTokens != null || nested.input_tokens != null || nested.totalTokens != null || nested.total_tokens != null) ? nested : bag;
  const input = firstNumber(src.input_tokens, src.inputTokens, src.prompt_tokens, src.promptTokens);
  const output = firstNumber(src.output_tokens, src.outputTokens, src.completion_tokens, src.completionTokens);
  const thinking = firstNumber(src.thinking_tokens, src.thinkingTokens, src.reasoning_tokens, src.reasoningTokens) ?? 0;
  const cacheRead = firstNumber(src.cache_read_tokens, src.cacheReadTokens, src.cache_read_input_tokens, src.cached_tokens) ?? 0;
  const total = firstNumber(src.total_tokens, src.totalTokens, src.bot_tokens, src.botTokens, src.tokens);
  if (input == null && output == null && total == null) return { status: 'unpriced', dollars: null, model: name };
  if (input == null && output == null) {
    const blended = (rates.input + rates.output) / 2;
    return { status: 'priced', dollars: roundUsd((total * blended) / 1_000_000), model: name, source: 'rate_table_total' };
  }
  const inCount = Math.max(0, input ?? 0);
  const outCount = Math.max(0, output ?? 0);
  const thinkCount = Math.max(0, thinking);
  const cacheCount = Math.max(0, cacheRead);
  const thinkingIncludedInOutput = total != null && total === inCount + outCount && thinkCount > 0 && thinkCount <= outCount;
  const billableOutput = thinkingIncludedInOutput ? Math.max(0, outCount - thinkCount) : outCount;
  const cacheIncludedInInput = total != null && total === inCount + outCount && cacheCount > 0 && cacheCount <= inCount;
  const billableInput = cacheIncludedInInput ? Math.max(0, inCount - cacheCount) : inCount;
  const usd = (billableInput * rates.input + billableOutput * rates.output + thinkCount * rates.thinking + cacheCount * rates.cache_read) / 1_000_000;
  return { status: 'priced', dollars: roundUsd(usd), model: name, source: 'rate_table' };
}

export function sumUsageUsd(entries) {
  const rows = Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry === 'object') : [];
  if (!rows.length) return { status: 'not-run', dollars: null, currency: 'USD', unpricedModels: [] };
  let total = 0;
  const unpricedModels = [];
  for (const row of rows) {
    const usage = row.usage || row.cost || row;
    const model = row.model || row.modelId || row.responseModel || '';
    const priced = tokenUsageToUsd(usage, model);
    if (priced.status !== 'priced' || priced.dollars == null) {
      unpricedModels.push(String(model || 'unknown'));
    } else {
      total += priced.dollars;
    }
  }
  if (unpricedModels.length) {
    return { status: 'unpriced', dollars: null, currency: 'USD', unpricedModels: [...new Set(unpricedModels)] };
  }
  return { status: 'priced', dollars: roundUsd(total), currency: 'USD', unpricedModels: [] };
}

function firstNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    if (typeof value === 'string' && !/^-?\d+(\.\d+)?$/.test(value.trim())) continue;
    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }
  return null;
}

function isUnmeasured(value) {
  return String(value || '').trim().toLowerCase() === 'unmeasured';
}

function storedCost(bag) {
  return bag?.cost && typeof bag.cost === 'object' ? bag.cost : null;
}

function bagUnmeasured(bag) {
  if (!bag || typeof bag !== 'object') return false;
  return isUnmeasured(bag.cost)
    || isUnmeasured(storedCost(bag)?.status)
    || isUnmeasured(bag.generationCost)
    || isUnmeasured(bag.generation_cost)
    || isUnmeasured(bag.costState)
    || isUnmeasured(bag.cost_state)
    || isUnmeasured(bag.botUsage)
    || isUnmeasured(bag.usageState)
    || isUnmeasured(bag.usagePercentDelta)
    || isUnmeasured(bag.usage_percent_delta)
    || bag.costMeasured === false;
}

function dollars(bag) {
  const nested = storedCost(bag);
  const direct = firstNumber(bag.generationCost, bag.generation_cost, bag.costUsd, bag.cost_usd, bag.dollars, nested?.dollars, nested?.generationCost);
  if (direct != null) return direct;
  if (typeof bag.cost === 'number' && Number.isFinite(bag.cost)) return bag.cost;
  const tokens = firstNumber(bag.total_tokens, bag.totalTokens);
  const perToken = firstNumber(bag.listed_price_per_token, bag.usd_per_token);
  if (tokens != null && perToken != null) return tokens * perToken;
  const perMillion = firstNumber(bag.listed_price_per_million, bag.usd_per_million);
  if (tokens != null && perMillion != null) return (tokens * perMillion) / 1000000;
  return null;
}

function mcpUsage(bag) {
  const nested = storedCost(bag);
  const tokens = firstNumber(
    bag.bot_tokens,
    bag.botTokens,
    bag.total_tokens,
    bag.totalTokens,
    bag.tokens,
    nested?.bot_tokens,
    nested?.botTokens,
    nested?.total_tokens,
    nested?.totalTokens,
    nested?.tokens,
  );
  const percent = firstNumber(
    bag.usage_percent_delta,
    bag.usagePercentDelta,
    bag.percent_delta,
    nested?.usage_percent_delta,
    nested?.usagePercentDelta,
    nested?.percent_delta,
  );
  if (tokens != null && percent != null) return { mismatch: true };
  if (tokens != null) return { amount: tokens, unit: 'tokens' };
  if (percent != null) return { amount: percent, unit: 'percent' };
  return null;
}

function percentEstimate(amount) {
  return {
    estimate_state: 'estimate',
    estimate_amount: amount * VK_BOT_USAGE_DOLLARS_PER_PERCENT,
    estimate_unit: 'usd',
    estimate_label: 'estimate',
  };
}

function unmeasuredEstimate() {
  return {
    estimate_state: 'unmeasured',
    estimate_amount: null,
    estimate_unit: 'usd',
    estimate_label: 'estimate',
  };
}

function bagsOf(turn) {
  return [turn, turn?.usage, turn?.model, turn?.model?.usage].filter((bag) => bag && typeof bag === 'object');
}

function turnModelName(turn) {
  if (!turn || typeof turn !== 'object') return '';
  for (const candidate of [turn.modelId, turn.shippedModel, turn.stored_model, turn.responseModel, turn.model?.responseModel, turn.jev?.responseModel, typeof turn.model === 'string' ? turn.model : '']) {
    const name = String(candidate || '').trim();
    if (name) return name;
  }
  return '';
}

export function readStoredCost(turn, backend) {
  const bags = bagsOf(turn);
  if (bags.some(bagUnmeasured)) {
    const unmeasured = { state: 'unmeasured', amount: null, unit: backend === 'openrouter' ? 'usd' : '', gap: '' };
    return backend === 'vk_bot_mcp' ? { ...unmeasured, ...unmeasuredEstimate() } : unmeasured;
  }
  if (backend === 'vk_bot_mcp') {
    const modelName = turnModelName(turn);
    for (const bag of bags) {
      const usage = mcpUsage(bag);
      if (!usage) continue;
      if (usage.mismatch) return { state: 'missing', amount: null, unit: '', gap: 'stored-cost-unit-mismatch', ...unmeasuredEstimate() };
      if (usage.unit === 'percent') {
        return { state: 'measured', amount: usage.amount, unit: 'percent', gap: '', ...percentEstimate(usage.amount) };
      }
      const priced = tokenUsageToUsd(bag, modelName);
      if (priced.status === 'priced' && priced.dollars != null) {
        return {
          state: 'measured',
          amount: usage.amount,
          unit: usage.unit,
          gap: '',
          estimate_state: 'estimate',
          estimate_amount: priced.dollars,
          estimate_unit: 'usd',
          estimate_label: 'estimate',
          usd_state: 'priced',
          usd_amount: priced.dollars,
        };
      }
      return { state: 'measured', amount: usage.amount, unit: usage.unit, gap: '', ...unmeasuredEstimate(), usd_state: 'unpriced', usd_amount: null };
    }
    for (const bag of bags) {
      const amount = dollars(bag);
      if (amount != null) return { state: 'measured', amount, unit: 'usd', gap: '', ...unmeasuredEstimate(), usd_state: 'priced', usd_amount: amount };
    }
    return { state: 'missing', amount: null, unit: '', gap: 'stored-cost-missing', ...unmeasuredEstimate() };
  }
  for (const bag of bags) {
    const amount = dollars(bag);
    if (amount != null) return { state: 'measured', amount, unit: 'usd', gap: '' };
  }
  return { state: 'missing', amount: null, unit: '', gap: 'stored-cost-missing' };
}

function usdRollup(rows) {
  const withUsd = (rows || []).filter((row) => row.usd_state || row.cost_unit === 'usd');
  if (!withUsd.length) return {};
  if (withUsd.some((row) => row.usd_state === 'unpriced')) return { usd_state: 'unpriced', usd_amount: null };
  const priced = withUsd.filter((row) => (row.usd_state === 'priced' && Number.isFinite(Number(row.usd_amount)))
    || (row.cost_unit === 'usd' && row.cost_state === 'measured' && Number.isFinite(Number(row.cost_amount))));
  if (priced.length && priced.length === (rows || []).length) {
    const sum = priced.reduce((acc, row) => acc + Number(row.usd_state === 'priced' ? row.usd_amount : row.cost_amount), 0);
    return { usd_state: 'priced', usd_amount: roundUsd(sum) };
  }
  return { usd_state: 'unpriced', usd_amount: null };
}

export function rollupCost(rows) {
  const generated = (rows || []).filter((row) => row.role === 'app' && row.cost_state && row.cost_state !== 'not-run');
  const estimate = estimateRollup(generated);
  const usd = usdRollup(generated);
  if (!generated.length) return { state: 'not-run', amount: null, unit: '', gap: '', per_customer: null, per_100: null, ...estimate, ...usd };
  if (generated.some((row) => row.cost_state === 'missing' || String(row.gap || '').includes('stored-cost-missing') || String(row.gap || '').includes('stored-cost-unit-mismatch'))) {
    const gap = generated.some((row) => String(row.gap || '').includes('stored-cost-unit-mismatch')) ? 'stored-cost-unit-mismatch' : 'stored-cost-missing';
    return { state: 'missing', amount: null, unit: '', gap, per_customer: null, per_100: null, ...estimate, ...usd };
  }
  const units = [...new Set(generated.map((row) => row.cost_unit).filter(Boolean))];
  if (units.length > 1) return { state: 'missing', amount: null, unit: '', gap: 'stored-cost-unit-mismatch', per_customer: null, per_100: null, ...estimate, ...usd };
  if (generated.every((row) => row.cost_state === 'unmeasured')) {
    return { state: 'unmeasured', amount: null, unit: units[0] || 'usd', gap: '', per_customer: null, per_100: null, ...estimate, ...usd };
  }
  if (generated.some((row) => row.cost_state === 'unmeasured')) {
    return { state: 'mixed', amount: null, unit: units[0] || '', gap: '', per_customer: null, per_100: null, ...estimate, ...usd };
  }
  const amount = generated.reduce((sum, row) => sum + Number(row.cost_amount || 0), 0);
  return { state: 'measured', amount, unit: units[0] || '', gap: '', per_customer: amount, per_100: amount * 100, ...estimate, ...usd };
}

function estimateRollup(rows) {
  const generated = (rows || []).filter((row) => row.estimate_state);
  if (!generated.length) return {};
  const estimated = generated.filter((row) => row.estimate_state === 'estimate' && Number.isFinite(Number(row.estimate_amount)));
  if (estimated.length && estimated.length === generated.length) {
    const amount = estimated.reduce((sum, row) => sum + Number(row.estimate_amount), 0);
    return {
      estimate_state: 'estimate',
      estimate_amount: amount,
      estimate_unit: 'usd',
      estimate_label: 'estimate',
      estimate_per_customer: amount,
    };
  }
  return {
    estimate_state: 'unmeasured',
    estimate_amount: null,
    estimate_unit: 'usd',
    estimate_label: 'estimate',
    estimate_per_customer: null,
  };
}
