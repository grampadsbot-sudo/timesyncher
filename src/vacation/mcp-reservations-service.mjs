import { cleanText } from './http.mjs';
import { asArray, asObject, isoDateOnly } from './mcp-read.mjs';
import {
  assertAccountVacationAccess,
  completeReservationHandshake,
  ensureVacationReservationsSchema,
  listAccountVacations,
} from './mcp-reservations-store.mjs';
import { nextStepMessageForMode } from './mcp-reservations-tools.mjs';

export const VALID_RESERVATION_CATEGORIES = new Set([
  'restaurant', 'hotel', 'car', 'flight', 'activity', 'bar', 'tour', 'attraction', 'event', 'other',
]);

export function normalizeClockTime(raw) {
  const value = cleanText(raw, 40);
  if (!value) return { clock24: '', display: '' };
  const ampm = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const min = ampm[2] || '00';
    const meridiem = ampm[3].toUpperCase();
    if (hour >= 1 && hour <= 12) {
      if (meridiem === 'PM' && hour < 12) hour += 12;
      if (meridiem === 'AM' && hour === 12) hour = 0;
      const clock24 = `${String(hour).padStart(2, '0')}:${min}`;
      const displayHour = hour % 12 || 12;
      return { clock24, display: `${displayHour}:${min} ${hour < 12 ? 'AM' : 'PM'}` };
    }
  }
  const mil = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (mil) {
    const hour = Number(mil[1]);
    const min = mil[2];
    if (hour >= 0 && hour <= 23) {
      const clock24 = `${String(hour).padStart(2, '0')}:${min}`;
      const displayHour = hour % 12 || 12;
      return { clock24, display: `${displayHour}:${min} ${hour < 12 ? 'AM' : 'PM'}` };
    }
  }
  return { clock24: '', display: value };
}

export function parseReservationRequestText(rawText = '') {
  const text = cleanText(rawText, 1000);
  let venueName = '';
  let partySize = null;
  let requestedTime = '';
  let requestedDate = null;
  let category = 'restaurant';

  if (/\b(hotel|room|resort|suite|stay)\b/i.test(text)) category = 'hotel';
  else if (/\b(car|rental|suv|sedan)\b/i.test(text)) category = 'car';
  else if (/\b(flight|airline)\b/i.test(text)) category = 'flight';
  else if (/\b(tour|ticket|show|museum|spa|activity)\b/i.test(text)) category = 'activity';

  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) requestedDate = isoMatch[1];

  const timeMatch = text.match(/\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i)
    || text.match(/\bat\s+(\d{1,2}:\d{2})\b/i);
  if (timeMatch) requestedTime = normalizeClockTime(timeMatch[1]).display || cleanText(timeMatch[1], 32);

  const partyMatch = text.match(/\b(?:for|party\s+of|table\s+for)\s+(\d{1,2})\b(?:\s*(?:people|guests|persons))?/i);
  if (partyMatch) {
    const num = Number(partyMatch[1]);
    if (num >= 1 && num <= 100) partySize = num;
  }

  const venueMatch = text.match(/\b(?:book|reserve)\s+(?:a\s+table\s+at\s+|us\s+(?:a\s+table\s+)?at\s+|me\s+(?:a\s+table\s+)?at\s+|a\s+room\s+at\s+|at\s+)?([A-Za-z0-9&'.,\- ]{2,80}?)(?=\s+(?:for\s+\d|on\s+|at\s+\d|tomorrow|tonight|this\s+|next\s+)|\s*[?.!]|$)/i)
    || text.match(/\breservation\s+(?:at|for)\s+([A-Za-z0-9&'.,\- ]{2,80}?)(?=\s+(?:for\s+\d|on\s+|at\s+\d|tomorrow|tonight|this\s+|next\s+)|\s*[?.!]|$)/i);
  if (venueMatch) {
    venueName = cleanText(venueMatch[1].replace(/^(?:a|the)\s+/i, ''), 160);
  }
  if (!venueName) venueName = 'Reservation';

  return { venueName, category, requestedDate, requestedTime, partySize };
}

export function formatReservationRequestView(row, vacationTitle = '') {
  return {
    request_id: String(row.id),
    vacation_id: String(row.trip_id),
    ...(vacationTitle ? { vacation_title: vacationTitle } : {}),
    venue_name: String(row.venue_name || ''),
    category: String(row.category || 'restaurant'),
    requested_date: isoDateOnly(row.requested_date) || null,
    requested_time: row.requested_time || null,
    party_size: row.party_size ?? null,
    request_text: String(row.request_text || ''),
    notes: row.notes || null,
    status: String(row.status || 'waiting'),
    thing_id: row.thing_id ? String(row.thing_id) : null,
    confirmation_number: row.confirmation_number || null,
    booked_time: row.booked_time || null,
    booked_date: isoDateOnly(row.booked_date) || null,
    booked_party_size: row.booked_party_size ?? null,
    result_notes: row.result_notes || null,
    failure_reason: row.failure_reason || null,
    alternatives: asArray(row.alternatives),
    webhook_status: row.webhook_status || null,
    created_at: row.created_at || null,
    completed_at: row.completed_at || null,
  };
}

export async function postReservationChatTurn(db, {
  tripId,
  ownerCustomerId = null,
  forCustomerId = null,
  forEmail = null,
  body,
  reservationCard = null,
  extraPayload = {},
  now = () => new Date(),
}) {
  const normalizedTripId = cleanText(tripId, 80);
  if (!normalizedTripId) return null;
  let resolvedOwnerId = cleanText(ownerCustomerId, 80) || null;
  if (!resolvedOwnerId) {
    const tripRows = await db`select customer_id from trips where id = ${normalizedTripId} limit 1`;
    resolvedOwnerId = tripRows[0]?.customer_id ? String(tripRows[0].customer_id) : null;
  }
  if (!resolvedOwnerId) return null;
  const text = cleanText(body, 2000);
  const at = now().toISOString();
  const payload = {
    source: 'vacation_app',
    surface: 'vacation-app',
    selectedTripId: normalizedTripId,
    ...(forCustomerId ? { forCustomerId: String(forCustomerId) } : {}),
    ...(forEmail ? { forEmail: cleanText(forEmail, 180).toLowerCase() } : {}),
    ...(reservationCard ? { reservationCard } : {}),
    ...asObject(extraPayload),
    liveTranscript: { role: 'app', text, at },
  };
  const rows = await db`
    insert into transcript_turns (
      customer_id, trip_id, speaker, channel, body, payload, direction, sent_at, response_latency_ms
    )
    values (
      ${resolvedOwnerId}, ${normalizedTripId}, 'app', 'vacation-app', ${text},
      ${payload}, 'outbound', now(), 0
    )
    returning id
  `;
  return { id: rows[0]?.id || null, body: text, payload };
}

async function deliverReservationWebhook(webhookUrl, payload, { fetchImpl = globalThis.fetch } = {}) {
  const target = cleanText(webhookUrl, 600);
  if (!target || typeof fetchImpl !== 'function') return { ok: false, status: 'skipped' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
  try {
    const response = await fetchImpl(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {}),
    });
    return { ok: response.ok, status: response.ok ? 'sent' : `http_${response.status}` };
  } catch (error) {
    void error;
    return { ok: false, status: 'failed' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function createReservationRequest(db, {
  connection = null,
  tripId,
  vacationTitle = '',
  requesterCustomerId = null,
  requesterEmail = null,
  requesterName = null,
  venueName,
  category = 'restaurant',
  requestedDate = null,
  requestedTime = null,
  partySize = null,
  requestText = '',
  notes = null,
  fetchImpl = globalThis.fetch,
}) {
  await ensureVacationReservationsSchema(db);
  const normalizedTripId = cleanText(tripId, 80);
  const safeVenue = cleanText(venueName, 180) || 'Reservation';
  const safeCat = VALID_RESERVATION_CATEGORIES.has(String(category || '').toLowerCase()) ? String(category).toLowerCase() : 'restaurant';
  const safeDate = isoDateOnly(requestedDate) || null;
  const safeTime = cleanText(requestedTime, 40) || null;
  const parsedParty = Number(partySize);
  const safeParty = Number.isInteger(parsedParty) && parsedParty >= 1 && parsedParty <= 100 ? parsedParty : null;
  const rows = await db`
    insert into vacation_reservation_requests (
      connection_id, trip_id, requester_customer_id, requester_email, requester_name,
      venue_name, category, requested_date, requested_time, party_size,
      request_text, notes, status, metadata
    ) values (
      ${connection?.id || null}, ${normalizedTripId}, ${cleanText(requesterCustomerId, 80) || null},
      ${cleanText(requesterEmail, 180).toLowerCase() || null}, ${cleanText(requesterName, 120) || null},
      ${safeVenue}, ${safeCat}, ${safeDate}, ${safeTime}, ${safeParty},
      ${cleanText(requestText, 1200)}, ${cleanText(notes, 500) || null}, 'waiting', ${{}}
    )
    returning *
  `;
  let row = rows[0];
  let webhook = { ok: false, status: 'not_applicable' };
  if (connection && connection.mode === 'webhook' && connection.webhook_url) {
    const pingBody = {
      event: 'reservation_request_created',
      request_id: String(row.id),
      vacation_id: normalizedTripId,
      vacation_title: cleanText(vacationTitle, 180),
      venue_name: safeVenue,
      category: safeCat,
      requested_date: safeDate,
      requested_time: safeTime,
      party_size: safeParty,
      request_text: cleanText(requestText, 1200),
      status: 'waiting',
      created_at: row.created_at || new Date().toISOString(),
    };
    webhook = await deliverReservationWebhook(connection.webhook_url, pingBody, { fetchImpl });
    await db`
      update vacation_reservation_requests
      set webhook_status = ${webhook.status},
        webhook_notified_at = now(),
        updated_at = now()
      where id = ${row.id}
    `;
    row = { ...row, webhook_status: webhook.status };
  }
  return {
    request: formatReservationRequestView(row, vacationTitle),
    webhook,
  };
}

export async function handleRegisterReservationsHandshake(db, tokenRecord, args = {}) {
  await ensureVacationReservationsSchema(db);
  const requestedVacationId = cleanText(args.vacation_id, 80);
  if (requestedVacationId) {
    await assertAccountVacationAccess(db, tokenRecord, requestedVacationId);
  }
  const targetVacationId = requestedVacationId || cleanText(tokenRecord.metadata?.lastVacationId, 80) || null;
  const updated = await completeReservationHandshake(db, {
    connectionId: tokenRecord.connectionId || tokenRecord.id,
    mode: cleanText(args.mode, 32).toLowerCase(),
    webhookUrl: args.webhook_url || null,
    pollIntervalMinutes: args.poll_interval_minutes ?? null,
    clientName: args.client_name || null,
    lastVacationId: targetVacationId,
  });
  const nextStep = nextStepMessageForMode(updated.mode, updated.pollIntervalMinutes);
  const confirmationMessage = `You're set up for reservations. ${nextStep}`;
  if (targetVacationId) {
    await postReservationChatTurn(db, {
      tripId: targetVacationId,
      forCustomerId: tokenRecord.accountCustomerId,
      forEmail: tokenRecord.accountEmail,
      body: confirmationMessage,
      reservationCard: {
        kind: 'ai_reservation_connected',
        connectionId: updated.id,
        mode: updated.mode,
        modeLabel: updated.modeLabel,
        pollIntervalMinutes: updated.pollIntervalMinutes,
        headline: "You're set up for reservations",
        nextStep,
      },
    });
  }
  return {
    ok: true,
    connection_id: updated.id,
    status: updated.status,
    mode: updated.mode,
    webhook_url: updated.webhookUrl,
    poll_interval_minutes: updated.pollIntervalMinutes,
    confirmation_message: confirmationMessage,
    next_step: nextStep,
  };
}

export async function handleListVacations(db, tokenRecord) {
  const vacations = await listAccountVacations(db, tokenRecord);
  return {
    ok: true,
    vacations: vacations.map((v) => ({
      vacation_id: v.vacation_id,
      title: v.title,
      destination: v.destination,
      start_date: v.start_date,
      end_date: v.end_date,
      timezone: v.timezone,
      role: v.role,
    })),
  };
}

export async function handleFindVacation(db, tokenRecord, args = {}) {
  const query = cleanText(args.query, 180);
  if (!query) throw Object.assign(new Error('query is required.'), { statusCode: 400, code: 'missing_query' });
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const vacations = await listAccountVacations(db, tokenRecord);
  const matches = vacations.filter((v) => {
    const haystack = `${v.title} ${v.destination}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  return {
    ok: true,
    query,
    vacations: matches.map((v) => ({
      vacation_id: v.vacation_id,
      title: v.title,
      destination: v.destination,
      start_date: v.start_date,
      end_date: v.end_date,
      timezone: v.timezone,
      role: v.role,
    })),
  };
}

export async function handleListReservationRequests(db, tokenRecord, args = {}) {
  await ensureVacationReservationsSchema(db);
  const vacations = await listAccountVacations(db, tokenRecord);
  const vacationMap = new Map(vacations.map((v) => [v.vacation_id, v]));
  const filterVacationId = cleanText(args.vacation_id, 80);
  if (filterVacationId && !vacationMap.has(filterVacationId)) {
    throw Object.assign(
      new Error('This reservations connection does not have access to that vacation.'),
      { statusCode: 403, code: 'vacation_access_denied' },
    );
  }
  const statusFilter = cleanText(args.status, 32).toLowerCase() || 'waiting';
  const targetTripIds = filterVacationId ? [filterVacationId] : [...vacationMap.keys()];
  if (!targetTripIds.length) return { ok: true, requests: [] };
  const rows = await db`
    select *
    from vacation_reservation_requests
    where trip_id = any(${targetTripIds}::uuid[])
    order by created_at desc
  `;
  const filtered = rows.filter((row) => statusFilter === 'all' || String(row.status) === statusFilter);
  return {
    ok: true,
    requests: filtered.map((row) => formatReservationRequestView(row, vacationMap.get(String(row.trip_id))?.title || '')),
  };
}
