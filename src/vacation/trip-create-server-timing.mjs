export function mergeTripCreateServerTiming({
  postMs = null,
  createVacationMs = null,
  queueTurnMs = null,
  tripCreateTimings = null,
  stageTimings = null,
  latencyMs = null,
  sessionE2eMs = null,
} = {}) {
  const stages = {};
  const add = (key, value) => {
    const ms = Number(value);
    if (Number.isFinite(ms) && ms >= 0) stages[key] = Math.round(ms);
  };
  if (tripCreateTimings && typeof tripCreateTimings === 'object') {
    for (const [key, value] of Object.entries(tripCreateTimings)) add(key, value);
  }
  if (stageTimings && typeof stageTimings === 'object') {
    for (const [key, value] of Object.entries(stageTimings)) add(key, value);
  }
  add('createVacationMs', createVacationMs);
  add('queueTurnMs', queueTurnMs);
  add('postMs', postMs);
  const timing = {
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
    sessionE2eMs: Number.isFinite(Number(sessionE2eMs)) ? Number(sessionE2eMs) : null,
    stages,
  };
  return timing;
}
