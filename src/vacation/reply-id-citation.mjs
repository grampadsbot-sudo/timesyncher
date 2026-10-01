const ID_CITATION = /\(\s*id\s*:\s*[^)]+\)/i;
const PRODUCT_ID_LITERAL = /timesyncher_vacation_[a-z0-9_]+/i;

export class ReplyIdCitationBlockedError extends Error {
  constructor(reason, tripId) {
    super('reply_id_citation_blocked');
    this.name = 'reply_id_citation_blocked';
    this.reason = reason;
    this.tripId = tripId;
  }
}

export function replyIdCitationReason(reply) {
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
