export function parseClockRangeFromText(raw) {
  const source = String(raw ?? '');
  const match = source.match(
    /\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[–—-]\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)(?:\+\d+)?\b/i,
  );
  if (!match) return null;
  const endMeridiem = String(match[2]).match(/(am|pm)/i)?.[1];
  let start = String(match[1]).trim();
  if (!/(am|pm)/i.test(start) && endMeridiem) {
    start = `${start} ${endMeridiem}`;
  }
  return { start, end: String(match[2]).trim() };
}

export function flightScheduleRangeFromItem(place, override = {}) {
  const depart = String(
    override.departureTime || override.departTime || '',
  ).trim();
  const arrive = String(
    override.arrivalTime || override.arriveTime || '',
  ).trim();
  if (depart && arrive) {
    return { start: depart, end: arrive };
  }
  const source = override.sourceRecord && typeof override.sourceRecord === 'object'
    ? override.sourceRecord
    : place?.sourceRecord && typeof place.sourceRecord === 'object'
      ? place.sourceRecord
      : {};
  const haystack = [
    override.title,
    place?.name,
    place?.title,
    source.ccabKey,
    override.summary,
    place?.description,
  ]
    .filter(Boolean)
    .join(' ');
  return parseClockRangeFromText(haystack);
}

const IN_TRANSIT_SKIP = new Set([
  'travel',
  'flight',
  'hotel-wake',
  'hotel-sleep',
]);

function entryEndMinutes(entry) {
  if (entry.startMin == null) return null;
  if (entry.durationMin != null) return entry.startMin + entry.durationMin;
  if (entry.endMin != null) return entry.endMin;
  return entry.startMin + 1;
}

export function resolveFlightTimelineTimes(place, trip, override, helpers) {
  const { flightSchedule, parseClockToMinutes, parseDurationMinutes, flightDurationMinutes } =
    helpers;
  const { depart, arrive } = flightSchedule(place, trip);
  const parsedRange =
    depart && arrive ? null : flightScheduleRangeFromItem(place, override);
  const flightDepart = depart || parsedRange?.start || '';
  const flightArrive = arrive || parsedRange?.end || '';
  const arriveMin = parseClockToMinutes(flightArrive);
  return {
    flightDepart,
    flightArrive,
    startMin: parseClockToMinutes(flightDepart),
    endMin: arriveMin,
    durationMin:
      parseDurationMinutes(override.duration) ??
      flightDurationMinutes(flightDepart, flightArrive) ??
      null,
  };
}

export function applyDayTimelineConflictFlags(entries) {
  const timed = entries.filter((entry) => entry.startMin != null && entry.kind !== 'flight');
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (a.startMin === b.startMin) {
        a.conflictWith = b.title;
        b.conflictWith = a.title;
        continue;
      }
      const aEnd = a.durationMin != null ? a.startMin + a.durationMin : null;
      const bEnd = b.durationMin != null ? b.startMin + b.durationMin : null;
      if (aEnd == null || bEnd == null) continue;
      if (a.startMin < bEnd && b.startMin < aEnd) {
        a.conflictWith = b.title;
        b.conflictWith = a.title;
      }
    }
  }
  markInTransitFlightConflicts(entries);
  for (const entry of entries) {
    if (entry.kind === 'flight') delete entry.conflictWith;
  }
  return entries;
}

function markInTransitFlightConflicts(entries) {
  const flights = entries.filter((entry) => entry.kind === 'flight' && entry.startMin != null);
  if (!flights.length) return entries;
  const flight = flights[0];
  const flightStart = flight.startMin;
  const flightEnd = entryEndMinutes(flight);
  if (flightEnd == null) return entries;
  const flightTitle = flight.title;
  for (const entry of entries) {
    if (IN_TRANSIT_SKIP.has(entry.kind) || entry.startMin == null) continue;
    if (entry.conflictWith) continue;
    const entryEnd = entryEndMinutes(entry);
    if (entryEnd == null) continue;
    if (entry.startMin < flightEnd && entryEnd > flightStart) {
      entry.conflictWith = flightTitle;
    }
  }
  return entries;
}
