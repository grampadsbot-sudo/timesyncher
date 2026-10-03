const STAGE_KEYS = [
  'classifierMs',
  'searchMs',
  'judgeMs',
  'replyMs',
  'gateMs',
  'welcomeMs',
  'tripCreateMs',
  'entitlementMs',
  'turnTagMs',
  'siteUrlMs',
];

export function turnStageTimings(partial = {}) {
  const timings = {
    classifierMs: null,
    searchMs: null,
    judgeMs: null,
    replyMs: null,
    gateMs: null,
  };
  const source = partial && typeof partial === 'object' ? partial : {};
  for (const key of STAGE_KEYS) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) timings[key] = Math.round(value);
  }
  return timings;
}

export function replyStageMillis(produced = {}, wallMs = null) {
  const log = produced?.model?.log?.latencyMs || produced?.log?.latencyMs || {};
  const draft = Number(log.draft);
  const generated = Number(produced?.model?.genLatencyMs);
  const replyMs = Number.isFinite(draft) ? draft : (Number.isFinite(generated) ? generated : null);
  let judgeMs = null;
  for (const part of [log.jevDraft, log.jevRewrite]) {
    const value = Number(part);
    if (!Number.isFinite(value) || value < 0) continue;
    judgeMs = (judgeMs || 0) + value;
  }
  return {
    replyMs: replyMs == null && Number.isFinite(Number(wallMs)) ? Number(wallMs) : replyMs,
    judgeMs,
  };
}

export function withGateMs(payload, customerLive, base, started) {
  const stageTimings = turnStageTimings({
    ...(payload?.stageTimings || {}),
    gateMs: Date.now() - started,
  });
  if (payload) payload.stageTimings = stageTimings;
  if (customerLive) customerLive.stageTimings = stageTimings;
  if (base) base.stageTimings = stageTimings;
  return stageTimings;
}

export function failedInTurnSearchTurn({
  requestId,
  jobId,
  receivedAt,
  queuedAt,
  turnTag,
  modality,
  turnIndex,
  latencyMs,
  sessionE2eMs,
  jev,
  jobFields = {},
  inTurnSearch = {},
  stageTimings = null,
  error,
} = {}) {
  return {
    requestId,
    jobId,
    receivedAt,
    queuedAt,
    turnTag,
    modality,
    turnIndex,
    latencyMs,
    sessionE2eMs,
    jev,
    reply: null,
    intakeEvent: jobFields.intakeEvent,
    wantedThings: jobFields.wantedThings,
    roster: jobFields.roster,
    rosterError: jobFields.rosterError,
    destination: jobFields.destination,
    hasDates: jobFields.hasDates,
    startDate: jobFields.startDate,
    endDate: jobFields.endDate,
    title: jobFields.title,
    titleError: jobFields.titleError,
    intakeError: jobFields.intakeError,
    ok: false,
    status: inTurnSearch.status,
    error,
    placeSearch: inTurnSearch.placeSearch,
    webSearch: inTurnSearch.webSearch,
    stageTimings,
  };
}
