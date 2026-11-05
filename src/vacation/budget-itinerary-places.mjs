import { buildDayTimeline } from '../../apps/vacation-client/src/lib/dayTimelineModel.mjs';

export function isTimelineSelectedPlace(place, shared = {}) {
  return budgetItineraryPlaces(shared).some((row) => String(row.id) === String(place?.id));
}

export function budgetItineraryPlaces(shared = {}) {
  const seen = new Map();
  for (const day of shared.days || []) {
    for (const row of buildDayTimeline(shared, day)) {
      if (!row.place || row.kind === 'travel') continue;
      seen.set(String(row.place.id), row.place);
    }
  }
  return [...seen.values()];
}
