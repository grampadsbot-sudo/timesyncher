import {
  flightPriceDisplay,
  flightSchedule,
  placeName,
  rowSummary,
  tabCategoryKey,
} from './listTabModel.mjs';

function flightDurationMinutes(depart, arrive, parseClockToMinutes) {
  const start = parseClockToMinutes(depart);
  const end = parseClockToMinutes(arrive);
  if (start == null || end == null) return null;
  let delta = end - start;
  if (delta <= 0) delta += 24 * 60;
  return delta;
}

export function pushFlightRows(entries, trip, day, dayId, {
  resolvePlace,
  overrideFor,
  parseClockToMinutes,
  parseDurationMinutes,
}) {
  const seen = new Set();
  const pushFlight = (place) => {
    const override = overrideFor(trip, place);
    const id = String(place.id);
    if (seen.has(id) || !override.timeline || tabCategoryKey(place, trip) !== 'flight') return;
    seen.add(id);
    const { depart, arrive } = flightSchedule(place, trip);
    entries.push({
      kind: 'flight',
      id: `flight-${place.id}`,
      place,
      title: placeName(place),
      startMin: parseClockToMinutes(depart),
      startLabel: depart,
      endLabel: arrive,
      durationMin:
        parseDurationMinutes(override.duration) ??
        flightDurationMinutes(depart, arrive, parseClockToMinutes) ??
        null,
      category: 'flight',
      fare: flightPriceDisplay(place, trip),
      summary: rowSummary(place, trip),
    });
  };
  for (const row of trip.assignments?.[dayId] || []) {
    const place = resolvePlace(row, trip);
    if (place) pushFlight(place);
  }
  for (const place of trip.places || []) {
    const override = overrideFor(trip, place);
    if (!override.timeline || tabCategoryKey(place, trip) !== 'flight') continue;
    const dayIds = Array.isArray(override.dayIds) ? override.dayIds.map(String) : [];
    if (!dayIds.length) continue;
    if (!dayIds.includes(String(day.id))) continue;
    pushFlight(place);
  }
}
