import { requireIntakeAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';

function customerFields(body) {
  const customer = body.customer || {};
  return {
    email: cleanText(customer.email, 180).toLowerCase() || null,
    phone: cleanText(customer.phone, 80) || null,
    telegramUserId: cleanText(customer.telegramUserId || customer.telegram_user_id, 80) || null,
    firstName: cleanText(customer.firstName || customer.first_name, 80) || null,
    lastName: cleanText(customer.lastName || customer.last_name, 80) || null,
    displayName: cleanText(customer.displayName || customer.display_name, 160) || null,
    metadata: customer.metadata || {},
  };
}

function tripFields(body) {
  const trip = body.trip || {};
  return {
    id: cleanText(body.tripId || trip.id, 80) || null,
    title: cleanText(trip.title, 180) || 'Vacation',
    destination: cleanText(trip.destination, 180) || null,
    startDate: cleanText(trip.startDate || trip.start_date, 40) || null,
    endDate: cleanText(trip.endDate || trip.end_date, 40) || null,
    party: trip.party || {},
    preferences: trip.preferences || {},
  };
}

function requestFields(body) {
  const request = body.request || {};
  return {
    source: cleanText(request.source || body.source || 'web', 80),
    requestType: cleanText(request.type || request.requestType || body.requestType || 'trip_intake', 120),
    requestText: cleanText(request.text || body.text, 12000),
    normalizedIntent: request.normalizedIntent || body.normalizedIntent || {},
    payload: request.payload || body.payload || {},
  };
}

async function upsertCustomer(db, fields) {
  if (fields.email) {
    const rows = await db`
      insert into customers (email, phone, telegram_user_id, first_name, last_name, display_name, metadata, updated_at)
      values (${fields.email}, ${fields.phone}, ${fields.telegramUserId}, ${fields.firstName}, ${fields.lastName}, ${fields.displayName}, ${fields.metadata}, now())
      on conflict (email) do update set
        phone = coalesce(excluded.phone, customers.phone),
        telegram_user_id = coalesce(excluded.telegram_user_id, customers.telegram_user_id),
        first_name = coalesce(excluded.first_name, customers.first_name),
        last_name = coalesce(excluded.last_name, customers.last_name),
        display_name = coalesce(excluded.display_name, customers.display_name),
        metadata = customers.metadata || excluded.metadata,
        updated_at = now()
      returning id
    `;
    return rows[0].id;
  }

  const rows = await db`
    insert into customers (phone, telegram_user_id, first_name, last_name, display_name, metadata)
    values (${fields.phone}, ${fields.telegramUserId}, ${fields.firstName}, ${fields.lastName}, ${fields.displayName}, ${fields.metadata})
    returning id
  `;
  return rows[0].id;
}

async function upsertTrip(db, customerId, fields) {
  if (fields.id) {
    const rows = await db`
      update trips set
        customer_id = coalesce(customer_id, ${customerId}),
        title = coalesce(${fields.title}, title),
        destination = coalesce(${fields.destination}, destination),
        start_date = coalesce(${fields.startDate}, start_date),
        end_date = coalesce(${fields.endDate}, end_date),
        party = party || ${fields.party},
        preferences = preferences || ${fields.preferences},
        updated_at = now()
      where id = ${fields.id}
      returning id
    `;
    if (rows[0]) return rows[0].id;
  }

  const rows = await db`
    insert into trips (customer_id, title, destination, start_date, end_date, party, preferences)
    values (${customerId}, ${fields.title}, ${fields.destination}, ${fields.startDate}, ${fields.endDate}, ${fields.party}, ${fields.preferences})
    returning id
  `;
  return rows[0].id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });

  try {
    requireIntakeAuth(req, process.env);
    const body = await readJson(req);
    const db = sql(process.env);
    const customerId = await upsertCustomer(db, customerFields(body));
    const tripId = await upsertTrip(db, customerId, tripFields(body));
    const request = requestFields(body);
    if (!request.requestText && request.requestType === 'trip_intake') {
      throw Object.assign(new Error('Request text is required.'), { statusCode: 400 });
    }

    const requestRows = await db`
      insert into vacation_requests (
        customer_id, trip_id, source, request_type, request_text, normalized_intent, payload,
        status, queued_at
      )
      values (
        ${customerId}, ${tripId}, ${request.source}, ${request.requestType}, ${request.requestText},
        ${request.normalizedIntent}, ${request.payload}, 'queued', now()
      )
      returning id, received_at, queued_at
    `;
    const requestId = requestRows[0].id;

    await db`
      insert into transcript_turns (customer_id, trip_id, request_id, speaker, channel, body, payload)
      values (${customerId}, ${tripId}, ${requestId}, 'customer', ${request.source}, ${request.requestText}, ${request.payload})
    `;
    await db`
      insert into vacation_request_events (request_id, event_type, actor, details)
      values
        (${requestId}, 'received', 'customer', ${request.payload}),
        (${requestId}, 'queued', 'system', ${request.normalizedIntent})
    `;
    const jobRows = await db`
      insert into worker_jobs (request_id, trip_id, job_type, input)
      values (${requestId}, ${tripId}, ${request.requestType}, ${{
        customerId,
        tripId,
        requestId,
        source: request.source,
        requestType: request.requestType,
        requestText: request.requestText,
        payload: request.payload,
      }})
      returning id
    `;

    return sendJson(res, 201, {
      ok: true,
      customerId,
      tripId,
      requestId,
      jobId: jobRows[0].id,
      status: 'queued',
      receivedAt: requestRows[0].received_at,
      queuedAt: requestRows[0].queued_at,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to queue vacation request.' });
  }
}
