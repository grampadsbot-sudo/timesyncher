import { sumModelCost } from './turn-cost.mjs';
import { rewriteBlockedActionClaim } from './reply-action-claim-rewrite.mjs';
import { replyActionClaimReason } from './reply-action-claim.mjs';
import { blockVacationAppReplyIdCitation } from './reply-id-citation.mjs';
import { boundedAwait, chatReplyPostgenTimeoutMs } from './bounded-await.mjs';
import { withGateMs } from './turn-stage-timings.mjs';

function unconfirmedCollaboratorInviteReply(invite, seat) {
  const nextStep = seat ? 'Only the vacation owner can send collaborator invitations.' : ({
    missing_email: 'Please share their email address.',
    invalid_email: 'Please double-check their email address.',
    missing_invitee_name: 'Please share their name.',
    already_collaborator: 'Check the collaborator list for their current access.',
    send_failed: 'Check the collaborator list before trying again.',
  }[invite?.code] || 'To invite someone, please share their name and email address.');
  return `I couldn't confirm a collaborator invite on this turn. ${nextStep} With edit access, a collaborator can update the itinerary and add notes.`;
}

export async function rewriteVacationAppActionClaim(produced, { rewriteClaim, turnActionResults, replyClaimContext, seat }) {
  const vkBotTurn = produced.model?.backend === 'vk_bot_mcp' || produced.model?.via === 'vk_bot_mcp';
  const draft = String(produced.reply || produced.blockedDraft || '').trim();
  const claimReason = replyActionClaimReason(draft, turnActionResults, replyClaimContext);
  if (vkBotTurn) {
    if (claimReason === 'reply_action_claim_unbacked') {
      produced.reply = unconfirmedCollaboratorInviteReply(turnActionResults.invite, seat);
      produced.reason = null;
    } else if (produced.reply && claimReason) {
      produced.reply = null;
      produced.reason = 'vk_bot_mcp_claim_blocked';
    }
  } else if (produced.reply || (draft && (produced.reason === 'reply_action_claim_blocked' || claimReason))) {
    produced.reply = await rewriteClaim(draft);
    if (produced.reply) produced.reason = null;
  }
}

export function createBoundedRewriteClaim({
  turnActionResults,
  replyClaimContext,
  requestText,
  turnId,
  tripId,
  produced,
  env,
  jobFields,
  firstIntake,
}) {
  const postgenTimeoutMs = chatReplyPostgenTimeoutMs(env);
  return async (replyText) => {
    const draft = String(replyText || '').trim();
    const reason = replyActionClaimReason(draft, turnActionResults, replyClaimContext);
    if (!draft || !reason) return draft;
    const recovered = await boundedAwait(
      rewriteBlockedActionClaim({
        draft,
        reason,
        customerTurn: requestText,
        customerTurnId: turnId,
        tripId,
        turnActionResults,
        replyClaimContext,
        jev: produced.jev,
        rules: produced.rules,
        env,
        destination: String(jobFields.destination || ''),
        postIntake: firstIntake === true,
      }),
      postgenTimeoutMs,
      () => ({ reply: null, reason: 'rewrite_timeout', model: null }),
    );
    if (recovered.model) produced.model = sumModelCost(produced.model, recovered.model);
    if (!recovered.reply || recovered.reason) return '';
    return String(recovered.reply).trim();
  };
}

export function createBoundedReplyShipGate({
  tripId,
  db,
  turnId,
  payload,
  customerLive,
  base,
  storeReplyFailure,
  turnActionResults,
  replyClaimContext,
  env,
}) {
  const postgenTimeoutMs = chatReplyPostgenTimeoutMs(env);
  return async (replyText) => {
    const gateStarted = Date.now();
    const blocked = await boundedAwait(
      blockVacationAppReplyIdCitation({
        replyText,
        tripId,
        db,
        turnId,
        payload,
        customerLive,
        base,
        storeReplyFailure,
        turnActionResults,
        replyClaimContext,
      }),
      postgenTimeoutMs,
      () => ({ ...base, ok: false, status: 'reply_unavailable', error: 'reply_gate_timeout' }),
    );
    if (blocked?.error === 'reply_gate_timeout') return blocked;
    withGateMs(payload, customerLive, base, gateStarted);
    await db`update transcript_turns set payload = ${payload} where id = ${turnId}`;
    return blocked;
  };
}
