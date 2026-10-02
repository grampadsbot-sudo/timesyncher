import { attachBlockedFirstIntakeDraft } from './blocked-turn-payload.mjs';
import { failReplyActionClaim, replyActionClaimReason } from './reply-action-claim.mjs';
import { replyPlaceSearchProviderLeakReason } from './place-search-reply-facts.mjs';

const ID_CITATION = /\(\s*id\s*:\s*[^)]+\)/i;
const PRODUCT_ID_LITERAL = /timesyncher_vacation_[a-z0-9_]+/i;

export class ReplyIdCitationBlockedError extends Error {
  constructor(reason, tripId) {
    super(reason === 'reply_place_search_provider_leak' ? 'reply_place_search_provider_leak' : 'reply_id_citation_blocked');
    this.name = reason === 'reply_place_search_provider_leak' ? 'reply_place_search_provider_leak' : 'reply_id_citation_blocked';
    this.reason = reason;
    this.tripId = tripId;
  }
}

function replyIdCitationReason(reply) {
  const body = String(reply || '');
  if (!body.trim()) return '';
  if (ID_CITATION.test(body)) return 'parenthetical_id_citation';
  if (PRODUCT_ID_LITERAL.test(body)) return 'product_id_literal';
  return '';
}

export function failReplyIdCitation(reason, tripId = '') {
  const id = String(tripId || '').trim();
  console.error(JSON.stringify({ reason, tripId: id }));
  throw new ReplyIdCitationBlockedError(reason, id);
}

export function assertCustomerReplyShippable(reply, tripId = '', turnActionResults = null, replyClaimContext = null) {
  const leakReason = replyPlaceSearchProviderLeakReason(reply);
  if (leakReason) failReplyIdCitation(leakReason, tripId);
  const reason = replyIdCitationReason(reply);
  if (reason) failReplyIdCitation(reason, tripId);
  const actionReason = replyActionClaimReason(reply, turnActionResults, replyClaimContext);
  if (actionReason) failReplyActionClaim(actionReason, tripId);
  return reply;
}

export async function blockVacationAppReplyIdCitation({
  replyText,
  tripId,
  db,
  turnId,
  payload,
  customerLive,
  base,
  storeReplyFailure,
}) {
  try {
    assertCustomerReplyShippable(replyText, tripId);
    return null;
  } catch (error) {
    if (error?.name !== 'reply_id_citation_blocked' && error?.name !== 'reply_place_search_provider_leak') throw error;
    const replyFailure = 'reply_id_citation_blocked';
    payload.replyFailure = replyFailure;
    customerLive.replyFailure = replyFailure;
    attachBlockedFirstIntakeDraft(payload, {
      blockedDraft: String(replyText || '').trim(),
      blockedReasons: [String(error.reason || replyFailure)],
      reason: replyFailure,
    });
    await storeReplyFailure(db, turnId, payload);
    return { ...base, ok: false, status: 'reply_unavailable', error: replyFailure };
  }
}
