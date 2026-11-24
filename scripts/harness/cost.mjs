export const VK_BOT_USAGE_DOLLARS_PER_PERCENT = 2;

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

export function readStoredCost(turn, backend) {
  const bags = bagsOf(turn);
  if (bags.some(bagUnmeasured)) {
    const unmeasured = { state: 'unmeasured', amount: null, unit: backend === 'openrouter' ? 'usd' : '', gap: '' };
    return backend === 'vk_bot_mcp' ? { ...unmeasured, ...unmeasuredEstimate() } : unmeasured;
  }
  if (backend === 'vk_bot_mcp') {
    for (const bag of bags) {
      const usage = mcpUsage(bag);
      if (!usage) continue;
      if (usage.mismatch) return { state: 'missing', amount: null, unit: '', gap: 'stored-cost-unit-mismatch', ...unmeasuredEstimate() };
      if (usage.unit === 'percent') {
        return { state: 'measured', amount: usage.amount, unit: 'percent', gap: '', ...percentEstimate(usage.amount) };
      }
      return { state: 'measured', amount: usage.amount, unit: usage.unit, gap: '', ...unmeasuredEstimate() };
    }
    for (const bag of bags) {
      const amount = dollars(bag);
      if (amount != null) return { state: 'measured', amount, unit: 'usd', gap: '', ...unmeasuredEstimate() };
    }
    return { state: 'missing', amount: null, unit: '', gap: 'stored-cost-missing', ...unmeasuredEstimate() };
  }
  for (const bag of bags) {
    const amount = dollars(bag);
    if (amount != null) return { state: 'measured', amount, unit: 'usd', gap: '' };
  }
  return { state: 'missing', amount: null, unit: '', gap: 'stored-cost-missing' };
}

export function rollupCost(rows) {
  const generated = (rows || []).filter((row) => row.role === 'app' && row.cost_state && row.cost_state !== 'not-run');
  const estimate = estimateRollup(generated);
  if (!generated.length) return { state: 'not-run', amount: null, unit: '', gap: '', per_customer: null, per_100: null, ...estimate };
  if (generated.some((row) => row.cost_state === 'missing' || String(row.gap || '').includes('stored-cost-missing') || String(row.gap || '').includes('stored-cost-unit-mismatch'))) {
    const gap = generated.some((row) => String(row.gap || '').includes('stored-cost-unit-mismatch')) ? 'stored-cost-unit-mismatch' : 'stored-cost-missing';
    return { state: 'missing', amount: null, unit: '', gap, per_customer: null, per_100: null, ...estimate };
  }
  const units = [...new Set(generated.map((row) => row.cost_unit).filter(Boolean))];
  if (units.length > 1) return { state: 'missing', amount: null, unit: '', gap: 'stored-cost-unit-mismatch', per_customer: null, per_100: null, ...estimate };
  if (generated.every((row) => row.cost_state === 'unmeasured')) {
    return { state: 'unmeasured', amount: null, unit: units[0] || 'usd', gap: '', per_customer: null, per_100: null, ...estimate };
  }
  if (generated.some((row) => row.cost_state === 'unmeasured')) {
    return { state: 'mixed', amount: null, unit: units[0] || '', gap: '', per_customer: null, per_100: null, ...estimate };
  }
  const amount = generated.reduce((sum, row) => sum + Number(row.cost_amount || 0), 0);
  return { state: 'measured', amount, unit: units[0] || '', gap: '', per_customer: amount, per_100: amount * 100, ...estimate };
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
