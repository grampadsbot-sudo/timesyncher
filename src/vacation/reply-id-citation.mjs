const ID_CITATION = /\(\s*id\s*:\s*(?!https?:\/\/)[^)]+\)/i;
const PRODUCT_ID_LITERAL = /timesyncher_vacation_[a-z0-9_]+/i;

export class ReplyIdCitationBlockedError extends Error {
  constructor(reason, tripId) {
    super('reply_id_citation_blocked');
    this.name = 'reply_id_citation_blocked';
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

export function assertCustomerReplyShippable(reply, tripId = '') {
  const reason = replyIdCitationReason(reply);
  if (reason) failReplyIdCitation(reason, tripId);
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
    if (error?.name !== 'reply_id_citation_blocked') throw error;
    const replyFailure = 'reply_id_citation_blocked';
    payload.replyFailure = replyFailure;
    customerLive.replyFailure = replyFailure;
    await storeReplyFailure(db, turnId, payload);
    return { ...base, ok: false, status: 'reply_unavailable', error: replyFailure };
  }
}
