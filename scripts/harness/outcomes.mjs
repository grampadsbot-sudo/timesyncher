import fs from 'node:fs';
import path from 'node:path';
import { redactUrls } from './backends.mjs';
import { sumUsageUsd } from './cost.mjs';
import { countPlanningAgreementTurns, itineraryMeasurement, measureStoredItinerary } from './itinerary-evidence.mjs';
import { measureInitialBuild } from './initial-build.mjs';
import { redactText } from './redact.mjs';

function rescuedTimeoutsSummary(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const turns = Array.isArray(value.turns) ? value.turns.map((n) => Number(n)).filter(Number.isFinite) : [];
  return {
    count: Number(value.count) || turns.length,
    turns,
    timeouts: Number(value.timeouts) || 0,
  };
}

export function writeOutcomes(outDir, payload) {
  if (!outDir) return payload;
  try {
    const costs = [];
    const turns = Array.isArray(payload?.customerTurns) ? payload.customerTurns : [];
    for (const turn of turns) {
      if (turn?.cost) costs.push(turn.cost);
    }
    const rawFallbacks = payload?.planningFallbacks && typeof payload.planningFallbacks === 'object'
      ? payload.planningFallbacks
      : { count: 0, turns: [] };
    const fallbackTurns = Array.isArray(rawFallbacks.turns) ? rawFallbacks.turns : [];
    const costUsd = sumUsageUsd(turns.filter((turn) => turn?.cost).map((turn) => ({ usage: turn.cost, model: turn.model || '' })));
    const rec = {
      tripId: payload?.tripId ? String(payload.tripId) : '',
      ...itineraryMeasurement(payload),
      planningAgreementTurns: payload?.planningAgreementTurns ?? null,
      ...(payload?.initialBuild ? { initialBuild: payload.initialBuild } : {}),
      keepsakeOk: payload?.keepsakeOk === true,
      pricingReactionCaptured: payload?.pricingReactionCaptured === true,
      customerTurnCount: Number(payload?.customerTurnCount) || turns.filter((turn) => turn.role === 'customer').length,
      hitTurnCap: payload?.hitTurnCap === true,
      reason: payload?.reason || '',
      planningFallbacks: { count: Number(rawFallbacks.count) || fallbackTurns.length, turns: fallbackTurns },
      rescuedTimeouts: rescuedTimeoutsSummary(payload?.rescuedTimeouts),
      costs,
      costUsd,
      ...(payload.adminArtifacts ? { adminArtifacts: payload.adminArtifacts } : {}),
      liveShaStart: payload?.liveShaStart || '',
      liveShaEnd: payload?.liveShaEnd || '',
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'outcomes.json'), `${JSON.stringify(rec, null, 2)}\n`);
  } catch {
    return payload;
  }
  return payload;
}

export async function finishMeasuredPlay({ db, tag, outDir, secrets, play, replyBackend }) {
  let tripId = '';
  let evidence;
  const rememberTrip = (id) => { if (id) tripId = id; };
  const measure = async (id) => {
    rememberTrip(id);
    if (evidence) return evidence;
    const [itinerary, planningAgreementTurns, initialBuild] = await Promise.all([
      measureStoredItinerary(db, tripId, tag),
      countPlanningAgreementTurns(db, tripId, tag),
      replyBackend === 'trip_state' ? measureInitialBuild(db, tripId, tag) : null,
    ]);
    evidence = { tripId, ...itinerary, planningAgreementTurns, initialBuild };
    return evidence;
  };
  let played;
  try {
    played = await play({ rememberTrip, measure });
  } catch (error) {
    played = { reason: 'harness-error', detail: redactUrls(redactText(error?.message || error, secrets)) };
  }
  return writeOutcomes(outDir, { ...played, ...await measure(played.tripId) });
}
