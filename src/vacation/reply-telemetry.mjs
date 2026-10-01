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
