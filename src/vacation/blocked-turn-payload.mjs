export function attachBlockedFirstIntakeDraft(payload, produced = {}) {
  const draft = String(produced?.blockedDraft || '').trim();
  if (!draft) return;
  payload.blockedDraft = draft;
  const reasons = Array.isArray(produced?.blockedReasons) ? produced.blockedReasons.filter(Boolean) : [];
  payload.blockedReasons = reasons.length ? reasons : [String(produced?.reason || 'first_intake_reply_flagged')];
}

export function vacationAppTurnPayloadForClient(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const { blockedDraft, blockedReasons, ...visible } = payload;
  return visible;
}
