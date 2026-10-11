import { assignDatesScheduling } from './intake-shared-trip.mjs';
import { scheduleChatThing } from './chat-thing-schedule.mjs';
import { tripIsoDay } from './intake-weekday-dates.mjs';
import { rowNeedsDetailBackfill } from './chat-intake-place-persist.mjs';
import { applyEnrichedDetailToTripThing, enrichPlaceDetail } from './place-detail-enrichment.mjs';
import { activeCollaboratorsFromParty, partyNamesFromDialogParty } from './reply-action-claim.mjs';
import { insertTripThing } from './trip-things.mjs';

function clean(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isoDay(value) {
  return tripIsoDay(value);
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
    const whenLabel = clean(item?.whenLabel, 180) || clean(item?.customerWhen, 180);
    const { dates, weekdayAmbiguous, candidateDates } = assignDatesScheduling(record, year, tripDates);
    if (!dates.length) {
      unscheduled.push({
        title,
        notOnADay: true,
        ...(whenLabel ? { whenLabel } : {}),
        ...(weekdayAmbiguous ? { weekdayAmbiguous: true, candidateDates } : {}),
      });
    } else scheduled.push({ title, dates });
  }
  if (!unscheduled.length && !scheduled.length) return null;
  const chatPlaceSearch = { unscheduled, scheduled };
  if (unscheduled.some((row) => row.weekdayAmbiguous)) {
    chatPlaceSearch.weekdayAmbiguityRule =
      'Some saved places name a weekday that matches more than one trip day; use candidateDates and ask which day before scheduling.';
  }
  return { chatPlaceSearch };
}

export function vacationAppReplyClaimContext(trip, placeSearchReplyFacts, {
  roster = [],
  turnActionResults = null,
} = {}) {
  const meta = trip?.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  const party = meta.dialogParty && typeof meta.dialogParty === 'object' ? meta.dialogParty : {};
  const unscheduledChatPlaceTitles = unscheduledChatPlaceTitlesFromReplyFacts(placeSearchReplyFacts);
  const rosterMemberNames = (Array.isArray(roster) ? roster : [])
    .map((person) => String(person?.name || '').trim())
    .filter(Boolean);
  const turnInviteeNames = [];
  const inviteName = String(turnActionResults?.invite?.inviteeName || '').trim();
  if (inviteName) turnInviteeNames.push(inviteName);
  return {
    activeCollaborators: activeCollaboratorsFromParty(party),
    rosterMemberNames: [...new Set([...rosterMemberNames, ...partyNamesFromDialogParty(party)])],
    turnInviteeNames,
    dialogParty: party,
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
  const loc = inserted?.location && typeof inserted.location === 'object' ? inserted.location : {};
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  const category = String(inserted?.category || 'restaurant').trim().toLowerCase();
  return {
    name,
    title: name,
    sourceRef: { source: 'trip_thing', id },
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, category } : {}),
  };
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

async function enrichChatSavedPlaceThing(thing, { destination = '', env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!rowNeedsDetailBackfill(thing)) return thing;
  const dest = clean(destination, 180);
  if (!dest) return thing;
  const loc = thing?.location && typeof thing.location === 'object' ? thing.location : {};
  const meta = thing?.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  try {
    const enrichment = await enrichPlaceDetail({
      place: {
        title: thing.title,
        category: thing.category,
        address: loc.address || '',
        lat: loc.lat,
        lng: loc.lng,
        source: thing.source,
        sourceRecord: meta.sourceRecord,
        url: meta.sourceRecord?.url,
      },
      destination: dest,
      category: thing.category,
      env,
      fetchImpl,
    });
    return applyEnrichedDetailToTripThing(thing, enrichment);
  } catch (error) {
    console.error(`chat place save detail enrichment failed for "${clean(thing?.title, 240)}": ${String(error?.message || error)}`);
    return thing;
  }
}

export async function insertStampedChatPlaceThings(db, {
  tripId,
  requestId,
  things,
  classification,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const tripDateRows = await db`
    select start_date, end_date, destination
    from trips
    where id = ${tripId}
    limit 1
  `;
  const tripStart = tripDateRows[0]?.start_date || '';
  const tripEnd = tripDateRows[0]?.end_date || '';
  const destinationHint = clean(tripDateRows[0]?.destination, 180);
  const placeResults = [];
  const savedForFacts = [];
  for (const thing of Array.isArray(things) ? things : []) {
    const stamped = stampChatSavedPlaceThing(thing, classification);
    const enriched = await enrichChatSavedPlaceThing(stamped, { destination: destinationHint, env, fetchImpl });
    const meta = enriched?.metadata && typeof enriched.metadata === 'object' ? enriched.metadata : {};
    const scheduled = scheduleChatThing(enriched, { start_date: tripStart, end_date: tripEnd });
    const scheduledThing = {
      ...enriched,
      starts_at: scheduled.starts_at,
      metadata: {
        ...meta,
        whenLabel: scheduled.whenLabel || meta.whenLabel || '',
        customerWhen: scheduled.customerWhen || meta.customerWhen || '',
        askWhichDay: scheduled.askWhichDay === true,
        ...(scheduled.candidateDates.length ? { candidateDates: scheduled.candidateDates } : {}),
      },
    };
    const inserted = await insertTripThing(db, { tripId, requestId, thing: scheduledThing });
    savedForFacts.push({
      title: inserted?.title || enriched.title,
      whenLabel: meta.whenLabel || '',
      customerWhen: meta.customerWhen || '',
    });
    const row = inTurnPlaceResultFromTripThing(inserted);
    if (row) placeResults.push(row);
  }
  const placeSearchReplyFacts = chatPlaceSearchSavedReplyFacts(savedForFacts, tripStart, tripEnd);
  return { placeResults, placeSearchReplyFacts };
}
