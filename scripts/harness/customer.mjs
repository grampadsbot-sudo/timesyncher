import fs from 'node:fs';
import path from 'node:path';
import { rollupCost } from './cost.mjs';
import { assertThrowaway, cleanupCommand, harnessTag } from './protected.mjs';
import { redactText } from './redact.mjs';
import { buildScorecard } from './scorecard.mjs';
import { confirmStoredTurns } from './stored-turn.mjs';
import { noteUnstoredRows } from './unstored-turn.mjs';
import { extractLegacyDlrComparison } from '../customer_suite/ssr/aggregate.mjs';
import { recordDialogPdfStatus } from '../customer_suite/ssr/dialog-hook.mjs';
import { createHarnessSsrHook } from '../customer_suite/ssr/hooks.mjs';

function mergeWall(rows, timings) {
  const byN = new Map((timings || []).map((row) => [row.n, row.wall_ms]));
  let ruled = 0;
  return rows.map((row) => {
    if (!row.ruled) return row;
    ruled += 1;
    return byN.has(ruled) ? { ...row, wall_ms: byN.get(ruled) } : row;
  });
}

function artifactChecks(played) {
  const sameSha = Boolean(played.liveShaStart) && played.liveShaStart === played.liveShaEnd;
  return [
    { id: 'dialog-pdf', pass: played.dialogOk === true, detail: played.dialogDetail || '', artifact: 'dialog.pdf' },
    { id: 'keepsake-pdf', pass: played.keepsakeOk === true, detail: played.keepsakeDetail || '', artifact: 'keepsake.pdf' },
    { id: 'screens', pass: played.screensOk === true, detail: played.screensDetail || '', artifact: 'screens/' },
    { id: 'onboarding-screens-in-pdf', pass: played.onboardingPdfOk === true, detail: played.onboardingPdfDetail || 'missing', artifact: 'customer.pdf' },
    { id: 'video-check', pass: played.videoExists === true && !String(played.videoDetail || '').startsWith('video-missing'), detail: played.videoDetail || '', artifact: 'video-check.json' },
    { id: 'video-check-pass', pass: played.videoPass === true, detail: played.videoDetail || '', artifact: 'video-check.json' },
    { id: 'dialog-renderer-ok', pass: played.dialogOk === true, detail: played.dialogDetail || '', artifact: 'dialog.pdf' },
    { id: 'no-stub-chrome', pass: played.chromeOk === true, detail: played.chromeOk === true ? (played.chromeDetail || 'clean') : (played.chromeDetail || 'not-clean'), artifact: 'screens/' },
    { id: 'build-sha', pass: sameSha, detail: sameSha ? 'same' : 'build sha changed or missing', artifact: '' },
  ];
}

function blankTurn(index, replyBackend) {
  return {
    n: index,
    role: 'customer',
    reply_backend: replyBackend,
    stored_model: '',
    stored_backend: '',
    jev_score: null,
    wall_ms: null,
    cost_state: 'not-run',
    cost_amount: null,
    cost_unit: '',
    estimate_state: '',
    estimate_amount: null,
    estimate_unit: '',
    estimate_label: '',
    gap: '',
  };
}

export async function runCustomer(story, options) {
  const replyBackend = story.reply_backend;
  if (replyBackend !== 'openrouter' && replyBackend !== 'vk_bot_mcp') throw new Error('refused: reply_backend is missing');
  assertThrowaway({ name: story.customer?.name, displayName: story.customer?.name, email: story.customer?.email_alias });
  const tag = harnessTag(options.runId, story.story_id);
  options.tag = tag;
  fs.mkdirSync(options.outDir, { recursive: true });
  fs.mkdirSync(path.join(options.outDir, 'mail'), { recursive: true });
  const started = new Date().toISOString();
  const secrets = options.secrets || [];
  let reason = '';
  let gaps = [];
  let turns = [];
  let checks = [];
  let played = null;
  let steps = [];
  try {
    if (replyBackend === 'vk_bot_mcp') {
      reason = 'backend-not-available';
      turns = (story.turns || []).map((turn, index) => blankTurn(index + 1, replyBackend));
      checks = [
        { id: 'backend-available', pass: false, detail: 'backend not available', artifact: '' },
        { id: 'build-sha', pass: false, detail: 'not-run', artifact: '' },
        { id: 'stored-cost', pass: true, detail: 'not-run', artifact: '' },
      ];
    } else {
      played = await options.play(story, options);
      reason = played.reason || '';
      const snapshot = JSON.stringify(played.transcript || null);
      const confirmed = played.transcript ? confirmStoredTurns(played.transcript, played.pdfText || '', replyBackend) : { rows: [], gaps: [] };
      if (JSON.stringify(played.transcript || null) !== snapshot) throw new Error('refused: transcript was patched');
      turns = noteUnstoredRows(mergeWall(confirmed.rows, played.timings), played);
      gaps = [...confirmed.gaps];
      steps = played.steps || [];
      if (played.dialogRefused) gaps = [...new Set([...gaps, 'dialog-renderer-refused'])];
      if (played.dialogRefused && !reason) reason = 'dialog-renderer-refused';
      checks = artifactChecks(played);
      if (reason === 'payment-required' || reason === 'credit-exhausted') {
        checks.push({ id: 'app-billing', pass: false, detail: reason, artifact: '' });
      }
    }
  } catch (error) {
    reason = reason || 'harness-error';
    checks.push({ id: 'harness-error', pass: false, detail: redactText(error?.message || error, secrets), artifact: '' });
  }
  const billed = reason === 'payment-required' || reason === 'credit-exhausted';
  const cost = replyBackend === 'vk_bot_mcp' || billed
    ? { state: 'not-run', amount: null, unit: '', gap: '', per_customer: null }
    : rollupCost(turns);
  if (cost.gap) gaps = [...new Set([...gaps, cost.gap])];
  if (replyBackend === 'openrouter' && !billed) {
    const stored = !cost.gap && (cost.state === 'measured' || cost.state === 'unmeasured' || cost.state === 'mixed' || cost.state === 'not-run');
    checks.push({ id: 'stored-cost', pass: stored, detail: cost.gap || cost.state, artifact: '' });
  }
  const preview = buildScorecard({
    run_id: options.runId,
    story_id: story.story_id,
    reply_backend: replyBackend,
    checks: [...checks, { id: 'cleanup', pass: true, detail: 'pending', artifact: '' }, { id: 'scorecard', pass: true, detail: 'pending', artifact: 'scorecard.json' }],
    gaps,
    reason,
    turns,
    cost,
    steps_present: steps,
    started_at: started,
    ended_at: started,
    live_sha_start: played?.liveShaStart || '',
    live_sha_end: played?.liveShaEnd || '',
    build_sha: options.buildSha || '',
    cleanup: { deleted: {}, remaining: 0 },
  });
  const keep = options.keep === true && preview.verdict === 'FAIL';
  let cleanup = { deleted: {}, remaining: 0, kept: false };
  if (keep) cleanup = { deleted: {}, remaining: null, kept: true, command: cleanupCommand(options.runId, story.story_id) };
  else if (options.cleanup) {
    try {
      cleanup = await options.cleanup(tag);
    } catch (error) {
      cleanup = { deleted: {}, remaining: null, error: redactText(error?.message || error, secrets) };
    }
  }
  checks.push({
    id: 'cleanup',
    pass: cleanup.kept !== true && cleanup.remaining === 0 && !cleanup.error,
    detail: cleanup.error || (cleanup.kept ? cleanup.command : `remaining ${cleanup.remaining}`),
    artifact: '',
  });
  checks.push({ id: 'scorecard', pass: true, detail: 'written', artifact: 'scorecard.json' });
  let ssr = null;
  let dialogPdfStatus = null;
  const ssrHook = options.ssrHook
    || (options.ssrReactions || played?.ssrReactions || story?.ssr_reactions
      ? createHarnessSsrHook({
          reactionsByStory: options.ssrReactions ? { [story.story_id]: options.ssrReactions } : null,
        })
      : null);
  if (ssrHook) {
    ssr = await ssrHook.scoreCustomer({ story, played, outDir: options.outDir });
    dialogPdfStatus = ssrHook.dialogPdfStatus({
      generated: played?.dialogOk === true,
      pdfPath: played?.dialogOk === true ? path.join(options.outDir, 'dialog.pdf') : '',
      ssrAggregate: ssr,
    });
  } else if (played?.dialogPdfStatus) {
    dialogPdfStatus = played.dialogPdfStatus;
  } else if (options.skipDialogPdf) {
    dialogPdfStatus = recordDialogPdfStatus({
      generated: false,
      skipReason: options.skipDialogReason || 'dialog-pdf-skipped',
      ssrAggregate: ssr,
    });
  }
  const dlrComparison = ssr
    ? extractLegacyDlrComparison([{ story_id: story.story_id, turns, dlr_score: story.dlr_score ?? played?.dlrScore }])
    : null;
  const card = buildScorecard({
    run_id: options.runId,
    story_id: story.story_id,
    reply_backend: replyBackend,
    build_sha: options.buildSha || '',
    live_sha_start: played?.liveShaStart || '',
    live_sha_end: played?.liveShaEnd || '',
    started_at: started,
    ended_at: new Date().toISOString(),
    checks,
    steps_present: steps,
    turns,
    cost,
    cleanup,
    gaps,
    reason,
    session_ref: played?.sessionRef || '',
    ...(ssr ? { ssr } : {}),
    ...(dlrComparison && dlrComparison.n > 0 ? { dlr_comparison: dlrComparison } : {}),
    ...(dialogPdfStatus ? { dialog_pdf_status: dialogPdfStatus } : {}),
    ...(reason === 'turn-not-stored' || reason === 'first-intake-reply-flagged' ? { turn_http: played?.exchange || null } : {}),
  });
  fs.writeFileSync(path.join(options.outDir, 'scorecard.json'), `${JSON.stringify(card, null, 2)}\n`);
  if (keep) process.stdout.write(`${cleanup.command}\n`);
  return card;
}
