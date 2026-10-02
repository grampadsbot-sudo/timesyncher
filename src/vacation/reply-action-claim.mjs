const INVITE_SUCCESS_CLAIM = /\b(?:i(?:'|')ve|i have|we(?:'|')ve|we have)\s+(?:added|invited)\b/i;
const INVITE_SENT_CLAIM = /\bsent\s+(?:the\s+)?invite\b/i;
const SHARED_WITH_CLAIM = /\bshared\s+(?:this\s+)?(?:trip|itinerary|plan|site)\s+with\b/i;
const ADDED_COLLABORATOR_CLAIM = /\badded\s+.{1,120}\s+as\s+(?:a\s+)?collaborator\b/i;
const VIEW_ACCESS_CLAIM = /\b(?:can now view|can view (?:the|this)|now have access|will see (?:the|this|these|your))\b/i;
const THEY_VIEW_CLAIM = /\bthey can (?:now )?view\b/i;

class ReplyActionClaimBlockedError extends Error {
  constructor(reason, tripId) {
    super('reply_action_claim_blocked');
    this.name = 'reply_action_claim_blocked';
    this.reason = reason;
    this.tripId = tripId;
  }
}

function collaboratorInviteSucceeded(turnActionResults) {
  return turnActionResults?.invite?.ok === true;
}

function replyClaimsCollaboratorInviteAction(reply) {
  const body = String(reply || '');
  if (!body.trim()) return false;
  if (INVITE_SUCCESS_CLAIM.test(body) && /\bcollaborator\b/i.test(body)) return true;
  if (ADDED_COLLABORATOR_CLAIM.test(body)) return true;
  if (INVITE_SENT_CLAIM.test(body) && /\bcollaborator\b/i.test(body)) return true;
  if (SHARED_WITH_CLAIM.test(body)) return true;
  if (INVITE_SUCCESS_CLAIM.test(body) && /\b(?:wife|husband|spouse|partner)\b/i.test(body)) return true;
  if (VIEW_ACCESS_CLAIM.test(body)) return true;
  if (THEY_VIEW_CLAIM.test(body)) return true;
  if (/\bwill see\b/i.test(body) && /\b(?:trip|plan|itinerary|site|these)\b/i.test(body)) return true;
  return false;
}

export function replyActionClaimReason(reply, turnActionResults = null) {
  if (!replyClaimsCollaboratorInviteAction(reply)) return '';
  if (collaboratorInviteSucceeded(turnActionResults)) return '';
  return 'reply_action_claim_unbacked';
}

export function failReplyActionClaim(reason, tripId = '') {
  const id = String(tripId || '').trim();
  console.error(JSON.stringify({ reason, tripId: id }));
  throw new ReplyActionClaimBlockedError(reason, id);
}

export async function blockVacationAppReplyActionClaim({
  replyText,
  tripId,
  turnActionResults,
  db,
  turnId,
  payload,
  customerLive,
  base,
  storeReplyFailure,
}) {
  const reason = replyActionClaimReason(replyText, turnActionResults);
  if (!reason) return null;
  try {
    failReplyActionClaim(reason, tripId);
  } catch (error) {
    if (error?.name !== 'reply_action_claim_blocked') throw error;
    const replyFailure = 'reply_action_claim_blocked';
    payload.replyFailure = replyFailure;
    customerLive.replyFailure = replyFailure;
    payload.blockedReasons = [String(error.reason || reason)];
    customerLive.blockedReasons = payload.blockedReasons;
    await storeReplyFailure(db, turnId, payload);
    return { ...base, ok: false, status: 'reply_unavailable', error: replyFailure };
  }
  return null;
}
