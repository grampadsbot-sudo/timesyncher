import { assignDatesScheduling } from './intake-shared-trip.mjs';
import { activeCollaboratorsFromParty } from './reply-action-claim.mjs';
import { insertTripThing } from './trip-things.mjs';

function clean(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isoDay(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function addDays(iso, count) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function eachDate(start, end) {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const dates = [];
  for (let cursor = start; cursor <= last && dates.length < 21; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

function titleOverlap(savedTitle, extractedName) {
  const saved = clean(savedTitle, 240).toLowerCase();
  const extracted = clean(extractedName, 240).toLowerCase();
  if (!saved || !extracted) return false;
  return saved.includes(extracted) || extracted.includes(saved);
}

export function whenStampFromClassification(classification, savedTitle = '') {
  const things = classification?.ok === true && Array.isArray(classification.things) ? classification.things : [];
  const entries = things
    .map((item) => ({
      name: clean(item?.name || item?.title, 180),
      when: clean(item?.when || item?.whenLabel, 180),
    }))
    .filter((item) => item.when);
  if (!entries.length) return { whenLabel: '', customerWhen: '' };

  const matched = entries.filter((item) => titleOverlap(savedTitle, item.name));
  if (matched.length === 1) return { whenLabel: matched[0].when, customerWhen: '' };
  if (matched.length > 1) {
    const unique = [...new Set(matched.map((item) => item.when))];
    if (unique.length === 1) return { whenLabel: unique[0], customerWhen: '' };
    return { whenLabel: '', customerWhen: '' };
  }

  const uniqueWhens = [...new Set(entries.map((item) => item.when))];
  if (uniqueWhens.length === 1) return { whenLabel: uniqueWhens[0], customerWhen: '' };
  return { whenLabel: '', customerWhen: '' };
}

export function stampChatSavedPlaceThing(thing, classification) {
  const stamp = whenStampFromClassification(classification, thing?.title);
  if (!stamp.whenLabel && !stamp.customerWhen) return thing;
  const meta = thing?.metadata && typeof thing.metadata === 'object' && !Array.isArray(thing.metadata) ? thing.metadata : {};
  return {
    ...thing,
    metadata: {
      ...meta,
      whenLabel: stamp.whenLabel,
      customerWhen: stamp.customerWhen,
    },
  };
}

export function chatPlaceSearchSavedReplyFacts(savedThings = [], tripStart = '', tripEnd = '') {
  const start = isoDay(tripStart);
  const end = isoDay(tripEnd) || start;
  const tripDates = eachDate(start, end);
  const year = start ? Number(start.slice(0, 4)) : null;
  const unscheduled = [];
  const scheduled = [];
  for (const item of Array.isArray(savedThings) ? savedThings : []) {
    const title = clean(item?.title, 240);
    if (!title) continue;
    const record = {
      title,
      whenLabel: clean(item?.whenLabel, 180),
      customerWhen: clean(item?.customerWhen, 180),
    };
    const { dates, weekdayAmbiguous, candidateDates } = assignDatesScheduling(record, year, tripDates);
    if (!dates.length) {
      unscheduled.push({
        title,
        ...(weekdayAmbiguous ? { weekdayAmbiguous: true, candidateDates } : {}),
      });
    } else scheduled.push({ title, dates });
  }
  if (!unscheduled.length && !scheduled.length) return null;
  return { chatPlaceSearch: { unscheduled, scheduled } };
}

export function vacationAppReplyClaimContext(trip, placeSearchReplyFacts) {
  const meta = trip?.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  const party = meta.dialogParty && typeof meta.dialogParty === 'object' ? meta.dialogParty : {};
  const unscheduledChatPlaceTitles = unscheduledChatPlaceTitlesFromReplyFacts(placeSearchReplyFacts);
  return {
    activeCollaborators: activeCollaboratorsFromParty(party),
    ...(unscheduledChatPlaceTitles.length ? { unscheduledChatPlaceTitles } : {}),
  };
}

function unscheduledChatPlaceTitlesFromReplyFacts(placeSearchReplyFacts) {
  const rows = placeSearchReplyFacts?.chatPlaceSearch?.unscheduled;
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row) => clean(row?.title, 240)).filter(Boolean);
}

function inTurnPlaceResultFromTripThing(inserted) {
  const name = String(inserted?.title || '').trim();
  const id = String(inserted?.id || '').trim();
  if (!name || !id) return null;
  return { name, title: name, sourceRef: { source: 'trip_thing', id } };
}

export function workerInputAfterInTurnPlaceSearch({
  customerId,
  tripId,
  requestId,
  queuedJobType,
  requestText,
  payload,
  jobFields,
}) {
  return {
    customerId,
    tripId,
    requestId,
    source: 'vacation-app',
    requestType: queuedJobType,
    requestText,
    payload,
    intakeEvent: jobFields.intakeEvent,
    wantedThings: [],
    roster: jobFields.roster,
    rosterError: jobFields.rosterError,
    destination: jobFields.destination,
    hasDates: jobFields.hasDates,
    startDate: jobFields.startDate,
    endDate: jobFields.endDate,
    title: jobFields.title,
    titleError: jobFields.titleError,
    intakeError: jobFields.intakeError,
    placeSearchHandledInTurn: true,
  };
}

export async function insertStampedChatPlaceThings(db, { tripId, requestId, things, classification }) {
  const tripDateRows = await db`
    select start_date, end_date
    from trips
    where id = ${tripId}
    limit 1
  `;
  const tripStart = tripDateRows[0]?.start_date || '';
  const tripEnd = tripDateRows[0]?.end_date || '';
  const placeResults = [];
  const savedForFacts = [];
  for (const thing of Array.isArray(things) ? things : []) {
    const stamped = stampChatSavedPlaceThing(thing, classification);
    const meta = stamped?.metadata && typeof stamped.metadata === 'object' ? stamped.metadata : {};
    const year = tripStart ? Number(String(tripStart).slice(0, 4)) : null;
    const tripDates = eachDate(isoDay(tripStart), isoDay(tripEnd) || isoDay(tripStart));
    const { dates } = assignDatesScheduling({
      whenLabel: meta.whenLabel || '',
      customerWhen: meta.customerWhen || '',
    }, year, tripDates);
    const scheduledThing = dates.length === 1
      ? { ...stamped, starts_at: `${dates[0]}T12:00:00.000Z` }
      : stamped;
    const inserted = await insertTripThing(db, { tripId, requestId, thing: scheduledThing });
    savedForFacts.push({
      title: inserted?.title || stamped.title,
      whenLabel: meta.whenLabel || '',
      customerWhen: meta.customerWhen || '',
    });
    const row = inTurnPlaceResultFromTripThing(inserted);
    if (row) placeResults.push(row);
  }
  const placeSearchReplyFacts = chatPlaceSearchSavedReplyFacts(savedForFacts, tripStart, tripEnd);
  return { placeResults, placeSearchReplyFacts };
}
