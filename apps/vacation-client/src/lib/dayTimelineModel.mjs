/** Day-by-day timeline: schedule rows, travel gaps, car pickup/drop-off, map markers. */

import {
  flightSchedule,
  placeName,
  rowSummary,
  tabCategoryKey,
} from './listTabModel.mjs';

function placeAssignedToDay(place, trip, day) {
  const dayId = String(day.id);
  const override = overrideFor(trip, place);
  const dayIds = Array.isArray(override.dayIds) ? override.dayIds.map(String) : [];
  if (dayIds.includes(dayId)) return true;
  return (trip.assignments?.[dayId] || []).some(
    (row) => String(row.place_id ?? row.place?.id) === String(place.id),
  );
}

function text(value) {
  return String(value ?? '').trim();
}

function overrideFor(trip, place) {
  return trip?.thingOverrides?.[`place:${place.id}`] || {};
}

function resolvePlace(row, trip) {
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

/** In-card heading must include “Day N” for Gate B itinerary checks. */
export function dayItineraryHeading(day) {
  const title = text(day?.title);
  const number = day?.day_number;
  if (number != null) {
    if (title && !new RegExp(`\\bDay\\s+${number}\\b`, 'i').test(title)) {
      return `Day ${number} · ${title}`;
    }
    if (title) return title;
    return `Day ${number}`;
  }
  return title || 'Day';
}

export function parseDurationMinutes(raw) {
  const s = text(raw);
  if (!s) return null;
  const match = s.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function parseClockToMinutes(clock) {
  const s = text(clock).toLowerCase();
  if (!s) return null;
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
  if (entry.startMin == null) return null;
  const duration = entry.durationMin ?? 60;
  return entry.startMin + duration;
}

function markConflicts(entries) {
  const timed = entries.filter((entry) => entry.startMin != null);
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
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
    if (dayNumber === span.end && span.end !== span.start) {
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

function insertTravelRows(entries, trip) {
  const withTravel = [];
  let previous = null;
  for (const entry of entries) {
    if (
      previous?.place &&
      entry.place &&
      entry.kind !== 'travel' &&
      previous.kind !== 'travel'
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
    if (entry.kind !== 'travel') previous = entry;
  }
  return withTravel;
}

/** @typedef {'thing'|'travel'|'car-pickup'|'car-dropoff'} TimelineEntryKind */

/**
 * @param {import('../types/sharedTrip.ts').SharedTripPayload} trip
 * @param {import('../types/sharedTrip.ts').SharedDay} day
 */
export function buildDayTimeline(trip, day) {
  const dayId = String(day.id);
  const entries = [];
  for (const row of trip.assignments?.[dayId] || []) {
    const place = resolvePlace(row, trip);
    if (!place) continue;
    const override = overrideFor(trip, place);
    if (override.timeline === false) continue;
    const category = tabCategoryKey(place, trip);
    if (category === 'car') continue;
    const schedule = scheduleForDay(place, trip, dayId);
    entries.push({
      kind: category === 'flight' ? 'flight' : 'thing',
      id: `place-${place.id}`,
      place,
      title: placeName(place),
      startMin: parseClockToMinutes(schedule.startTime),
      startLabel: schedule.startTime,
      durationMin: schedule.durationMin,
      assignmentNotes: row.notes,
      category,
      summary: rowSummary(place, trip),
      itineraryNote: itineraryNoteFor(place, trip, row.notes),
    });
  }
  pushCarRows(entries, trip, day);
  const seenPlaceIds = new Set(
    entries.map((entry) => entry.place?.id).filter((id) => id != null).map(String),
  );
  for (const place of trip.places || []) {
    if (tabCategoryKey(place, trip) !== 'flight') continue;
    const override = overrideFor(trip, place);
    if (override.timeline === false) continue;
    if (!placeAssignedToDay(place, trip, day)) continue;
    const key = String(place.id);
    if (seenPlaceIds.has(key)) continue;
    seenPlaceIds.add(key);
    const schedule = scheduleForDay(place, trip, dayId);
    entries.push({
      kind: 'flight',
      id: `flight-${place.id}`,
      place,
      title: placeName(place),
      startMin: parseClockToMinutes(schedule.startTime),
      startLabel: schedule.startTime,
      durationMin: schedule.durationMin,
      category: 'flight',
      summary: rowSummary(place, trip),
    });
  }
  entries.sort((a, b) => {
    const aMin = a.startMin ?? 10_000 + entries.indexOf(a);
    const bMin = b.startMin ?? 10_000 + entries.indexOf(b);
    return aMin - bMin;
  });
  const withTravel = insertTravelRows(entries, trip);
  markConflicts(withTravel);
  return withTravel;
}

function placeCoords(place, trip) {
  const override = overrideFor(trip, place);
  const lat = typeof place.lat === 'number' ? place.lat : Number(override.lat);
  const lng = typeof place.lng === 'number' ? place.lng : Number(override.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function mapPlacesForTimeline(trip, entries) {
  const seen = new Set();
  const markers = [];
  for (const entry of entries) {
    if (entry.kind === 'travel' || !entry.place) continue;
    const category = tabCategoryKey(entry.place, trip);
    if (category === 'flight' || category === 'car') continue;
    const coords = placeCoords(entry.place, trip);
    if (!coords) continue;
    const key = String(entry.place.id);
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push({ ...entry.place, lat: coords.lat, lng: coords.lng });
  }
  return markers;
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
  const start = entry.startLabel || formatClockMinutes(entry.startMin);
  if (!start) return '';
  if (entry.durationMin != null) {
    const end = formatClockMinutes((entry.startMin ?? 0) + entry.durationMin);
    return `${start} – ${end} · ${entry.durationMin} min`;
  }
  return start;
}
