import { createTripStateActions } from './trip-state-actions.mjs';
import { tripStateActionsEnabled } from './trip-state-actions-enabled.mjs';
import { readTripStateSite, withoutPreviousSystemPlan } from './trip-state-action-site.mjs';
import { createTripStateActionStore } from './trip-state-action-store.mjs';
import { buildProactivePlan, proactiveCriteria, proactiveResearchKey } from './trip-state-proactive-plan.mjs';
import { searchProactiveItinerary } from './trip-state-proactive-research.mjs';
import { createTripStateRevisionStore } from './trip-state-revision-store.mjs';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function verifiedHeaderDelta(classification, text) {
  if (classification?.ok !== true) return {};
  const request = String(text || '').toLowerCase();
  const rawDest = String(classification.destination || '').trim().slice(0, 180);
  const destination = rawDest && request.includes(rawDest.toLowerCase()) ? rawDest : null;
  const validDates = classification.hasDates === true
    && isoDate.test(String(classification.startDate || ''))
    && isoDate.test(String(classification.endDate || ''))
    && classification.startDate <= classification.endDate;
  return {
    destination,
    startDate: validDates ? classification.startDate : null,
    endDate: validDates ? classification.endDate : null,
  };
}

function combinedHistory(history, turn, text, things) {
  const byTurn = new Map();
  for (const row of Array.isArray(history) ? history : []) {
    const rowTurn = Number(row?.turn);
    if (!Number.isInteger(rowTurn) || rowTurn < 1 || rowTurn >= turn) continue;
    byTurn.set(rowTurn, {
      turn: rowTurn,
      text: String(row.text || ''),
      things: Array.isArray(row.things) ? row.things : [],
    });
  }
  byTurn.set(turn, {
    turn,
    text: String(text || ''),
    things: Array.isArray(things) ? things : [],
  });
  return [...byTurn.values()].sort((a, b) => a.turn - b.turn);
}

function normalizedResearch(raw, { key, turn, destination, extraGaps = [] }) {
  const area = String(destination || '').trim().slice(0, 280);
  const areas = Array.isArray(raw?.areas) && raw.areas.length
    ? raw.areas.map((entry) => String(entry || '').trim().slice(0, 280)).filter(Boolean)
    : (area ? [area] : []);
  const gaps = [...new Set([
    ...(Array.isArray(raw?.gaps) ? raw.gaps : []),
    ...extraGaps,
  ].map((entry) => String(entry || '').trim().slice(0, 280)).filter(Boolean))];
  const state = ['waiting', 'running', 'complete', 'partial', 'empty', 'failed'].includes(raw?.state)
    ? raw.state : 'failed';
  return { key, state, turn, areas, gaps };
}

export async function prepareProactiveTripState({
  trip, requestId, turn, actorId, classification, text = '',
  history = [], wantedThings, disclosures, travelers, grant,
  env = process.env, pool, fetchImpl = globalThis.fetch,
  searchImpl = searchProactiveItinerary,
}) {
  if (!trip?.id || !tripStateActionsEnabled({ env, trip })) return null;
  const revisionStore = createTripStateRevisionStore({ env, pool });
  const existingReady = await revisionStore.getForRequest({ tripId: trip.id, requestId, phase: 'reply_ready' });
  if (existingReady) return existingReady;

  const delta = verifiedHeaderDelta(classification, text);
  let activeTrip = trip;
  if (delta.destination || delta.startDate || delta.endDate) {
    const synced = await revisionStore.syncHeader({ tripId: trip.id, actorId, ...delta });
    if (!synced) return null;
    activeTrip = synced;
  }

  const baseArgs = {
    trip: activeTrip, requestId, turn, actorId, classification, text, disclosures, travelers, grant,
  };
  const planningRow = await revisionStore.prepare({ ...baseArgs, phase: 'planning' });
  if (!planningRow) return null;
  const planningState = JSON.parse(planningRow.state_json);
  const effectiveTurn = planningState.updated_turn;
  const key = proactiveResearchKey({
    id: planningState.trip_id,
    destination: planningState.saved.trip.destination,
    start_date: planningState.saved.trip.start,
    end_date: planningState.saved.trip.end,
  });
  const canPlan = Boolean(
    key
    && planningState.capabilities.actions.save_plan.enabled
    && planningState.research?.key !== key,
  );
  if (!canPlan) {
    return revisionStore.prepare({ ...baseArgs, turn: effectiveTurn, phase: 'reply_ready' });
  }

  const currentThings = Array.isArray(wantedThings)
    ? wantedThings
    : (classification?.ok === true && Array.isArray(classification.things) ? classification.things : []);
  const turnHistory = combinedHistory(history, effectiveTurn, text, currentThings);
  const criteria = proactiveCriteria(planningState, turnHistory);
  const researched = await searchImpl({
    destination: planningState.saved.trip.destination,
    start: planningState.saved.trip.start,
    end: planningState.saved.trip.end,
    criteria: criteria.search,
    turn: effectiveTurn,
    key,
    env,
    fetchImpl,
  });
  const candidates = researched?.candidates && typeof researched.candidates === 'object' ? researched.candidates : {};
  const baseResearch = normalizedResearch(researched?.research, {
    key,
    turn: effectiveTurn,
    destination: planningState.saved.trip.destination,
  });

  const actionStore = createTripStateActionStore({ env, pool });
  const actions = createTripStateActions({ env, store: actionStore });
  const site = await actionStore.read({ tripId: planningState.trip_id, actorId, requestId, operationKey: key });
  const cleanSaved = site
    ? readTripStateSite(withoutPreviousSystemPlan(site, key), planningState.saved, effectiveTurn)
    : planningState.saved;
  const planState = { ...planningState, research: baseResearch, candidates };
  const plan = buildProactivePlan({ state: planState, saved: cleanSaved, history: turnHistory, criteria, key });
  const finalResearch = normalizedResearch(baseResearch, {
    key,
    turn: effectiveTurn,
    destination: planningState.saved.trip.destination,
    extraGaps: plan.gaps,
  });

  let actionRefs = [];
  if (plan.operations.length > 0) {
    const executed = await actions.execute({
      context: {
        trip: site?.trip || activeTrip,
        tripId: planningState.trip_id,
        actorId,
        requestId,
        operationKey: key,
        turn: effectiveTurn,
        state: planState,
        siteRevision: planningState.saved.site_revision,
        authority: plan.authority,
        customerText: text,
        priorTurns: turnHistory
          .filter((row) => row.turn < effectiveTurn)
          .map((row) => ({ turn: row.turn, role: 'customer', text: row.text })),
      },
      op: 'save_plan',
      args: { authority: plan.authority.id, operations: plan.operations },
    });
    actionRefs = executed.actions.flatMap((entry) => entry.refs || []);
  }

  const nextSteps = actionRefs.length
    ? [{
      kind: 'ask',
      task: 'Invite the customer to review the proposed first-pass itinerary and adjust any item, day, or time.',
      refs: [...new Set(actionRefs)].slice(0, 12),
    }]
    : undefined;

  return revisionStore.prepare({
    ...baseArgs,
    trip: site?.trip || activeTrip,
    turn: effectiveTurn,
    phase: 'reply_ready',
    research: finalResearch,
    candidates,
    nextSteps,
  });
}
