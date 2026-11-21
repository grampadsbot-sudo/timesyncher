const LABELS = ['openrouter', 'vk_bot_mcp'];
const REFUSALS = new Set(['backend-not-available', 'dialog-renderer-refused']);

export function percentile(values, p) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function usagePercentCells(cost) {
  if (cost.cost_unit !== 'percent' || !Number.isFinite(cost.cost_per_customer)) {
    return { usage_percent_per_customer: null, usage_percent_per_100: null };
  }
  return { usage_percent_per_customer: cost.cost_per_customer, usage_percent_per_100: cost.cost_per_100 };
}

function costCells(rows) {
  const base = costBase(rows);
  return { ...base, ...estimateCells(rows), ...usagePercentCells(base) };
}

function costBase(rows) {
  const missing = rows.filter((row) => row.cost?.state === 'missing' || row.cost?.gap);
  const unmeasured = rows.filter((row) => row.cost?.state === 'unmeasured' || row.cost?.state === 'mixed');
  const measured = rows.filter((row) => row.cost?.state === 'measured' && Number.isFinite(row.cost.amount));
  if (missing.length) {
    return {
      cost_per_customer: null,
      cost_per_100: null,
      cost_unit: '',
      cost_state: 'missing',
      cost_gap: missing[0].cost.gap || 'stored-cost-missing',
    };
  }
  if (!measured.length && unmeasured.length) {
    return { cost_per_customer: null, cost_per_100: null, cost_unit: unmeasured[0].cost.unit || '', cost_state: 'unmeasured', cost_gap: '' };
  }
  if (!measured.length) {
    return { cost_per_customer: null, cost_per_100: null, cost_unit: '', cost_state: 'not-run', cost_gap: '' };
  }
  const units = [...new Set(measured.map((row) => row.cost.unit).filter(Boolean))];
  if (units.length > 1 || unmeasured.length) {
    return { cost_per_customer: null, cost_per_100: null, cost_unit: units[0] || '', cost_state: unmeasured.length ? 'mixed' : 'missing', cost_gap: units.length > 1 ? 'stored-cost-unit-mismatch' : '' };
  }
  const perCustomer = mean(measured.map((row) => row.cost.amount));
  return { cost_per_customer: perCustomer, cost_per_100: perCustomer * 100, cost_unit: units[0] || '', cost_state: 'measured', cost_gap: '' };
}

function estimateCells(rows) {
  const bot = rows.some((row) => row.reply_backend === 'vk_bot_mcp');
  const estimated = rows.filter((row) => row.cost?.estimate_state === 'estimate' && Number.isFinite(Number(row.cost.estimate_per_customer ?? row.cost.estimate_amount)));
  const withheld = rows.filter((row) => row.cost && row.cost.estimate_state && row.cost.estimate_state !== 'estimate');
  if (!bot && !estimated.length) {
    return { estimated_dollars_per_customer: null, estimated_dollars_per_100: null, estimated_dollars_label: '', estimated_dollars_state: 'not-run' };
  }
  if (!estimated.length || withheld.length) {
    return { estimated_dollars_per_customer: null, estimated_dollars_per_100: null, estimated_dollars_label: 'estimate', estimated_dollars_state: 'unmeasured' };
  }
  const perCustomer = mean(estimated.map((row) => Number(row.cost.estimate_per_customer ?? row.cost.estimate_amount)));
  return {
    estimated_dollars_per_customer: perCustomer,
    estimated_dollars_per_100: perCustomer * 100,
    estimated_dollars_label: 'estimate',
    estimated_dollars_state: 'estimate',
  };
}

export function compareBackends(cards) {
  return LABELS.map((backend) => {
    const rows = cards.filter((card) => card.reply_backend === backend);
    const walls = [];
    const scores = [];
    let qualityGaps = 0;
    for (const card of rows) {
      for (const turn of card.turns || []) {
        if (Number.isFinite(turn.wall_ms)) walls.push(turn.wall_ms);
        if (turn.role !== 'app' || turn.cost_state === 'not-run') continue;
        if (turn.jev_score == null) qualityGaps += 1;
        else scores.push(turn.jev_score);
      }
    }
    const failures = rows.filter((card) => card.verdict === 'FAIL' && !REFUSALS.has(card.reason)).length;
    const refusals = rows.filter((card) => REFUSALS.has(card.reason)).length;
    const stories = rows.length;
    return {
      backend,
      stories,
      passes: rows.filter((card) => card.verdict === 'PASS').length,
      failures,
      refusals,
      failure_rate: stories ? failures / stories : null,
      refusal_rate: stories ? refusals / stories : null,
      quality_mean: mean(scores),
      quality_mean_role: 'comparison_only',
      dlr_comparison_mean: mean(scores),
      quality_gaps: qualityGaps,
      speed_p50: percentile(walls, 50),
      speed_p95: percentile(walls, 95),
      speed_samples: walls.length,
      ...costCells(rows),
    };
  });
}

function stripValue(value) {
  if (Array.isArray(value)) return value.map(stripValue);
  if (typeof value === 'string') {
    let next = value;
    for (const label of LABELS) next = next.split(label).join('');
    return next;
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'reply_backend' || key === 'stored_backend' || key === 'backend') continue;
    out[key] = stripValue(item);
  }
  return out;
}

export function blindExport(cards) {
  const samples = [];
  const map = [];
  cards.forEach((card, index) => {
    const blindId = `b${String(index + 1).padStart(3, '0')}`;
    map.push({ blind_id: blindId, story_id: card.story_id, reply_backend: card.reply_backend });
    const sample = stripValue(card);
    sample.blind_id = blindId;
    samples.push(sample);
  });
  return { sample: { wave_blind_sample: true, samples }, key: { wave_blind_key: true, map } };
}

function rate(value) {
  return value == null ? 'n/a' : `${Math.round(value * 1000) / 10}%`;
}

function num(value) {
  return value == null ? 'n/a' : String(Math.round(value * 1000) / 1000);
}

export function formatCostAmount(amount, unit, state, gap) {
  if (gap) return gap;
  if (state === 'unmeasured') return 'unmeasured';
  if (state === 'not-run') return 'not-run';
  if (state === 'mixed') return 'mixed';
  if (!Number.isFinite(amount)) return 'n/a';
  if (unit === 'usd') return `$${amount.toFixed(4)}`;
  if (unit === 'percent') return `${amount}%`;
  return `${amount} ${unit || 'usage'}`;
}

export function formatEstimateDollars(amount, state) {
  if (state === 'not-run') return 'n/a';
  if (state !== 'estimate' || !Number.isFinite(amount)) return 'unmeasured';
  return `$${amount.toFixed(4)} estimate`;
}

export function comparisonMarkdown(rows) {
  const header = '| backend | stories | passes | failures | failure rate | refusals | refusal rate | legacy DLR/jev comparison (non-primary) | speed p50 ms | speed p95 ms | cost / customer | cost / 100 | usage % / customer | usage % / 100 | estimated $ / customer | estimated $ / 100 |';
  const rule = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const body = rows.map((row) => `| ${row.backend} | ${row.stories} | ${row.passes} | ${row.failures} | ${rate(row.failure_rate)} | ${row.refusals} | ${rate(row.refusal_rate)} | ${num(row.quality_mean)} | ${num(row.speed_p50)} | ${num(row.speed_p95)} | ${formatCostAmount(row.cost_per_customer, row.cost_unit, row.cost_state, row.cost_gap)} | ${formatCostAmount(row.cost_per_100, row.cost_unit, row.cost_state, row.cost_gap)} | ${formatCostAmount(row.usage_percent_per_customer, 'percent', row.usage_percent_per_customer == null ? 'not-run' : 'measured', '')} | ${formatCostAmount(row.usage_percent_per_100, 'percent', row.usage_percent_per_100 == null ? 'not-run' : 'measured', '')} | ${formatEstimateDollars(row.estimated_dollars_per_customer, row.estimated_dollars_state)} | ${formatEstimateDollars(row.estimated_dollars_per_100, row.estimated_dollars_state)} |`);
  return [header, rule, ...body].join('\n');
}

export function storyMarkdown(cards) {
  const header = '| story | backend | verdict | reason | cost / customer | artifacts |';
  const rule = '| --- | --- | --- | --- | --- | --- |';
  const body = cards.map((card) => {
    const artifacts = (card.checks || []).filter((check) => check.artifact).map((check) => check.artifact).join('<br>');
    const raw = formatCostAmount(card.cost?.per_customer, card.cost?.unit, card.cost?.state, card.cost?.gap);
    const estimate = card.cost?.estimate_label ? ` (${formatEstimateDollars(card.cost.estimate_per_customer, card.cost.estimate_state)})` : '';
    const cost = `${raw}${estimate}`;
    return `| ${card.story_id} | ${card.reply_backend} | ${card.verdict} | ${card.reason || ''} | ${cost} | ${artifacts} |`;
  });
  return [header, rule, ...body].join('\n');
}
