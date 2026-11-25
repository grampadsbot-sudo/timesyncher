import { callTieredModel, INTERIM_MODEL, jevPrecall, jevQualityRewrite } from '../../scripts/vacation-app-reply-rules.mjs';
import { sumModelCost } from './turn-cost.mjs';

const FIRST_INTAKE_REPLY_TIMEOUT_MS = 8000;
import { appTextBanned, loadSavedTripRecord } from './live-app-turn.mjs';
import { assertCustomerReplyShippable } from './reply-id-citation.mjs';
import { applyTurnInviteReplyFacts } from './turn-invite-reply-facts.mjs';
import { loadTripOwnerReplyPlan } from './reply-plan-entitlement.mjs';
import { replyClaimContextFromIntent } from './reply-action-claim.mjs';
import {
  applyCustomerInputToFirstIntakeFacts,
  firstIntakeLodgingCustomerInput,
  persistTripLodgingCustomerInputGap,
  persistTripInviteContactNeeded,
} from './first-intake-customer-input.mjs';
import {
  firstIntakeModelFacts,
  firstIntakeReplyFacts,
  firstIntakeReplyInstruction,
  hiddenIds,
  intakeCustomerName,
  intakeFactText,
  groundedSingleQuestionDraft,
  intakeReplyBlock,
  intakeReplyBlockReasons,
  isoDay,
} from './first-intake-reply.mjs';

export async function produceFirstIntakeReply({
  customerTurn = '',
  session = null,
  tripTitle = '',
  env = process.env,
  rules = null,
  wantedThings = [],
  roster = null,
  extractedDestination = '',
  savedStart = '',
  savedEnd = '',
  loadOwnerPlan = loadTripOwnerReplyPlan,
  turnActionResults = null,
} = {}) {
  if (!rules?.ok) {
    return { reply: null, rules, jev: null, model: null, reason: rules?.error || 'reply_rules_unloaded' };
  }
  const saved = await loadSavedTripRecord(session, env);
  const tripStart = String(savedStart || saved?.start || '').trim();
  const tripEnd = String(savedEnd || saved?.end || '').trim();
  const tripId = String(session?.trip_id || session?.tripId || saved?.tripId || '').trim();
  const customerInput = firstIntakeLodgingCustomerInput(saved?.things || [], wantedThings);
  await persistTripLodgingCustomerInputGap(env, tripId, customerInput);
  const jevStarted = Date.now();
  const jev = await jevPrecall({
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    session: { seed_id: session?.token || null },
    env,
  });
  if (jev && typeof jev === 'object') jev.jevLatencyMs = Math.max(0, Date.now() - jevStarted);
  if (!jev?.jevRan) {
    return { reply: null, rules, jev, model: null, customerInput, reason: jev?.error || 'jev_skipped' };
  }
  jev.jevBeforeModel = true;
  const ownerPlan = saved?.ownerPlan
    || (tripId ? await loadOwnerPlan({ tripId, env }) : null);
  const ids = hiddenIds(session, [saved?.id, saved?.tripId, saved?.trip_id, tripId]);
  const factInput = {
    customerTurn,
    tripTitle,
    wantedThings,
    roster,
    extractedDestination: intakeFactText(extractedDestination, 180) || intakeFactText(saved?.destination, 180),
    savedStart: tripStart,
    savedEnd: tripEnd,
    savedDates: isoDay(tripStart) && isoDay(tripEnd) ? `${isoDay(tripStart)} to ${isoDay(tripEnd)}` : '',
    planOwned: saved?.planOwned === true || ownerPlan?.order_bump_owned === true,
    ownerPlan,
    tripId,
    customerName: intakeCustomerName(session),
    session,
    ids,
  };
  const facts = applyCustomerInputToFirstIntakeFacts(
    applyTurnInviteReplyFacts(firstIntakeReplyFacts(factInput), turnActionResults),
    customerInput,
  );
  await persistTripInviteContactNeeded(env, tripId, facts.invite_contact_needed === true);
  const modelFacts = firstIntakeModelFacts(facts);
  const prompt = `${firstIntakeReplyInstruction(modelFacts)}\n\nIntake facts: ${JSON.stringify(modelFacts)}`;
  let model = null;
  let reply = '';
  let blockedReasons = [];
  let refusal = '';
  for (let attempt = 0; attempt < 2 && !reply; attempt += 1) {
    const genStarted = Date.now();
    const feedback = refusal
      ? `\n\nThe previous draft was refused: ${refusal}. Write a new reply that fixes that refusal. Do not mention the refusal.`
      : '';
    model = sumModelCost(model, await callTieredModel({
      rules,
      jev,
      customerTurn,
      stage: 'vacation_conversation',
      screen: 'vacation-app',
      destination: facts.where || '',
      memory: [],
      upsell: facts.shape === 'voice-note' ? 'allow-once' : 'forbidden',
      postIntake: true,
      intakeReplyTurn: true,
      replyFacts: modelFacts,
      env,
      forceModel: INTERIM_MODEL,
      tier1CompactReasoning: true,
      timeoutMs: FIRST_INTAKE_REPLY_TIMEOUT_MS,
      systemExtra: `${prompt}${feedback}`, purpose: attempt ? 'reply_rewrite' : 'reply_draft',
    }));
    if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
    reply = model?.called && model.text ? String(model.text).trim() : '';
    const nextReasons = reply ? intakeReplyBlockReasons(reply, appTextBanned, facts, ids) : [];
    if (nextReasons.length) {
      blockedReasons = nextReasons;
      const onlyQuestionCount = nextReasons.length === 1 && nextReasons[0] === 'first_intake_question_count';
      const trimmed = attempt === 1 && onlyQuestionCount ? groundedSingleQuestionDraft(reply, facts, ids) : '';
      if (trimmed) {
        reply = trimmed;
        blockedReasons = [];
      } else {
        refusal = nextReasons.join('; ');
        reply = '';
      }
    }
  }
  if (!reply) {
    const visible = model?.called && model.text ? String(model.text).trim() : '';
    const fallbackReason = model?.reason || 'first intake reply model returned no reply';
    const reasons = blockedReasons.length ? blockedReasons : (visible ? [fallbackReason] : [fallbackReason]);
    return {
      reply: null,
      rules,
      jev,
      model,
      customerInput,
      reason: (visible && intakeReplyBlock(visible, appTextBanned, facts, ids)) || fallbackReason,
      blockedDraft: visible || '',
      blockedReasons: reasons,
    };
  }
  const replyClaimContext = replyClaimContextFromIntent({
    turnActionResults,
    classification: turnActionResults?.invite ? { inviteeName: turnActionResults.invite.inviteeName } : null,
  });
  try {
    assertCustomerReplyShippable(reply, tripId, turnActionResults, replyClaimContext);
  } catch (error) {
    if (error?.name !== 'reply_id_citation_blocked' && error?.name !== 'reply_action_claim_blocked') throw error;
    const reason = error?.name === 'reply_action_claim_blocked'
      ? 'reply_action_claim_blocked'
      : 'reply_id_citation_blocked';
    return {
      reply: null,
      rules,
      jev,
      model,
      customerInput,
      reason,
      blockedDraft: reply,
      blockedReasons: [String(error.reason || reason)],
    };
  }
  const judgeStarted = Date.now();
  const quality = await jevQualityRewrite({ customerTurn, draft: reply, env });
  const judgeMs = Math.max(0, Date.now() - judgeStarted);
  if (quality?.judged !== true) {
    const reason = quality?.reason || 'quality_not_judged';
    return {
      reply: null,
      rules,
      jev,
      model,
      customerInput,
      quality: quality || { judged: false, reason },
      reason,
      blockedReasons: [reason],
    };
  }
  quality.judgeMs = judgeMs;
  if (model && typeof model === 'object') {
    model.quality = quality;
    const latency = model.log?.latencyMs && typeof model.log.latencyMs === 'object' ? model.log.latencyMs : {};
    model.log = {
      ...(model.log || {}),
      jevScoreDraft: quality.score,
      latencyMs: {
        ...latency,
        draft: Number.isFinite(Number(model.genLatencyMs)) ? Number(model.genLatencyMs) : (latency.draft ?? null),
        jevDraft: judgeMs,
        jevRewrite: latency.jevRewrite ?? null,
        total: (Number(latency.draft) || Number(model.genLatencyMs) || 0) + judgeMs,
      },
    };
  }
  return { reply, rules, jev, model, quality, customerInput, reason: null };
}
