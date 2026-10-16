import { flightSchedule } from './listTabModel.mjs';

const CLOCK_RANGE_RE =
  /\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[–—-]\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)(?:\+\d+)?\b/i;

function text(value) {
  return String(value ?? '').trim();
}

function clockRangeFromText(value) {
  const match = String(value || '').match(CLOCK_RANGE_RE);
  if (!match) return null;
  const endMeridiem = (String(match[2]).match(/(am|pm)/i) || [])[1];
  const startHasMeridiem = /(am|pm)/i.test(match[1]);
  const start = (!startHasMeridiem && endMeridiem ? `${match[1]} ${endMeridiem}` : match[1]).trim();
  return { start, end: match[2].trim() };
}

function usableRange(range, parseClock) {
  if (!range) return null;
  if (parseClock(range.start) == null || parseClock(range.end) == null) return null;
  return range;
}

function flightClockRange(place, trip, parseClock) {
  const schedule = flightSchedule(place, trip);
  const explicit = usableRange({ start: schedule.depart, end: schedule.arrive }, parseClock);
  if (explicit) return explicit;
  const override = trip?.thingOverrides?.[`place:${place.id}`] || {};
  const source = override.sourceRecord || place.sourceRecord || {};
  const blobs = [
    place.name,
    place.title,
    place.description,
    override.longDetails,
    override.details,
    override.summary,
    source.description,
    source.longDetails,
    source.summary,
    source.details,
  ];
  for (const blob of blobs) {
    const range = usableRange(clockRangeFromText(blob), parseClock);
    if (range) return range;
  }
  return null;
}

function wrapDayMinutes(total) {
  return ((Math.round(total) % 1440) + 1440) % 1440;
}

function leg(place, id, title, startMin, formatClock) {
  return {
    kind: 'travel',
    id,
    place,
    title,
    startMin,
    startLabel: formatClock(startMin),
    durationMin: 90,
    travelMinutes: 90,
    category: 'transport',
  };
}

export function airportTransferLegs(place, trip, parseClock, formatClock) {
  const range = flightClockRange(place, trip, parseClock);
  if (!range) return null;
  const startMin = parseClock(range.start);
  const endMin = parseClock(range.end);
  return {
    depart: text(range.start),
    arrive: text(range.end),
    startMin,
    endMin,
    to: leg(place, `airport-to-${place.id}`, 'Travel to airport', wrapDayMinutes(startMin - 90), formatClock),
    from: leg(place, `airport-from-${place.id}`, 'Travel from airport', endMin, formatClock),
  };
}
