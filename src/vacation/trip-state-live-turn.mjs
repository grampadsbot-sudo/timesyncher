import { callTieredModel, jevQualityRewrite, JEV_QUALITY_MODEL } from '../../scripts/vacation-app-reply-rules.mjs';
import { applyJevTurn, draftTierForTurn, jevTurn } from './jev-turn.mjs';
import { customerIntent, emptyIntent } from './customer-intent.mjs';
import { finalizeCustomerReplyText } from './reply-customer-wording.mjs';
import { failOpenLiveReply, jevJudgeErrored, unjudgedReply } from './reply-quality-gate.mjs';
import { sumModelCost, sumTurnCost } from './turn-cost.mjs';
import { tripStateActionsEnabled } from './trip-state-actions-enabled.mjs';
import { assertTripState } from './trip-state-projector.mjs';
import {
  enabledTripStateTools,
  pinTripStateContext,
  tripStateNeedsRewrite,
} from './trip-state-model-context.mjs';
import {
  appTextBanned,
  rewriteReplacesDraft,
  sameTierRewriteRequest,
  splitRewriteChange,
  stripChatMarkdown,
  verifiedRewriteChange,
} from './live-app-turn.mjs';

const MAX_TOOL_CALLS = 8;

function cleanReply(value) {
  return finalizeCustomerReplyText(stripChatMarkdown(String(value || '').trim()));
}

function rawScore(value) {
  if (value == null || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function failureSummary(quality) {
  const parts = [];
  if (quality?.unbackedChangeClaim === true) parts.push('unbacked change claim without matching last_actions receipt');
  const focus = String(quality?.jevFocus || '').trim();
  if (focus && focus !== 'keep') parts.push(`jev fix_focus ${focus}`);
  const score = Number(quality?.score);
  if (Number.isFinite(score) && score <= 2) parts.push(`score ${score}`);
  return parts.join('; ');
}

function stampTripStateReply({ reply, quality, draftModel, log, draft, model }) {
  const shippedRewrite = log.shippedRewrite === true;
  const next = {
    ...quality,
    rewritten: shippedRewrite,
    model: JEV_QUALITY_MODEL,
    comment: null,
    draft: draft || log.draftText || '',
    rewriteText: log.rewriteText || '',
    rewriteModel: log.rewriteModel || '',
    draftModel,
    shippedModel: log.shippedModel,
  };
  return {
    reply,
    quality: next,
    log,
    model: {
      called: true,
      via: model?.via || 'openrouter-chat',
      responseModel: draftModel,
      modelTier: model?.modelTier ?? null,
      genLatencyMs: log.latencyMs?.draft ?? null,
      maxTokens: model?.maxTokens ?? 900,
      beats: null,
      quality: next,
      log,
      cost: log.cost || model?.cost || null,
    },
  };
}

function parseToolArgs(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return error ? null : null;
  }
}

function normalizeReadyState(currentState, previousSaved) {
  const proposedBy = (entry) => (entry.proposed_by === 'customer' || entry.proposed_by === 'system'
    ? entry.proposed_by
    : (entry.via === 'customer_named' || entry.via === 'chat_action' ? 'customer' : 'system'));
  const saved = currentState.saved;
  const items = Object.fromEntries(Object.entries(saved.items || {}).map(([id, item]) => [id, { ...item, proposed_by: proposedBy(item) }]));
  const days = Object.fromEntries(Object.entries(saved.days || {}).map(([id, day]) => [id, {
    ...day,
    assigned: (day.assigned || []).map((row) => ({ ...row, proposed_by: proposedBy(row) })),
  }]));
  const last_actions = (currentState.last_actions || []).map(({ op, receipt, refs, turn }) => ({ op, receipt, refs, turn }));
  const tool_status = (currentState.tool_status || []).map(({ op, receipt, result, detail, refs, turn }) => ({ op, receipt, result, detail, refs, turn }));
  return {
    ...currentState,
    phase: 'reply_ready',
    revision: currentState.revision + 1,
    saved: { ...saved, items, days, travelers: saved.travelers || previousSaved?.travelers || {} },
    last_actions,
    tool_status,
  };
}

async function runToolCalls({
  toolCalls,
  tripStateContext,
  tripStateActions,
  tripStateActionContext,
  tripStateStore,
  customerTurn,
}) {
  const enabledNames = new Set(enabledTripStateTools(tripStateContext.state.capabilities).map((tool) => tool.function.name));
  let currentState = tripStateContext.state;
  const previousSaved = tripStateContext.state.saved;
  const baseKey = String(tripStateActionContext.operationKey || 'op');
  let index = 0;
  for (const call of toolCalls.slice(0, MAX_TOOL_CALLS)) {
    index += 1;
    const name = String(call?.function?.name || call?.name || '').trim();
    if (!enabledNames.has(name)) continue;
    const args = parseToolArgs(call?.function?.arguments ?? call?.arguments);
    if (!args) continue;
    const result = await tripStateActions.execute({
      context: {
        ...tripStateActionContext,
        state: currentState,
        siteRevision: currentState.saved.site_revision,
        operationKey: `${baseKey}-${index}`,
      },
      op: name,
      args,
    });
    if (result?.state) currentState = result.state;
  }
  if (typeof tripStateStore?.prepare === 'function' && tripStateActionContext?.prepareArgs) {
    const prepared = await tripStateStore.prepare({ ...tripStateActionContext.prepareArgs, phase: 'reply_ready' });
    if (prepared) return pinTripStateContext(prepared, { customerTurn });
  }
  const frozen = normalizeReadyState(currentState, previousSaved);
  assertTripState(frozen);
  return pinTripStateContext(frozen, { customerTurn });
}

export async function produceTripStateLiveReply({
  trip = null,
  tripStateRevision = null,
  tripStateActions = null,
  tripStateActionContext = null,
  tripStateStore = null,
  customerTurn = '',
  session = null,
  env = process.env,
  rules = null,
  understanding = null,
} = {}) {
  if (!tripStateRevision || !tripStateActionsEnabled({ env, trip })) return null;
  let intent = emptyIntent();
  try {
    intent = await customerIntent(customerTurn, { env, understanding });
  } catch (error) {
    intent = { ...emptyIntent(), error: String(error?.message || error) };
  }
  const jev = draftTierForTurn({ intent });
  if (!rules?.ok) return { reply: null, rules, jev, model: null, reason: rules?.error || 'reply_rules_unloaded' };
  if (!jev?.jevRan) {
    return {
      reply: null, rules, jev, model: null,
      jevLatencyMs: jev?.jevLatencyMs ?? null, genLatencyMs: null, jevBeforeModel: false,
      reason: jev?.error || 'jev_skipped',
    };
  }
  jev.jevBeforeModel = true;

  let tripStateContext = pinTripStateContext(tripStateRevision, { customerTurn });
  const genStarted = Date.now();
  let model = await callTieredModel({
    rules,
    jev,
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    env,
    tripStateContext,
    tripStateMode: 'plan',
    purpose: 'reply_draft',
  });
  if (model?.called && Array.isArray(model.toolCalls) && model.toolCalls.length > 0) {
    if (tripStateActions && tripStateActionContext) {
      tripStateContext = await runToolCalls({
        toolCalls: model.toolCalls,
        tripStateContext,
        tripStateActions,
        tripStateActionContext,
        tripStateStore,
        customerTurn,
      });
    }
    const writer = await callTieredModel({
      rules,
      jev,
      customerTurn,
      stage: 'vacation_conversation',
      screen: 'vacation-app',
      env,
      tripStateContext,
      tripStateMode: 'write',
      purpose: 'reply_draft',
    });
    model = sumModelCost(model, writer);
  }
  if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
  const reply = cleanReply(model?.called && model.text ? String(model.text) : '');
  const banned = appTextBanned(reply);
  if (!reply || banned) {
    return { reply: null, rules, jev, model, tripStateContext, reason: banned || model?.reason || 'live_dispatcher_failed' };
  }

  const draftModel = String(model?.responseModel || '').trim();
  const draftLatencyMs = Number(model?.genLatencyMs) || Math.max(0, Date.now() - genStarted);
  const qualityStarted = Date.now();
  const jevTurnResult = await jevTurn({ customerTurn, draft: reply, tripStateContext, session, env });
  const draftQualityMs = Math.max(0, Date.now() - qualityStarted);
  const quality = applyJevTurn(jev, jevTurnResult, draftQualityMs);
  if (quality?.judged) {
    quality.jevNote = null;
    quality.comment = null;
    quality.jevNoteReason = 'jev_no_free_text';
    quality.judgeMs = draftQualityMs;
  }
  const savedTripLog = {
    start: tripStateContext.state.saved.trip.start || '',
    end: tripStateContext.state.saved.trip.end || '',
    owner: '',
  };
  const baseLog = {
    draftModel,
    rewriteModel: null,
    shippedModel: draftModel,
    jevScoreDraft: quality?.score ?? null,
    jevScoreRaw: rawScore(quality?.scoreRaw),
    jevDisposition: quality?.disposition || null,
    jevFixFocus: quality?.jevFocus || null,
    draftJevScoreRaw: rawScore(quality?.scoreRaw),
    draftJevDisposition: quality?.disposition || null,
    draftJevFixFocus: quality?.jevFocus || null,
    rewriteJevScoreRaw: null,
    rewriteJevDisposition: null,
    rewriteJevFixFocus: null,
    draftFactCheck: quality?.unbackedChangeClaim ? 'unbacked_change_claim' : 'ok',
    rewriteFactCheck: null,
    rejudgeMs: null,
    rawModelText: model?.text == null ? null : String(model.text),
    jevScoreRewrite: null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: null,
    savedTrip: savedTripLog,
    interimReply: { text: null, model: null, ms: null },
    latencyMs: { draft: draftLatencyMs, rewrite: null, jevDraft: draftQualityMs, jevRewrite: null, total: draftLatencyMs + draftQualityMs },
    flagged: false,
    cost: model?.cost || null,
  };
  if (!quality?.judged) {
    if (jevJudgeErrored(quality)) {
      const open = failOpenLiveReply({
        rules, jev, model, quality, log: baseLog, draft: reply, judgeMs: draftQualityMs, draftModel,
        ship: (text) => text,
        stamp: (input) => stampTripStateReply({ ...input, model }),
      });
      return { ...open, tripStateContext };
    }
    return { ...unjudgedReply({ rules, jev, model, quality, log: baseLog, draft: reply }), tripStateContext };
  }
  if (!tripStateNeedsRewrite(quality)) {
    const shipped = stampTripStateReply({
      reply,
      quality,
      draftModel,
      log: { ...baseLog, draftText: reply, flagged: false },
      draft: reply,
      model,
    });
    return { reply: shipped.reply, rules, jev, model: shipped.model, quality: shipped.quality, log: shipped.log, tripStateContext, reason: null };
  }

  const pending = {
    customerTurn,
    draft: reply,
    draftModel,
    draftScore: quality.score,
    quality,
    jev,
    model,
    rawModelText: model?.text == null ? null : String(model.text),
    failureReason: failureSummary(quality),
    draftLatencyMs,
    qualityJevMs: draftQualityMs,
    tripStateContext,
    savedTripLog,
    interimReply: { text: null, model: null, ms: null },
  };
  const finished = await finishTripStateRewrite({ pending, env, rules });
  return { ...finished, tripStateContext };
}

export async function finishTripStateRewrite({ pending, env = process.env, rules = null } = {}) {
  const tripStateContext = pending?.tripStateContext;
  const started = Date.now();
  const request = sameTierRewriteRequest({
    customerTurn: pending?.customerTurn || '',
    draft: pending?.draft || '',
    scoreRaw: rawScore(pending?.quality?.scoreRaw),
    failure: pending?.failureReason || '',
  });
  const called = await callTieredModel({
    rules,
    jev: pending?.jev,
    customerTurn: request.customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    env,
    forceModel: pending?.draftModel || '',
    purpose: 'reply_rewrite',
    tripStateContext,
    tripStateMode: 'rewrite',
    systemExtra: request.systemExtra,
  });
  const rewriteMs = Math.max(0, Date.now() - started);
  const modelText = called?.called && called.text ? String(called.text).trim() : '';
  const split = splitRewriteChange(modelText);
  const rewritten = split.reply ? cleanReply(split.reply) : '';
  let failReason = '';
  if (!modelText) failReason = called?.reason || 'rewrite_empty';
  else if (!rewritten) failReason = 'rewrite_rejected';
  else if (!rewriteReplacesDraft(pending?.draft, rewritten)) failReason = 'rewrite_near_draft';
  else if (appTextBanned(rewritten)) failReason = 'rewrite_banned';

  let rewriteQuality = null;
  let rewriteQualityMs = 0;
  if (!failReason) {
    const judgeStarted = Date.now();
    rewriteQuality = await jevQualityRewrite({
      customerTurn: pending?.customerTurn || '',
      draft: rewritten,
      tripStateContext,
      env,
      purpose: 'jev_quality_rewrite',
    });
    rewriteQualityMs = Math.max(0, Date.now() - judgeStarted);
    if (!rewriteQuality?.judged) failReason = 'rewrite_not_judged';
    else if (tripStateNeedsRewrite(rewriteQuality)) {
      failReason = rewriteQuality.unbackedChangeClaim ? 'rewrite_unbacked_change_claim' : 'rewrite_ungrounded';
    }
  }

  const rewritePassed = !failReason && rewriteQuality?.judged === true && !tripStateNeedsRewrite(rewriteQuality);
  const draftGrounded = !tripStateNeedsRewrite(pending?.quality);
  const shippedText = rewritePassed ? rewritten : (draftGrounded ? String(pending?.draft || '').trim() : '');
  const rewriteModel = String(called?.responseModel || pending?.draftModel || '').trim();
  const shownChange = rewritePassed ? (verifiedRewriteChange(split.change) || null) : null;
  const shippedQuality = rewritePassed ? rewriteQuality : pending?.quality;
  const draftQualityMs = Number(pending?.qualityJevMs) || 0;
  const log = {
    draftModel: pending?.draftModel || null,
    draftText: pending?.draft || '',
    rewriteModel,
    rewriteText: modelText || rewritten || '',
    rewriteFailReason: rewritePassed ? '' : (failReason || 'rewrite_not_shipped'),
    rewriteAttempts: [{
      text: modelText || null,
      model: rewriteModel || null,
      score: rewriteQuality?.judged ? rewriteQuality.score : null,
      ms: rewriteMs,
      error: rewritePassed ? null : (failReason || 'rewrite_not_shipped'),
    }],
    shippedRewrite: rewritePassed,
    shippedModel: rewritePassed ? rewriteModel : (pending?.draftModel || null),
    jevScoreDraft: pending?.draftScore ?? null,
    jevScoreRewrite: rewriteQuality?.judged ? rewriteQuality.score : null,
    jevScoreRaw: rawScore(shippedQuality?.scoreRaw),
    jevDisposition: shippedQuality?.disposition || null,
    jevFixFocus: shippedQuality?.jevFocus || null,
    draftJevScoreRaw: rawScore(pending?.quality?.scoreRaw),
    draftJevDisposition: pending?.quality?.disposition || null,
    draftJevFixFocus: pending?.quality?.jevFocus || null,
    rewriteJevScoreRaw: rawScore(rewriteQuality?.scoreRaw),
    rewriteJevDisposition: rewriteQuality?.disposition || null,
    rewriteJevFixFocus: rewriteQuality?.jevFocus || null,
    draftFactCheck: pending?.quality?.unbackedChangeClaim ? 'unbacked_change_claim' : 'ok',
    rewriteFactCheck: rewriteQuality?.unbackedChangeClaim ? 'unbacked_change_claim' : (modelText ? 'ok' : 'none'),
    rejudgeMs: rewriteQuality ? rewriteQualityMs : null,
    rawModelText: pending?.rawModelText == null ? null : String(pending.rawModelText),
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: shownChange,
    savedTrip: pending?.savedTripLog || { start: '', end: '', owner: '' },
    interimReply: { text: null, model: null, ms: null },
    latencyMs: {
      draft: pending?.draftLatencyMs ?? null,
      rewrite: rewriteMs,
      jevDraft: draftQualityMs,
      jevRewrite: rewriteQuality ? rewriteQualityMs : null,
      total: Number(pending?.draftLatencyMs || 0) + draftQualityMs + rewriteMs + rewriteQualityMs,
    },
    flagged: false,
    held: !shippedText,
    cost: sumTurnCost(pending?.model?.cost, called?.cost),
  };
  const quality = {
    ...(shippedQuality || { judged: false }),
    comment: null,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: shownChange,
    rewritten: rewritePassed,
    judgeMs: rewritePassed ? rewriteQualityMs : draftQualityMs,
  };
  if (!shippedText) {
    return {
      reply: null,
      rules,
      jev: pending?.jev || null,
      model: { ...(pending?.model || {}), quality, log, cost: log.cost },
      quality,
      log,
      tripStateContext,
      reason: failReason || 'trip_state_rewrite_ungrounded',
    };
  }
  const stamped = stampTripStateReply({
    reply: shippedText,
    quality,
    draftModel: pending?.draftModel || '',
    log,
    draft: pending?.draft || '',
    model: pending?.model,
  });
  return {
    reply: stamped.reply,
    rules,
    jev: pending?.jev || null,
    model: stamped.model,
    quality: stamped.quality,
    log,
    tripStateContext,
    reason: null,
  };
}
