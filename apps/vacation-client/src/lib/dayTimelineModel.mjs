import {
  flightPriceDisplay,
  flightSchedule,
  hotelFirstRowNote,
  placeName,
  rowSummary,
  tabCategoryKey,
} from './listTabModel.mjs';
import { dayItineraryHeading, flightTimelineTitle } from './dayTimelinePresentation.mjs';
import { mapPlacesForTimeline, placeCoords } from './dayTimelineMap.mjs';

export { dayItineraryHeading, flightTimelineTitle } from './dayTimelinePresentation.mjs';
export { mapPlacesForTimeline, placeCoords } from './dayTimelineMap.mjs';
function text(value) {
  return String(value ?? '').trim();
}
function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}
export function resolvePlace(row, trip) {
  const id = row?.place_id ?? row?.place?.id;
  const catalog = (trip.places || []).find((p) => String(p.id) === String(id));
  if (row?.place && typeof row.place === 'object') {
    return catalog ? { ...catalog, ...row.place } : row.place;
  }
  return catalog;
}
export function sortedDays(trip) {
  return [...(trip?.days || [])].sort(
    (a, b) => Number(a.day_number ?? 0) - Number(b.day_number ?? 0),
  );
}
export function dayChipLabel(day) {
  const title = text(day?.title);
  if (title) return title;
  if (day?.day_number != null) return `Day ${day.day_number}`;
  return 'Day';
}
export function parseDurationMinutes(raw) {
  const s = text(raw).toLowerCase();
  if (!s) return null;
  let total = 0;
  const hours = s.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|r)?\b/);
  const minutes = s.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/);
  if (hours) total += Number(hours[1]) * 60;
  if (minutes) total += Number(minutes[1]);
  if (hours || minutes) return Math.round(total);
  const match = s.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}
export function parseClockToMinutes(clock) {
  let s = text(clock).toLowerCase();
  if (!s) return null;
  const rangeMatch = s.match(/^(.+?)\s*[-–—]\s*.+$/);
  if (rangeMatch) s = text(rangeMatch[1]);
  s = s.replace(/\./g, '');
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] != null ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}
export function formatClockMinutes(totalMinutes) {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return '';
  const normalized = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const meridiem = hours24 >= 12 ? 'pm' : 'am';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  if (minutes === 0) return `${hours12} ${meridiem}`;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}
function scheduleForDay(place, trip, dayId) {
  const override = overrideFor(trip, place);
  const perDay =
    override.perDaySchedule && typeof override.perDaySchedule === 'object'
      ? override.perDaySchedule[String(dayId)]
      : null;
  if (perDay && typeof perDay === 'object') {
    return {
      startTime: text(perDay.startTime || perDay.time),
      durationMin: parseDurationMinutes(perDay.duration),
    };
  }
  const category = tabCategoryKey(place, trip);
  if (category === 'flight') {
    const { depart } = flightSchedule(place, trip);
    return { startTime: depart, durationMin: parseDurationMinutes(override.duration) };
  }
  if (text(override.startTime)) {
    return {
      startTime: text(override.startTime),
      durationMin: parseDurationMinutes(override.duration),
    };
  }
  if (text(place.place_time)) {
    return {
      startTime: text(place.place_time),
      durationMin: parseDurationMinutes(override.duration),
    };
  }
  return { startTime: '', durationMin: parseDurationMinutes(override.duration) };
}
function carSpanDayNumbers(place, trip) {
  const override = overrideFor(trip, place);
  const dayIds = Array.isArray(override.dayIds) ? override.dayIds : [];
  const days = sortedDays(trip);
  const numbers = dayIds
    .map((id) => days.find((day) => String(day.id) === String(id))?.day_number)
    .filter((value) => value != null)
    .map(Number);
  if (!numbers.length) return null;
  return { start: Math.min(...numbers), end: Math.max(...numbers) };
}
function assignmentDayNumbers(place, trip) {
  const placeId = String(place.id);
  const days = sortedDays(trip);
  const numbers = [];
  for (const day of days) {
    const rows = trip.assignments?.[String(day.id)] || [];
    if (rows.some((row) => String(row.place_id ?? row.place?.id) === placeId)) {
      if (day.day_number != null) numbers.push(Number(day.day_number));
    }
  }
  if (!numbers.length) return null;
  numbers.sort((a, b) => a - b);
  return { start: numbers[0], end: numbers[numbers.length - 1] };
}

function hotelStayDayNumbers(place, trip) {
  const span = carSpanDayNumbers(place, trip) || assignmentDayNumbers(place, trip);
  if (span) return span;
  const override = overrideFor(trip, place);
  const source = override.sourceRecord || place.sourceRecord || {};
  const explicit = Number(override.stayDays ?? source.stayDays);
  const days = sortedDays(trip);
  if (Number.isFinite(explicit) && explicit > 0 && days.length) {
    const start = Number(days[0].day_number ?? 1);
    return { start, end: start + Math.round(explicit) - 1 };
  }
  const checkIn = text(override.checkInDate || source.checkInDate || source.check_in_date);
  const checkOut = text(override.checkOutDate || source.checkOutDate || source.check_out_date);
  if (checkIn && checkOut && days.length) {
    const startDay = days.find((day) => text(day.date) === checkIn);
    const endDay = days.find((day) => text(day.date) === checkOut);
    if (startDay?.day_number != null && endDay?.day_number != null) {
      const start = Number(startDay.day_number);
      const end = Math.max(start, Number(endDay.day_number) - 1);
      return { start, end };
    }
  }
  return null;
}

function hotelCheckInTime(place, trip) {
  const override = overrideFor(trip, place);
  const source = override.sourceRecord || place.sourceRecord || {};
  return text(override.checkInTime || source.checkInTime || source.check_in_time || '16:00');
}

function hotelCheckOutTime(place, trip) {
  const override = overrideFor(trip, place);
  const source = override.sourceRecord || place.sourceRecord || {};
  return text(override.checkOutTime || source.checkOutTime || source.check_out_time || '11:00');
}

function flightDurationMinutes(depart, arrive) {
  const start = parseClockToMinutes(depart);
  const end = parseClockToMinutes(arrive);
  if (start == null || end == null) return null;
  let delta = end - start;
  if (delta <= 0) delta += 24 * 60;
  return delta;
}

export function mediaForPlace(trip, place) {
  const placeId = Number(place?.id);
  if (!Number.isFinite(placeId)) return [];
  const fromTrip = (trip?.media || []).filter((row) => {
    const thingId = Number(row?.thingId ?? row?.thing_id ?? row?.place_id);
    return thingId === placeId;
  });
  if (fromTrip.length) return fromTrip;
  const bound = place?.photos || place?.bound_media || place?.media;
  return Array.isArray(bound) ? bound : [];
}

function haversineMiles(from, to) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (deg) => (deg * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

export function estimateTravelMinutes(fromPlace, toPlace) {
  if (typeof fromPlace?.lat !== 'number' || typeof fromPlace?.lng !== 'number') return null;
  if (typeof toPlace?.lat !== 'number' || typeof toPlace?.lng !== 'number') return null;
  const miles = haversineMiles(
    { lat: fromPlace.lat, lng: fromPlace.lng },
    { lat: toPlace.lat, lng: toPlace.lng },
  );
  const rawMinutes = Math.round((miles / 25) * 60);
  return Math.max(5, Math.round(rawMinutes / 5) * 5);
}

export function itineraryNoteFor(place, trip, assignmentNotes) {
  const override = overrideFor(trip, place);
  return text(
    override.itineraryNote ||
      override.itinerary_note ||
      assignmentNotes ||
      override.notes,
  );
}

function endMinutes(entry) {
  if (entry.startMin == null || entry.durationMin == null) return null;
  return entry.startMin + entry.durationMin;
}

function markConflicts(entries) {
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
      const aEnd = endMinutes(a);
      const bEnd = endMinutes(b);
      if (aEnd == null || bEnd == null) continue;
      if (a.startMin < bEnd && b.startMin < aEnd) {
        a.conflictWith = b.title;
        b.conflictWith = a.title;
      }
    }
  }
}

function pushCarRows(entries, trip, day) {
  const dayNumber = Number(day.day_number);
  for (const place of trip.places || []) {
    const override = overrideFor(trip, place);
    if (!override.timeline || tabCategoryKey(place, trip) !== 'car') continue;
    const span = carSpanDayNumbers(place, trip);
    if (!span) continue;
    const schedule = scheduleForDay(place, trip, day.id);
    const startMin = parseClockToMinutes(schedule.startTime);
    const durationMin = schedule.durationMin ?? 45;
    const company = text(override.rentalCompany || placeName(place));
    if (dayNumber === span.start) {
      entries.push({
        kind: 'car-pickup',
        id: `car-pickup-${place.id}`,
        place,
        title: `Pickup: ${company}`,
        startMin,
        startLabel: schedule.startTime,
        durationMin,
        category: 'car',
      });
    }
    if (dayNumber === span.end) {
      entries.push({
        kind: 'car-dropoff',
        id: `car-dropoff-${place.id}`,
        place,
        title: `Drop-off: ${company}`,
        startMin,
        startLabel: schedule.startTime,
        durationMin,
        category: 'car',
      });
    }
  }
}

function pushHotelRows(entries, trip, day) {
  const dayNumber = Number(day.day_number);
  const firstTimelineHotelId = (trip.places || []).find((place) => {
    const override = overrideFor(trip, place);
    return override.timeline && tabCategoryKey(place, trip) === 'hotel';
  })?.id;
  for (const place of trip.places || []) {
    const override = overrideFor(trip, place);
    if (!override.timeline || tabCategoryKey(place, trip) !== 'hotel') continue;
    const span = hotelStayDayNumbers(place, trip);
    if (!span) continue;
    const name = placeName(place);
    const note =
      dayNumber === span.start
        ? hotelFirstRowNote(
            place,
            trip,
            String(place.id) === String(firstTimelineHotelId),
          ) || itineraryNoteFor(place, trip, '')
        : '';

    if (dayNumber > span.start && dayNumber <= span.end + 1) {
      entries.push({
        kind: 'hotel-wake',
        id: `hotel-wake-${place.id}-${day.id}`,
        place,
        title: `Wake: ${name}`,
        category: 'hotel',
      });
    }
    if (dayNumber === span.start) {
      const checkIn = hotelCheckInTime(place, trip);
      entries.push({
        kind: 'hotel-event',
        id: `hotel-checkin-${place.id}`,
        place,
        title: `Check-in: ${name}`,
        startMin: parseClockToMinutes(checkIn),
        startLabel: checkIn,
        durationMin: 30,
        category: 'hotel',
        itineraryNote: note,
      });
    }
    if (dayNumber >= span.start && dayNumber <= span.end) {
      entries.push({
        kind: 'hotel-sleep',
        id: `hotel-sleep-${place.id}-${day.id}`,
        place,
        title: `Bed: ${name}`,
        category: 'hotel',
      });
    }
    if (dayNumber === span.end + 1) {
      const checkOut = hotelCheckOutTime(place, trip);
      entries.push({
        kind: 'hotel-checkout',
        id: `hotel-checkout-${place.id}`,
        place,
        title: `Check-out: ${name}`,
        startMin: parseClockToMinutes(checkOut),
        startLabel: checkOut,
        durationMin: 60,
        category: 'hotel',
      });
    }
  }
}

function pushFlightRows(entries, trip, day, dayId) {
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
      title: flightTimelineTitle(place, trip),
      startMin: parseClockToMinutes(depart),
      startLabel: depart,
      endLabel: arrive,
      durationMin:
        parseDurationMinutes(override.duration) ??
        flightDurationMinutes(depart, arrive) ??
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

const TRAVEL_GAP_SKIP = new Set([
  'travel',
  'hotel-wake',
  'hotel-sleep',
  'hotel-event',
  'hotel-checkout',
  'flight',
]);

function insertTravelRows(entries, trip) {
  const withTravel = [];
  let previous = null;
  for (const entry of entries) {
    if (
      previous?.place &&
      entry.place &&
      !TRAVEL_GAP_SKIP.has(entry.kind) &&
      !TRAVEL_GAP_SKIP.has(previous.kind)
    ) {
      const prevCategory = tabCategoryKey(previous.place, trip);
      const nextCategory = tabCategoryKey(entry.place, trip);
      if (
        prevCategory !== 'flight' &&
        nextCategory !== 'flight' &&
        typeof previous.place.lat === 'number' &&
        typeof entry.place.lat === 'number'
      ) {
        const travelMinutes = estimateTravelMinutes(previous.place, entry.place);
        if (travelMinutes != null) {
          withTravel.push({
            kind: 'travel',
            id: `travel-${previous.id}-${entry.id}`,
            title: `Travel to ${placeName(entry.place)}`,
            durationMin: travelMinutes,
            travelMinutes,
          });
        }
      }
    }
    withTravel.push(entry);
    if (entry.kind !== 'travel' && !TRAVEL_GAP_SKIP.has(entry.kind)) previous = entry;
  }
  return withTravel;
}

export function buildDayTimeline(trip, day) {
  const dayId = String(day.id);
  const entries = [];
  for (const [rowIndex, row] of (trip.assignments?.[dayId] || []).entries()) {
    const place = resolvePlace(row, trip);
    if (!place) continue;
    const override = overrideFor(trip, place);
    if (!override.timeline) continue;
    const category = tabCategoryKey(place, trip);
    if (category === 'car' || category === 'hotel' || category === 'flight') continue;
    const schedule = scheduleForDay(place, trip, dayId);
    entries.push({
      kind: 'thing',
      id: `place-${place.id}-${rowIndex}`,
      place,
      title: placeName(place),
      startMin: parseClockToMinutes(schedule.startTime),
      startLabel: schedule.startTime,
      durationMin: schedule.durationMin,
      assignmentNotes: row.notes,
      category,
      summary: rowSummary(place, trip),
      itineraryNote: itineraryNoteFor(place, trip, row.notes),
      media: mediaForPlace(trip, place),
    });
  }
  pushHotelRows(entries, trip, day);
  pushFlightRows(entries, trip, day, dayId);
  pushCarRows(entries, trip, day);
  entries.sort((a, b) => {
    const aMin = a.startMin ?? 10_000 + entries.indexOf(a);
    const bMin = b.startMin ?? 10_000 + entries.indexOf(b);
    return aMin - bMin;
  });
  const withTravel = insertTravelRows(entries, trip);
  markConflicts(withTravel);
  return withTravel;
}

export function shiftDayIndex(trip, currentIndex, delta) {
  const days = sortedDays(trip);
  if (!days.length) return 0;
  const next = currentIndex + delta;
  if (next < 0) return 0;
  if (next >= days.length) return days.length - 1;
  return next;
}

export function timeRangeLabel(entry) {
  if (entry.kind === 'travel') {
    return entry.travelMinutes != null ? `${entry.travelMinutes} min travel` : 'Travel';
  }
  if (entry.kind === 'flight' && entry.endLabel) {
    const start = entry.startLabel || formatClockMinutes(entry.startMin);
    return start ? `${start} – ${entry.endLabel}` : entry.endLabel;
  }
  const start = entry.startLabel || formatClockMinutes(entry.startMin);
  if (!start) return '';
  if (entry.durationMin != null && entry.startMin != null) {
    const end = formatClockMinutes(entry.startMin + entry.durationMin);
    return `${start} – ${end} · ${entry.durationMin} min`;
  }
  if (entry.durationMin != null) {
    return `${start} · ${entry.durationMin} min`;
  }
  return start;
}
