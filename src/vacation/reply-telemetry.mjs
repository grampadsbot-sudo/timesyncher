export function appReplyTelemetry(record = {}) {
  const generation = Number(record.generationMs ?? record.genLatencyMs);
  const jevLatency = Number(record.jevLatencyMs);
  return {
    jevLatencyMs: Number.isFinite(jevLatency) ? jevLatency : null,
    tier: record.tier ?? record.modelTier ?? null,
    modelId: record.modelId || record.responseModel || null,
    generationMs: Number.isFinite(generation) ? generation : null,
  };
}

export function logVacationAppReplyTelemetry(liveTranscript = {}) {
  const telemetry = appReplyTelemetry(liveTranscript);
  const jev = liveTranscript.jev && typeof liveTranscript.jev === 'object' ? liveTranscript.jev : {};
  console.log(JSON.stringify({
    event: 'vacation_app_reply_telemetry',
    ...telemetry,
    jevRan: jev.jevRan === true,
    ...(jev.jevRan === false ? { reason: jev.reason || null } : {}),
  }));
  return telemetry;
}
