const REQUIRED_CHECK_IDS = [
  'dialog-pdf',
  'keepsake-pdf',
  'screens',
  'onboarding-screens-in-pdf',
  'video-check',
  'scorecard',
  'build-sha',
  'no-stub-chrome',
  'dialog-renderer-ok',
  'video-check-pass',
  'cleanup',
];

const RANK = [
  'payment-required',
  'credit-exhausted',
  'backend-not-available',
  'stored-model-missing',
  'stored-backend-missing',
  'dialog-pdf-model-not-shown',
  'dialog-pdf-backend-not-shown',
  'stored-jev-score-missing',
  'stored-cost-missing',
  'stored-cost-unit-mismatch',
  'no-thing-after-chat',
  'dialog-renderer-refused',
  'first-intake-reply-flagged',
];

const WAVE_STOP = new Set(['payment-required', 'credit-exhausted', 'backend-not-available']);

export function buildScorecard(input) {
  const checks = [];
  const provided = new Map((input.checks || []).map((check) => [check.id, check]));
  for (const id of REQUIRED_CHECK_IDS) {
    const row = provided.get(id);
    if (!row || row.error) {
      checks.push({ id, pass: false, detail: row?.error ? String(row.error) : 'missing', artifact: row?.artifact || '' });
    } else {
      checks.push({ id, pass: row.pass === true, detail: String(row.detail || ''), artifact: String(row.artifact || '') });
    }
  }
  for (const [id, row] of provided) {
    if (REQUIRED_CHECK_IDS.includes(id)) continue;
    checks.push({
      id,
      pass: row.pass === true && !row.error,
      detail: row.error ? String(row.error) : String(row.detail || ''),
      artifact: String(row.artifact || ''),
    });
  }
  const gaps = input.gaps || [];
  let reason = '';
  for (const id of RANK) {
    if (input.reason === id || gaps.includes(id)) {
      reason = id;
      break;
    }
  }
  if (!reason) reason = String(input.reason || '');
  const failed = checks.some((check) => check.pass !== true) || gaps.length > 0;
  if (!reason && failed) {
    const first = checks.find((check) => !check.pass);
    reason = first?.detail || first?.id || 'fail';
  }
  const verdict = failed ? 'FAIL' : 'PASS';
  return {
    run_id: input.run_id,
    story_id: input.story_id,
    reply_backend: input.reply_backend,
    build_sha: input.build_sha || '',
    live_sha_start: input.live_sha_start || '',
    live_sha_end: input.live_sha_end || '',
    started_at: input.started_at,
    ended_at: input.ended_at,
    checks,
    steps_present: input.steps_present || [],
    turns: input.turns || [],
    cost: input.cost || { state: 'not-run', amount: null, unit: '', gap: '', per_customer: null },
    cleanup: input.cleanup || { deleted: {}, remaining: null },
    session_ref: input.session_ref || '',
    ...(Object.prototype.hasOwnProperty.call(input, 'turn_http') ? { turn_http: input.turn_http } : {}),
    ...(input.ssr ? { primary_rating_method: 'ssr', ssr: input.ssr } : {}),
    ...(input.dlr_comparison ? { dlr_comparison: input.dlr_comparison } : {}),
    ...(input.dialog_pdf_status ? { dialog_pdf_status: input.dialog_pdf_status } : {}),
    ...(input.planning_fallbacks ? { planning_fallbacks: input.planning_fallbacks } : {}),
    ...(input.rescued_timeouts ? { rescued_timeouts: input.rescued_timeouts } : {}),
    reason: verdict === 'PASS' ? '' : reason,
    wave_stop: verdict === 'FAIL' && WAVE_STOP.has(reason),
    verdict,
  };
}
