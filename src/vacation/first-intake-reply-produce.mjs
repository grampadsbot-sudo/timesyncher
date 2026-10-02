import { callTieredModel, jevPrecall } from '../../scripts/vacation-app-reply-rules.mjs';
import { appTextBanned, loadSavedTripRecord } from './live-app-turn.mjs';
import { assertCustomerReplyShippable } from './reply-id-citation.mjs';
import { applyTurnInviteReplyFacts } from './turn-invite-reply-facts.mjs';
import { loadTripOwnerReplyPlan } from './reply-plan-entitlement.mjs';
import { replyClaimContextFromIntent } from './reply-action-claim.mjs';
import {
  FIRST_INTAKE_GAP_INSTRUCTION,
  FIRST_INTAKE_QUESTION_INSTRUCTION,
  FIRST_INTAKE_VOICE_INSTRUCTION,
  firstIntakeReplyFacts,
  hiddenIds,
  intakeCustomerName,
  intakeFactText,
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
    return { reply: null, rules, jev, model: null, reason: jev?.error || 'jev_skipped' };
  }
  jev.jevBeforeModel = true;
  const saved = await loadSavedTripRecord(session, env);
  const tripStart = String(savedStart || saved?.start || '').trim();
  const tripEnd = String(savedEnd || saved?.end || '').trim();
  const tripId = String(session?.trip_id || session?.tripId || saved?.tripId || '').trim();
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
  const facts = applyTurnInviteReplyFacts(firstIntakeReplyFacts(factInput), turnActionResults);
  const prompt = `${facts.shape === 'voice-note'
    ? FIRST_INTAKE_VOICE_INSTRUCTION
    : facts.shape === 'question'
      ? FIRST_INTAKE_QUESTION_INSTRUCTION
      : FIRST_INTAKE_GAP_INSTRUCTION}\n\nIntake facts: ${JSON.stringify(facts)}`;
  let model = null;
  let reply = '';
  let block = '';
  for (let attempt = 0; attempt < 2 && !reply; attempt += 1) {
    const genStarted = Date.now();
    model = await callTieredModel({
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
      replyFacts: facts,
      env,
      systemExtra: prompt,
    });
    if (model && typeof model === 'object') model.genLatencyMs = Math.max(0, Date.now() - genStarted);
    reply = model?.called && model.text ? String(model.text).trim() : '';
    block = intakeReplyBlock(reply, appTextBanned, facts, ids);
    if (block) reply = '';
  }
  if (!reply) {
    const visible = model?.called && model.text ? String(model.text).trim() : '';
    const blockedReasons = visible ? intakeReplyBlockReasons(visible, appTextBanned, facts, ids) : [];
    const fallbackReason = model?.reason || 'first intake reply model returned no reply';
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: (visible && intakeReplyBlock(visible, appTextBanned, facts, ids)) || fallbackReason,
      blockedDraft: visible || '',
      blockedReasons: blockedReasons.length ? blockedReasons : (visible ? [fallbackReason] : [fallbackReason]),
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
      reason,
      blockedDraft: reply,
      blockedReasons: [String(error.reason || reason)],
    };
  }
  return { reply, rules, jev, model, reason: null };
}
