import { assignedPlaceIds } from './itinerary-minimums.mjs';

function overrideFor(shared, place) {
  return shared?.thingOverrides?.[`place:${place.id}`] || {};
}

function placeHasDayPlacement(place, shared) {
  const dayIds = overrideFor(shared, place).dayIds;
  return (
    Array.isArray(dayIds)
    && dayIds.some((id) => (shared?.days || []).some((day) => String(day.id) === String(id)))
  );
}

export function isTimelineSelectedPlace(place, shared = {}) {
  const override = overrideFor(shared, place);
  if (override.timeline === false) return false;
  if (override.timeline === true) return true;
  const id = Number(place?.id);
  if (id && assignedPlaceIds(shared).has(id)) return true;
  return placeHasDayPlacement(place, shared);
}

export function budgetItineraryPlaces(shared = {}) {
  const seen = new Map();
  const remember = (place) => {
    if (!place || place.id == null) return;
    const id = String(place.id);
    const prev = seen.get(id);
    seen.set(id, prev ? { ...prev, ...place } : place);
  };

  for (const rows of Object.values(shared?.assignments || {})) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = Number(row?.place_id ?? row?.place?.id);
      if (!id) continue;
      const place = (shared.places || []).find((p) => Number(p.id) === id) || row.place;
      if (place && typeof place === 'object') remember(place);
    }
  }

  for (const reservation of shared.reservations || []) {
    const id = Number(reservation?.place_id);
    if (!id) continue;
    const place = (shared.places || []).find((p) => Number(p.id) === id);
    if (place && typeof place === 'object') remember(place);
  }

  for (const place of shared.places || []) {
    if (!isTimelineSelectedPlace(place, shared)) continue;
    remember(place);
  }

  return [...seen.values()];
}
