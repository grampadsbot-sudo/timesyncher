import { readStoredCost } from './cost.mjs';

function storedModelId(turn) {
  const model = String(turn?.modelId || turn?.model?.responseModel || turn?.jev?.responseModel || '').trim();
  if (model) return model;
  if (turn?.role === 'app' && turn?.jev?.jevRan !== true && (turn.fixedOpener === true || turn.replyProducer === 'vacation-app-onboarding-opener')) return 'non-model greeting';
  return '';
}

function storedBackend(turn) {
  const value = String(turn?.replyBackend || turn?.backend || turn?.model?.backend || '').trim();
  if (value === 'openrouter' || value === 'vk_bot_mcp') return value;
  return '';
}

function storedJevScore(turn) {
  const raw = turn?.quality?.judged === true ? turn.quality.score : turn?.jevScoreDraft;
  const score = Number(raw);
  return Number.isFinite(score) ? score : null;
}

function generatedApp(turn) {
  return turn?.role === 'app' && turn?.fixedOpener !== true && turn?.jev?.jevRan === true;
}

export function confirmStoredTurns(transcript, pdfText, replyBackend) {
  const snapshot = JSON.stringify(transcript);
  const turns = Array.isArray(transcript?.turns) ? transcript.turns : [];
  const pdf = String(pdfText || '');
  const rows = [];
  const gaps = [];
  for (const turn of turns) {
    const generated = generatedApp(turn);
    const model = storedModelId(turn);
    const backend = storedBackend(turn);
    const score = storedJevScore(turn);
    const cost = generated ? readStoredCost(turn, replyBackend) : { state: 'not-run', amount: null, unit: '', gap: '' };
    const gap = [];
    if (generated && !model) gap.push('stored-model-missing');
    if (generated && model && pdf && !pdf.includes(model)) gap.push('dialog-pdf-model-not-shown');
    if (generated && !backend) gap.push('stored-backend-missing');
    if (generated && backend && pdf && !pdf.includes(backend)) gap.push('dialog-pdf-backend-not-shown');
    if (generated && score == null) gap.push('stored-jev-score-missing');
    if (generated && cost.gap) gap.push(cost.gap);
    rows.push({
      n: turn.turnIndex,
      role: turn.role,
      reply_backend: replyBackend,
      stored_model: model,
      stored_backend: backend,
      jev_score: score,
      wall_ms: null,
      ruled: generated,
      cost_state: cost.state,
      cost_amount: cost.amount,
      cost_unit: cost.unit,
      estimate_state: cost.estimate_state || '',
      estimate_amount: cost.estimate_amount ?? null,
      estimate_unit: cost.estimate_unit || '',
      estimate_label: cost.estimate_label || '',
      usd_state: cost.usd_state || '',
      usd_amount: cost.usd_amount ?? null,
      ...(turn.role === 'app' && turn.openrouterTotals ? { openrouterTotals: turn.openrouterTotals } : {}),
      gap: gap.join(','),
    });
    gaps.push(...gap);
  }
  if (JSON.stringify(transcript) !== snapshot) throw new Error('refused: transcript was patched');
  return { rows, gaps: [...new Set(gaps)] };
}
