import { classifyVacationAppCustomerTurn } from './chat-place-search.mjs';
import { classifyTripIntake } from './trip-intake-classify.mjs';
import { tripStateActionsEnabled } from './trip-state-actions-enabled.mjs';

export async function resolveVacationAppQueueIntake(requestText, intakePrefill = null, env = process.env, turnSession = null, { trip } = {}) {
  if (intakePrefill?.classification?.ok === true) {
    const classification = intakePrefill.classification;
    return {
      classification,
      placeSearchTurn: intakePrefill.placeSearchTurn === true || classification.turnKind === 'place_search',
      webResearchTurn: intakePrefill.webResearchTurn === true || classification.turnKind === 'web_research',
      classifierMs: Number(intakePrefill.classifierMs) || 0,
      tripCreateTimings: intakePrefill.tripCreateTimings || null,
    };
  }
  const classifyStarted = Date.now();
  const classified = await classifyVacationAppCustomerTurn(
    requestText,
    env,
    (opts) => classifyTripIntake({ ...opts, requireExtractedTripDates: false, turnSession,
      includePlanningInputs: Boolean(trip?.id && tripStateActionsEnabled({ env, trip })) }),
  );
  return {
    classification: classified.classification,
    placeSearchTurn: classified.placeSearchTurn,
    webResearchTurn: classified.webResearchTurn,
    classifierMs: Date.now() - classifyStarted,
    tripCreateTimings: null,
  };
}
