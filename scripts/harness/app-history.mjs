export const APP_HISTORY_WINDOW_ROWS = 120;

export function historyWindowFull(body) {
  return Array.isArray(body?.turns) && body.turns.length >= APP_HISTORY_WINDOW_ROWS;
}

function liveTranscript(turn) {
  return turn?.payload?.liveTranscript ?? {};
}

function appModel(turn, live = liveTranscript(turn)) {
  return String(turn?.modelId || turn?.responseModel || live.modelId || live.model?.responseModel || '').trim();
}

function isAppReply(turn) {
  if (String(turn?.speaker || turn?.role || '') !== 'app') return false;
  const live = liveTranscript(turn);
  return live.fixedOpener !== true
    && turn.fixedOpener !== true
    && live.replyProducer !== 'vacation-app-onboarding-opener'
    && turn.replyProducer !== 'vacation-app-onboarding-opener'
    && live.jev?.reason !== 'fixed_onboarding_opener'
    && turn.jev?.reason !== 'fixed_onboarding_opener';
}

function appTurnIndex(turn, live = liveTranscript(turn)) {
  return Number(live.turnIndex || turn?.turnIndex) || null;
}

export function ruledReplyCount(body) {
  if (!Array.isArray(body?.turns)) return null;
  return body.turns.filter((turn) => isAppReply(turn) && appModel(turn)).length;
}

export function latestStoredAppTurn(body, { ruledOnly = false } = {}) {
  if (!Array.isArray(body?.turns)) return null;
  const turn = body.turns.findLast((row) => isAppReply(row) && (!ruledOnly || appModel(row)));
  if (!turn) return null;
  const live = liveTranscript(turn);
  const text = String(turn.body ?? turn.text ?? live.text ?? '').trim();
  const at = turn.at || turn.received_at || turn.sent_at || turn.created_at || live.at || '';
  return {
    text,
    model: appModel(turn, live),
    cost: turn.cost || live.cost || live.model?.cost || null,
    turnIndex: appTurnIndex(turn, live),
    quality: turn.quality || live.quality || null,
    jevDisposition: turn.jevDisposition || live.jevDisposition || '',
    key: JSON.stringify([turn.request_id || live.requestId || '', at, text]),
  };
}

export function storedAppTurnChanged(body, before, { ruledOnly = true, replyBody } = {}) {
  const newest = latestStoredAppTurn(body, { ruledOnly });
  if (!newest) return false;
  if (!before) return true;
  if (newest.turnIndex && before.turnIndex) {
    if (newest.turnIndex > before.turnIndex) return true;
  } else if (newest.key !== before.key) {
    return true;
  }
  const posted = Number(replyBody?.appTurnIndex);
  return Boolean(posted && before.turnIndex && posted > before.turnIndex
    && body.turns.some((turn) => isAppReply(turn) && appModel(turn) && appTurnIndex(turn) === posted));
}
