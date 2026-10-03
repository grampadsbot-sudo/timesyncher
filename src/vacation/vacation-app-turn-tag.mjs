import { classifyTurn, classifyTurnWithModel } from './turn-tags.mjs';
import { normalizePlaceSearchCategory } from './place-search-category-keys.mjs';
import { turnStageTimings } from './turn-stage-timings.mjs';

function placeSearchContentTags(classification, webResearchTurn) {
  if (webResearchTurn) return ['activities_experiences'];
  const cat = normalizePlaceSearchCategory(classification?.category);
  if (cat === 'restaurant') return ['restaurants_food'];
  if (cat === 'grocery' || cat === 'market' || cat === 'store') return ['shopping'];
  if (cat) return ['activities_experiences'];
  return [];
}

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
      payload: {
        ...payload,
        contentTags: (placeSearchTurn || webResearchTurn)
          ? placeSearchContentTags(classification, webResearchTurn)
          : (Array.isArray(payload?.contentTags) ? payload.contentTags : []),
      },
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
