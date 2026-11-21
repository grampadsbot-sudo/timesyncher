import { cleanText } from './http.mjs';
import { asArray, asObject, isoDateOnly } from './mcp-read.mjs';
import { insertTripThing } from './trip-things.mjs';
import { invalidateSharedUpstreamCacheForSlug } from './shared-trip-upstream-cache.mjs';
import {
  assertAccountVacationAccess,
  ensureVacationReservationsSchema,
} from './mcp-reservations-store.mjs';
import {
  normalizeClockTime,
  postReservationChatTurn,
  VALID_RESERVATION_CATEGORIES,
} from './mcp-reservations-service.mjs';

function normalizeNameKey(value) {
  return cleanText(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function applyConfirmedBookingToThing(db, {
  tripId,
  requestId,
  existingThingId = null,
  venueName,
  category = 'restaurant',
  date = null,
  time = '',
  partySize = null,
  confirmationNumber = '',
  notes = '',
}) {
  const { clock24, display: displayTime } = normalizeClockTime(time);
  const safeDate = isoDateOnly(date) || null;
  const startsAt = safeDate && clock24 ? `${safeDate}T${clock24}:00.000Z` : (safeDate ? `${safeDate}T12:00:00.000Z` : null);
  const safeCat = VALID_RESERVATION_CATEGORIES.has(String(category || '').toLowerCase()) ? String(category).toLowerCase() : 'restaurant';
  const existingThings = await db`
    select id, category, title, description, starts_at, ends_at, cost_estimate_cents, location, metadata
    from trip_things
    where trip_id = ${tripId}
    order by created_at asc
  `;
  const targetKey = normalizeNameKey(venueName);
  const match = (existingThingId && existingThings.find((row) => String(row.id) === String(existingThingId)))
    || existingThings.find((row) => normalizeNameKey(row.title) === targetKey);

  const detailPatch = {
    status: 'booked',
    bookedByAi: true,
    bookedByLabel: 'Booked by your AI',
    ...(confirmationNumber ? { confirmationNumber, confirmationCode: confirmationNumber } : {}),
    ...(displayTime ? { reservationTime: displayTime } : {}),
    ...(clock24 ? { startTime: clock24 } : {}),
    ...(safeDate ? { reservationDate: safeDate, dayDate: safeDate } : {}),
    ...(partySize ? { partySize } : {}),
    ...(notes ? { reservationNotes: notes } : {}),
  };

  if (match) {
    const prevMeta = asObject(match.metadata);
    const prevDetail = asObject(prevMeta.thingDetail);
    const prevNotes = asArray(prevMeta.notes);
    const nextNotes = notes && !prevNotes.includes(notes) ? [...prevNotes, notes] : prevNotes;
    const nextMeta = {
      ...prevMeta,
      status: 'booked',
      bookedByAi: true,
      bookedByLabel: 'Booked by your AI',
      ...(confirmationNumber ? { confirmationNumber, confirmationCode: confirmationNumber } : {}),
      ...(displayTime ? { reservationTime: displayTime } : {}),
      ...(clock24 ? { startTime: clock24 } : {}),
      ...(safeDate ? { dayDate: safeDate, reservationDate: safeDate, whenLabel: safeDate, scheduled: true, unscheduled: false, timeline: true } : {}),
      ...(partySize ? { partySize } : {}),
      ...(notes ? { reservationNotes: notes } : {}),
      ...(nextNotes.length ? { notes: nextNotes } : {}),
      reservationRequestId: String(requestId),
      thingDetail: { ...prevDetail, ...detailPatch },
    };
    const nextStartsAt = startsAt || match.starts_at || null;
    await db`
      update trip_things
      set title = ${match.title},
        description = ${match.description || null},
        starts_at = ${nextStartsAt},
        ends_at = ${match.ends_at || null},
        cost_estimate_cents = ${match.cost_estimate_cents ?? null},
        location = ${asObject(match.location)},
        metadata = ${nextMeta},
        updated_at = now()
      where id = ${match.id}
        and trip_id = ${tripId}
    `;
    return { id: String(match.id), title: String(match.title), created: false };
  }

  const nextMeta = {
    source: 'ai_reservation',
    status: 'booked',
    bookedByAi: true,
    bookedByLabel: 'Booked by your AI',
    ...(confirmationNumber ? { confirmationNumber, confirmationCode: confirmationNumber } : {}),
    ...(displayTime ? { reservationTime: displayTime } : {}),
    ...(clock24 ? { startTime: clock24 } : {}),
    ...(safeDate ? { dayDate: safeDate, reservationDate: safeDate, whenLabel: safeDate, scheduled: true, unscheduled: false, timeline: true } : { scheduled: false, unscheduled: true, timeline: false }),
    ...(partySize ? { partySize } : {}),
    ...(notes ? { reservationNotes: notes, notes: [notes] } : {}),
    reservationRequestId: String(requestId),
    thingDetail: detailPatch,
  };
  const inserted = await insertTripThing(db, {
    tripId,
    source: 'ai_reservation',
    thing: {
      category: safeCat,
      title: venueName,
      description: notes || null,
      startsAt,
      endsAt: null,
      costEstimateCents: null,
      currency: 'usd',
      location: {},
      links: [],
      ratings: {},
      metadata: nextMeta,
    },
  });
  return { id: String(inserted.id), title: venueName, created: true };
}

export async function handleSubmitReservationResult(db, tokenRecord, args = {}) {
  await ensureVacationReservationsSchema(db);
  const resultStatus = cleanText(args.status, 32).toLowerCase();
  if (resultStatus !== 'confirmed' && resultStatus !== 'failed') {
    throw Object.assign(new Error('status must be "confirmed" or "failed".'), { statusCode: 400, code: 'invalid_reservation_status' });
  }
  const requestId = cleanText(args.request_id, 80);
  const providedVacationId = cleanText(args.vacation_id, 80);
  let requestRow = null;
  let vacation = null;

  if (requestId) {
    const found = await db`select * from vacation_reservation_requests where id = ${requestId} limit 1`;
    requestRow = found[0] || null;
    if (!requestRow) {
      throw Object.assign(new Error('Reservation request not found.'), { statusCode: 404, code: 'reservation_request_not_found' });
    }
    vacation = await assertAccountVacationAccess(db, tokenRecord, String(requestRow.trip_id));
    if (providedVacationId && providedVacationId !== String(requestRow.trip_id)) {
      throw Object.assign(new Error('vacation_id does not match the reservation request.'), { statusCode: 403, code: 'vacation_scope_mismatch' });
    }
    if (String(requestRow.status) !== 'waiting') {
      throw Object.assign(
        new Error(`Reservation request is already ${requestRow.status} and cannot be updated.`),
        { statusCode: 409, code: 'reservation_request_not_waiting' },
      );
    }
  } else {
    if (!providedVacationId) {
      throw Object.assign(new Error('vacation_id is required when request_id is omitted.'), { statusCode: 400, code: 'missing_vacation_id' });
    }
    vacation = await assertAccountVacationAccess(db, tokenRecord, providedVacationId);
    const directVenue = cleanText(args.venue_name, 180);
    if (!directVenue) {
      throw Object.assign(new Error('venue_name is required when request_id is omitted.'), { statusCode: 400, code: 'missing_venue_name' });
    }
    const safeCat = VALID_RESERVATION_CATEGORIES.has(String(args.category || '').toLowerCase()) ? String(args.category).toLowerCase() : 'restaurant';
    const createdRows = await db`
      insert into vacation_reservation_requests (
        connection_id, trip_id, requester_customer_id, requester_email,
        venue_name, category, requested_date, requested_time, party_size,
        request_text, status, metadata
      ) values (
        ${tokenRecord.connectionId || tokenRecord.id}, ${vacation.vacation_id},
        ${tokenRecord.accountCustomerId}, ${tokenRecord.accountEmail},
        ${directVenue}, ${safeCat}, ${isoDateOnly(args.date) || null},
        ${cleanText(args.time, 40) || null}, ${Number.isInteger(Number(args.party_size)) ? Number(args.party_size) : null},
        ${`Direct AI reservation for ${directVenue}`}, 'waiting', ${{ askAiFirst: true }}
      )
      returning *
    `;
    requestRow = createdRows[0];
  }

  const venueName = cleanText(args.venue_name, 180) || String(requestRow.venue_name || 'Reservation');
  const category = cleanText(args.category, 40) || String(requestRow.category || 'restaurant');
  const bookingDate = isoDateOnly(args.date) || isoDateOnly(requestRow.requested_date) || null;
  const bookingTime = normalizeClockTime(args.time || requestRow.requested_time || '').display || cleanText(args.time || requestRow.requested_time, 40);
  const parsedParty = Number(args.party_size ?? requestRow.party_size);
  const partySize = Number.isInteger(parsedParty) && parsedParty >= 1 && parsedParty <= 100 ? parsedParty : null;
  const confirmationNumber = cleanText(args.confirmation_number, 120);
  const notes = cleanText(args.notes, 600);

  if (resultStatus === 'confirmed') {
    const thing = await applyConfirmedBookingToThing(db, {
      tripId: vacation.vacation_id,
      requestId: requestRow.id,
      existingThingId: requestRow.thing_id || null,
      venueName,
      category,
      date: bookingDate,
      time: bookingTime,
      partySize,
      confirmationNumber,
      notes,
    });
    await db`
      update vacation_reservation_requests
      set status = 'booked',
        thing_id = ${thing.id},
        venue_name = ${venueName},
        confirmation_number = ${confirmationNumber || null},
        booked_time = ${bookingTime || null},
        booked_date = ${bookingDate},
        booked_party_size = ${partySize},
        result_notes = ${notes || null},
        completed_at = now(),
        updated_at = now()
      where id = ${requestRow.id}
    `;
    if (vacation.share_slug) invalidateSharedUpstreamCacheForSlug(vacation.share_slug);
    const details = [
      bookingDate || '',
      bookingTime || '',
      partySize ? `party of ${partySize}` : '',
      confirmationNumber ? `confirmation #${confirmationNumber}` : '',
    ].filter(Boolean).join(' · ');
    const chatBody = `Booked by your AI: ${venueName}${details ? ` (${details})` : ''}.${notes ? ` ${notes}` : ''}`;
    await postReservationChatTurn(db, {
      tripId: vacation.vacation_id,
      ownerCustomerId: vacation.owner_customer_id,
      body: chatBody,
      reservationCard: {
        kind: 'ai_reservation_status',
        status: 'booked',
        requestId: String(requestRow.id),
        vacationId: vacation.vacation_id,
        thingId: thing.id,
        venueName,
        bookedByLabel: 'Booked by your AI',
        date: bookingDate,
        time: bookingTime,
        partySize,
        confirmationNumber,
        notes,
      },
    });
    return {
      ok: true,
      request_id: String(requestRow.id),
      vacation_id: vacation.vacation_id,
      status: 'booked',
      published: true,
      thing_id: thing.id,
      thing_created: thing.created,
      booked_by_label: 'Booked by your AI',
      venue_name: venueName,
      date: bookingDate,
      time: bookingTime,
      party_size: partySize,
      confirmation_number: confirmationNumber || null,
      notes: notes || null,
    };
  }

  const reason = cleanText(args.reason || args.notes, 500) || 'No tables or availability matched that request.';
  const rawAlternatives = asArray(args.alternatives).map((item) => cleanText(item, 200)).filter(Boolean);
  const alternatives = rawAlternatives.length ? rawAlternatives : ['Try another time', 'Try another place', 'Try again'];
  await db`
    update vacation_reservation_requests
    set status = 'failed',
      failure_reason = ${reason},
      alternatives = ${alternatives},
      result_notes = ${notes || null},
      completed_at = now(),
      updated_at = now()
    where id = ${requestRow.id}
  `;
  const chatBody = `Reservation failed for ${venueName}: ${reason} Would you like to try another time, another place, or try again?`;
  await postReservationChatTurn(db, {
    tripId: vacation.vacation_id,
    ownerCustomerId: vacation.owner_customer_id,
    body: chatBody,
    reservationCard: {
      kind: 'ai_reservation_status',
      status: 'failed',
      requestId: String(requestRow.id),
      vacationId: vacation.vacation_id,
      venueName,
      reason,
      alternatives,
    },
  });
  return {
    ok: true,
    request_id: String(requestRow.id),
    vacation_id: vacation.vacation_id,
    status: 'failed',
    published: false,
    venue_name: venueName,
    reason,
    alternatives,
  };
}

export function reservationPlaceFields(thingMeta = {}) {
  if (!thingMeta || thingMeta.bookedByAi !== true) return {};
  return {
    booked_by_ai: true,
    booked_by_label: String(thingMeta.bookedByLabel || 'Booked by your AI'),
    ...(thingMeta.confirmationNumber || thingMeta.confirmationCode
      ? { confirmation_number: String(thingMeta.confirmationNumber || thingMeta.confirmationCode) }
      : {}),
    ...(thingMeta.partySize ? { party_size: Number(thingMeta.partySize) } : {}),
    ...(thingMeta.reservationTime ? { reservation_time: String(thingMeta.reservationTime) } : {}),
    ...(thingMeta.reservationNotes ? { reservation_notes: String(thingMeta.reservationNotes) } : {}),
  };
}
