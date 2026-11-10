import { rewriteBlockedActionClaim } from './reply-action-claim-rewrite.mjs';
import { replyActionClaimReason } from './reply-action-claim.mjs';
import { blockVacationAppReplyIdCitation } from './reply-id-citation.mjs';
import { boundedAwait, chatReplyPostgenTimeoutMs } from './bounded-await.mjs';
import { withGateMs } from './turn-stage-timings.mjs';

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
    if (recovered.model) produced.model = recovered.model;
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
