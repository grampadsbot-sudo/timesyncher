import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { classifyTurn } from '../src/vacation/turn-tags.mjs';
import { publicTripUrl } from '../src/vacation/web-access.mjs';

function tripSummary(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const url = publicTripUrl({ metadata }, process.env);
  return {
    id: row.id,
    title: row.title || 'Vacation',
    destination: row.destination || '',
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    status: row.status || 'planning',
    current: Boolean(row.current),
    publicUrl: url,
    shareToken: metadata.sharedToken || metadata.shareToken || metadata.publicSlug || metadata.source_token || metadata.slug || null,
  };
}

async function loadSession(db, token) {
  const rows = await db`
    select
      onboarding_sessions.id,
      onboarding_sessions.token,
      onboarding_sessions.customer_id,
      onboarding_sessions.trip_id,
      onboarding_sessions.status,
      customers.display_name,
      customers.first_name,
      customers.last_name,
      customers.email
    from onboarding_sessions
    left join customers on customers.id = onboarding_sessions.customer_id
    where onboarding_sessions.token = ${token}
    limit 1
  `;
  return rows[0] || null;
}

async function loadVacations(db, session) {
  const rows = await db`
    select
      trips.id,
      trips.title,
      trips.destination,
      trips.start_date,
      trips.end_date,
      trips.status,
      trips.metadata,
      (trips.id = ${session.trip_id}) as current
    from trips
    where trips.customer_id = ${session.customer_id}
    order by
      (trips.id = ${session.trip_id}) desc,
      trips.updated_at desc nulls last,
      trips.created_at desc nulls last
  `;
  return rows.map(tripSummary);
}

async function queueWebTurn(db, session, tripId, body) {
  const text = cleanText(body.text || body.message, 12000);
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.slice(0, 20).map((item) => ({
      name: cleanText(item?.name, 240),
      type: cleanText(item?.type, 160),
      size: Number.parseInt(item?.size || '0', 10) || 0,
      lastModified: Number.parseInt(item?.lastModified || '0', 10) || null,
    }))
    : [];
  if (!text && attachments.length === 0) {
    throw Object.assign(new Error('Message text or an attachment is required.'), { statusCode: 400 });
  }

  const requestText = text || `Uploaded ${attachments.length} vacation file${attachments.length === 1 ? '' : 's'}.`;
  const payload = {
    source: 'vacation_app',
    surface: 'vacation-app',
    attachments,
    voiceMode: Boolean(body.voiceMode),
    selectedTripId: tripId,
  };
  const turnTag = classifyTurn({
    text: requestText,
    speaker: 'customer',
    direction: 'inbound',
    channel: 'vacation-app',
    payload,
  });
  const requestRows = await db`
    insert into vacation_requests (
      customer_id, trip_id, source, request_type, request_text, normalized_intent, payload,
      status, queued_at
    )
    values (
      ${session.customer_id}, ${tripId}, 'vacation-app', 'trip_intake', ${requestText},
      ${{ turnTag }}, ${payload}, 'queued', now()
    )
    returning id, received_at, queued_at
  `;
  const requestId = requestRows[0].id;
  await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      turn_category, turn_tags, turn_tag_source, turn_tag_confidence, turn_tagged_at
    )
    values (
      ${session.customer_id}, ${tripId}, ${requestId}, 'customer', 'vacation-app', ${requestText}, ${payload}, 'inbound',
      ${turnTag.category}, ${turnTag.tags}, ${turnTag.source}, ${turnTag.confidence}, now()
    )
  `;
  await db`
    insert into vacation_request_events (request_id, event_type, actor, details)
    values
      (${requestId}, 'received', 'customer', ${payload}),
      (${requestId}, 'queued', 'system', ${{ surface: 'vacation-app', turnTag }})
  `;
  const jobRows = await db`
    insert into worker_jobs (request_id, trip_id, job_type, input)
    values (${requestId}, ${tripId}, 'trip_intake', ${{
      customerId: session.customer_id,
      tripId,
      requestId,
      source: 'vacation-app',
      requestType: 'trip_intake',
      requestText,
      payload,
    }})
    returning id
  `;
  return {
    requestId,
    jobId: jobRows[0].id,
    receivedAt: requestRows[0].received_at,
    queuedAt: requestRows[0].queued_at,
    turnTag,
  };
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'https://timesyncher.com');
    const token = cleanText(url.searchParams.get('session') || url.searchParams.get('token'), 180);
    if (!token) return sendJson(res, 400, { ok: false, error: 'session is required.' });

    const db = sql(process.env);
    const session = await loadSession(db, token);
    if (!session?.customer_id) return sendJson(res, 404, { ok: false, error: 'Vacation app session not found.' });

    if (req.method === 'GET') {
      const vacations = await loadVacations(db, session);
      return sendJson(res, 200, {
        ok: true,
        session: {
          token: session.token,
          status: session.status,
          customerName: session.display_name || [session.first_name, session.last_name].filter(Boolean).join(' '),
          email: session.email || null,
          currentTripId: session.trip_id || vacations[0]?.id || null,
        },
        vacations,
      });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const vacations = await loadVacations(db, session);
      const requestedTripId = cleanText(body.tripId || body.trip_id, 80);
      const selected = vacations.find((trip) => trip.id === requestedTripId)
        || vacations.find((trip) => trip.id === session.trip_id)
        || vacations[0];
      if (!selected) return sendJson(res, 409, { ok: false, error: 'No vacation is available for this session yet.' });
      const queued = await queueWebTurn(db, session, selected.id, body);
      return sendJson(res, 201, {
        ok: true,
        status: 'queued',
        trip: selected,
        ...queued,
      });
    }

    return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to use Vacation app.' });
  }
}
