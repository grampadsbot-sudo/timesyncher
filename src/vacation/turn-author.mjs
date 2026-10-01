function authorFirstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || 'Owner';
}

export function turnAuthorLabel(turn = {}, session = {}) {
  const inbound = turn.speaker === 'customer' || turn.direction === 'inbound';
  if (!inbound) return 'TimeSyncher';
  const authorId = String(turn.authorId || turn.payload?.authorId || '');
  const viewerId = String(session.viewerId || session.customer_id || '');
  const spoken = String(turn.authorName || turn.payload?.authorName || turn.payload?.liveTranscript?.speakerName || '').trim();
  if (authorId && viewerId && authorId === viewerId) return 'You';
  if (authorId && authorId !== viewerId) return authorFirstName(spoken);
  if (session.seat && spoken !== String(session.customerName || '')) return authorFirstName(spoken);
  return 'You';
}
