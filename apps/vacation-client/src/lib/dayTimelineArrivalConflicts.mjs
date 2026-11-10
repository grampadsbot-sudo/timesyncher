import { placeName, tabCategoryKey } from './listTabModel.mjs';

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

const NEVER_FLAG_KINDS = new Set([
  'travel',
  'hotel-wake',
  'hotel-sleep',
]);

function flightLandingMinutes(entry) {
  if (entry.kind !== 'flight') return null;
  if (entry.startMin != null && entry.durationMin != null) {
    return entry.startMin + entry.durationMin;
  }
  if (entry.startMin != null && entry.endLabel) {
    const endMatch = text(entry.endLabel).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (endMatch) {
      let hours = Number(endMatch[1]);
      const minutes = endMatch[2] != null ? Number(endMatch[2]) : 0;
      const meridiem = endMatch[3];
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
  }
  return null;
}

function text(value) {
  return String(value ?? '').trim();
}

function isArrivalDayFlight(entry, trip) {
  if (entry.kind !== 'flight' || !entry.place) return false;
  if (flightLandingMinutes(entry) == null) return false;
  const override = overrideFor(trip, entry.place);
  return tabCategoryKey(entry.place, trip) === 'flight' || text(override.category).toLowerCase() === 'flight';
}

function endMinutes(entry) {
  if (entry.startMin == null || entry.durationMin == null) return null;
  return entry.startMin + entry.durationMin;
}

function entrySpanEnd(entry) {
  if (entry.startMin == null) return null;
  const spanEnd = endMinutes(entry);
  return spanEnd != null ? spanEnd : entry.startMin;
}

export function markTimelineConflicts(entries, trip) {
  const timed = entries.filter((entry) => entry.startMin != null);
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (a.startMin === b.startMin) {
        a.conflictWith = b.title;
        b.conflictWith = a.title;
        continue;
      }
      const aEnd = entrySpanEnd(a);
      const bEnd = entrySpanEnd(b);
      if (aEnd == null || bEnd == null) continue;
      if (a.startMin < bEnd && b.startMin < aEnd) {
        a.conflictWith = b.title;
        b.conflictWith = a.title;
      }
    }
  }
  markArrivalDayLandingConflicts(entries, trip);
}

export function markArrivalDayLandingConflicts(entries, trip) {
  const flights = entries.filter((entry) => isArrivalDayFlight(entry, trip));
  if (!flights.length) return;
  const flight = flights.reduce((best, row) => {
    const landing = flightLandingMinutes(row);
    if (landing == null) return best;
    if (!best) return row;
    const bestLanding = flightLandingMinutes(best);
    return landing >= (bestLanding ?? -1) ? row : best;
  }, null);
  if (!flight) return;
  const landingMin = flightLandingMinutes(flight);
  if (landingMin == null) return;
  const flightTitle = text(flight.title) || (flight.place ? placeName(flight.place) : 'your flight');

  for (const entry of entries) {
    if (NEVER_FLAG_KINDS.has(entry.kind)) continue;
    if (entry.kind === 'flight') continue;
    if (entry.startMin == null) continue;
    if (entry.startMin >= landingMin) continue;
    if (!entry.conflictWith) {
      entry.conflictWith = flightTitle;
    }
  }
}

export function conflictLabelFitsViewport(labelEl, viewportWidth = 390) {
  if (!labelEl) return false;
  return labelEl.scrollWidth <= viewportWidth;
}
