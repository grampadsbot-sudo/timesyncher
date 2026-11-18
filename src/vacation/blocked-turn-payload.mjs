export function attachBlockedFirstIntakeDraft(payload, produced = {}) {
  const draft = String(produced?.blockedDraft || '').trim();
  if (!draft) return;
  payload.blockedDraft = draft;
  const reasons = Array.isArray(produced?.blockedReasons) ? produced.blockedReasons.filter(Boolean) : [];
  payload.blockedReasons = reasons.length ? reasons : [String(produced?.reason || 'first_intake_reply_flagged')];
}

export function logBlockedReplyReasons(reasons) {
  const list = (Array.isArray(reasons) ? reasons : [])
    .map((reason) => String(reason || '').trim())
    .filter((reason) => /^[a-z0-9_:-]{1,80}$/i.test(reason));
  if (!list.length) return;
  console.error(JSON.stringify({ event: 'vacation_app_reply_blocked', blockedReasons: list }));
}

export function vacationAppTurnPayloadForClient(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const { blockedDraft, blockedReasons, ...visible } = payload;
  return visible;
}
