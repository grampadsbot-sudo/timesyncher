import { classifyTurn, classifyTurnWithModel } from './turn-tags.mjs';
import { turnStageTimings } from './turn-stage-timings.mjs';

export async function classifyVacationAppCustomerTurnTag({
  requestText,
  tripId,
  placeSearchTurn = false,
  webResearchTurn = false,
  classification = null,
  payload = {},
  customerLive = null,
} = {}) {
  const intakeTurn = classification?.ok === true && classification?.intake === true;
  const turnTagStarted = Date.now();
  const turnTag = (tripId && (placeSearchTurn || webResearchTurn)) || intakeTurn
    ? classifyTurn({
      text: requestText,
      speaker: 'customer',
      direction: 'inbound',
      channel: 'vacation-app',
      payload,
    })
    : await classifyTurnWithModel({
      text: requestText,
      speaker: 'customer',
      direction: 'inbound',
      channel: 'vacation-app',
      payload,
    });
  const stageTimings = turnStageTimings({
    ...(payload?.stageTimings || {}),
    turnTagMs: Date.now() - turnTagStarted,
  });
  if (payload) payload.stageTimings = stageTimings;
  if (customerLive) customerLive.stageTimings = stageTimings;
  return { turnTag, turnTagMs: stageTimings.turnTagMs, stageTimings };
}
