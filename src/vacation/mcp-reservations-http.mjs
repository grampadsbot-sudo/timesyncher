import { cleanText, headerValue, readJson, sendJson } from './http.mjs';
import { asObject } from './mcp-read.mjs';
import { seatFromSession } from './collaborator-app-seat.mjs';
import {
  createReservationConnection,
  ensureVacationReservationsSchema,
  getActiveReservationConnectionForAccount,
  listReservationConnectionsForAccountOrTrip,
  revokeReservationConnection,
} from './mcp-reservations-store.mjs';
import {
  createReservationRequest,
  formatReservationRequestView,
  parseReservationRequestText,
} from './mcp-reservations-service.mjs';
import { buildReservationsSetupCopyText } from './mcp-reservations-handshake.mjs';

async function resolveAppSessionAccess(db, req, { tripId = '', shareToken = '', sessionToken = '' }) {
  const token = cleanText(sessionToken || headerValue(req, 'x-timesyncher-app-session'), 200);
  if (!token) return null;
  const rows = await db`
    select os.id, os.customer_id, os.trip_id, os.token, os.metadata,
      c.email, c.display_name, c.first_name, c.last_name
    from onboarding_sessions os
    left join customers c on c.id = os.customer_id
    where os.token = ${token}
    limit 1
  `;
  const session = rows[0];
  if (!session) return null;
  const seat = seatFromSession(session);
  const targetTripId = cleanText(tripId, 80);
  const targetSlug = cleanText(shareToken, 240);
  let tripRow = null;
  if (targetTripId) {
    const found = await db`select id, customer_id, title, metadata from trips where id = ${targetTripId} limit 1`;
    tripRow = found[0] || null;
  } else if (targetSlug) {
    const found = await db`
      select id, customer_id, title, metadata from trips
      where metadata->>'publicSlug' = ${targetSlug}
         or metadata->>'shareToken' = ${targetSlug}
         or metadata->>'sharedToken' = ${targetSlug}
      limit 1
    `;
    tripRow = found[0] || null;
  } else if (seat?.ownerTripId || session.trip_id) {
    const fallbackId = String(seat?.ownerTripId || session.trip_id);
    const found = await db`select id, customer_id, title, metadata from trips where id = ${fallbackId} limit 1`;
    tripRow = found[0] || null;
  }
  if (!tripRow) {
    throw Object.assign(new Error('Vacation not found.'), { statusCode: 404, code: 'vacation_not_found' });
  }
  const personId = session.customer_id ? String(session.customer_id) : null;
  const personEmail = cleanText(session.email, 180).toLowerCase();
  const isOwner = Boolean(personId && String(tripRow.customer_id || '') === personId);
  let isCollaborator = Boolean(seat && String(seat.ownerTripId || '') === String(tripRow.id));
  if (!isOwner && !isCollaborator && personEmail) {
    try {
      const collabs = await db`
        select id, metadata from vacation_collaborators
        where trip_id = ${tripRow.id} and status = 'active'
      `;
      isCollaborator = collabs.some((c) => {
        const meta = asObject(c.metadata);
        return cleanText(meta.email, 180).toLowerCase() === personEmail
          || (personId && cleanText(meta.collaboratorCustomerId, 80) === personId);
      });
    } catch (error) {
      void error;
    }
  }
  if (!isOwner && !isCollaborator) {
    throw Object.assign(new Error('You do not have access to this vacation.'), { statusCode: 403, code: 'editor_access_denied' });
  }
  return {
    tripId: String(tripRow.id),
    vacationTitle: String(tripRow.title || 'Vacation'),
    ownerCustomerId: tripRow.customer_id ? String(tripRow.customer_id) : null,
    accountCustomerId: personId,
    email: personEmail,
    displayName: cleanText(seat?.displayName || session.display_name || session.first_name, 120) || (isOwner ? 'Owner' : 'Collaborator'),
    role: isOwner ? 'owner' : 'collaborator',
  };
}

async function resolveReservationMemberAccess(db, req, { tripId = '', shareToken = '', sessionToken = '', resolveEditorAccess }) {
  const appMember = await resolveAppSessionAccess(db, req, { tripId, shareToken, sessionToken });
  if (appMember) return appMember;
  const editor = await resolveEditorAccess(db, req, { tripId, shareToken });
  let accountCustomerId = editor.role === 'owner' ? editor.ownerCustomerId : null;
  if (!accountCustomerId && editor.email) {
    try {
      const cust = await db`select id from customers where lower(email) = ${editor.email.toLowerCase()} limit 1`;
      if (cust[0]?.id) accountCustomerId = String(cust[0].id);
    } catch (error) {
      void error;
    }
  }
  const tripRows = await db`select title from trips where id = ${editor.tripId} limit 1`;
  return {
    tripId: editor.tripId,
    vacationTitle: String(tripRows[0]?.title || 'Vacation'),
    ownerCustomerId: editor.ownerCustomerId,
    accountCustomerId: accountCustomerId || editor.ownerCustomerId,
    email: editor.email,
    displayName: editor.role === 'owner' ? 'Owner' : 'Collaborator',
    role: editor.role,
  };
}

export async function handleReservationsHttpRoute(db, req, res, { sub, url, baseUrl, nowFn, resolveEditorAccess }) {
  await ensureVacationReservationsSchema(db);
  const resource = sub[1] || '';

  if (resource === 'connections') {
    if (req.method === 'GET' && sub.length === 2) {
      const adminOnly = url.searchParams.get('admin') === '1';
      const member = await resolveReservationMemberAccess(db, req, {
        tripId: url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
        shareToken: url.searchParams.get('shareToken') || '',
        sessionToken: url.searchParams.get('session') || '',
        resolveEditorAccess,
      });
      if (adminOnly && member.role !== 'owner') {
        return sendJson(res, 403, { ok: false, code: 'admin_access_required', error: 'Only the vacation owner can view AI Access & Approvals.' });
      }
      const connections = await listReservationConnectionsForAccountOrTrip(db, {
        tripId: member.tripId,
        ownerCustomerId: member.role === 'owner' ? member.ownerCustomerId : null,
        accountCustomerId: member.accountCustomerId,
        accountEmail: member.email,
      });
      return sendJson(res, 200, {
        ok: true,
        vacationId: member.tripId,
        role: member.role,
        isAdmin: member.role === 'owner',
        mcpEndpoint: `${baseUrl}/api/mcp`,
        connections,
      });
    }

    if (req.method === 'POST' && sub.length === 2) {
      const body = await readJson(req);
      const member = await resolveReservationMemberAccess(db, req, {
        tripId: body.tripId || body.vacationId || url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
        shareToken: body.shareToken || url.searchParams.get('shareToken') || '',
        sessionToken: body.session || url.searchParams.get('session') || '',
        resolveEditorAccess,
      });
      const created = await createReservationConnection(db, {
        accountCustomerId: member.accountCustomerId,
        accountEmail: member.email,
        label: cleanText(body.label, 120) || `${member.displayName} Reservations AI`,
        lastVacationId: member.tripId,
        expiresInDays: body.expiresInDays ?? body.expires_in_days ?? null,
        now: nowFn,
        env: process.env,
      });
      const mcpEndpoint = `${baseUrl}/api/mcp`;
      const copyText = buildReservationsSetupCopyText({ mcpEndpoint, token: created.token });
      return sendJson(res, 201, {
        ok: true,
        token: created.token,
        maskedToken: created.maskedToken,
        record: created.record,
        mcpEndpoint,
        copyText,
      });
    }

    if (req.method === 'POST' && sub[2] && sub[3] === 'revoke') {
      const body = await readJson(req);
      const member = await resolveReservationMemberAccess(db, req, {
        tripId: body.tripId || body.vacationId || url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
        shareToken: body.shareToken || url.searchParams.get('shareToken') || '',
        sessionToken: body.session || url.searchParams.get('session') || '',
        resolveEditorAccess,
      });
      const allowedCustomerIds = member.role === 'owner'
        ? [member.ownerCustomerId, member.accountCustomerId]
        : [member.accountCustomerId];
      const revoked = await revokeReservationConnection(db, {
        connectionId: decodeURIComponent(sub[2]),
        allowedCustomerIds,
        allowedEmails: [member.email],
        tripId: member.role === 'owner' ? member.tripId : null,
      });
      return sendJson(res, 200, { ok: true, record: revoked });
    }
  }

  if (resource === 'requests') {
    if (req.method === 'GET' && sub.length === 2) {
      const member = await resolveReservationMemberAccess(db, req, {
        tripId: url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
        shareToken: url.searchParams.get('shareToken') || '',
        sessionToken: url.searchParams.get('session') || '',
        resolveEditorAccess,
      });
      const rows = await db`
        select *
        from vacation_reservation_requests
        where trip_id = ${member.tripId}
        order by created_at desc
      `;
      return sendJson(res, 200, {
        ok: true,
        vacationId: member.tripId,
        requests: rows.map((row) => formatReservationRequestView(row, member.vacationTitle)),
      });
    }

    if (req.method === 'POST' && sub.length === 2) {
      const body = await readJson(req);
      const member = await resolveReservationMemberAccess(db, req, {
        tripId: body.tripId || body.vacationId || url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
        shareToken: body.shareToken || url.searchParams.get('shareToken') || '',
        sessionToken: body.session || url.searchParams.get('session') || '',
        resolveEditorAccess,
      });
      const conn = await getActiveReservationConnectionForAccount(db, {
        accountCustomerId: member.accountCustomerId,
        accountEmail: member.email,
      });
      const parsed = parseReservationRequestText(body.requestText || body.request_text || '');
      const created = await createReservationRequest(db, {
        connection: conn,
        tripId: member.tripId,
        vacationTitle: member.vacationTitle,
        requesterCustomerId: member.accountCustomerId,
        requesterEmail: member.email,
        requesterName: member.displayName,
        venueName: cleanText(body.venueName || body.venue_name, 180) || parsed.venueName,
        category: body.category || parsed.category,
        requestedDate: body.date || body.requestedDate || body.requested_date || parsed.requestedDate,
        requestedTime: body.time || body.requestedTime || body.requested_time || parsed.requestedTime,
        partySize: body.partySize ?? body.party_size ?? parsed.partySize,
        requestText: cleanText(body.requestText || body.request_text, 1200) || `Book ${cleanText(body.venueName || body.venue_name, 180) || parsed.venueName}`,
        notes: body.notes || null,
      });
      return sendJson(res, 201, { ok: true, request: created.request, webhook: created.webhook });
    }

    if (req.method === 'POST' && sub[2] && sub[3] === 'cancel') {
      const body = await readJson(req);
      const member = await resolveReservationMemberAccess(db, req, {
        tripId: body.tripId || body.vacationId || url.searchParams.get('tripId') || url.searchParams.get('vacationId') || '',
        shareToken: body.shareToken || url.searchParams.get('shareToken') || '',
        sessionToken: body.session || url.searchParams.get('session') || '',
        resolveEditorAccess,
      });
      const reqId = decodeURIComponent(sub[2]);
      const rows = await db`
        update vacation_reservation_requests
        set status = 'cancelled', completed_at = now(), updated_at = now()
        where id = ${reqId}
          and trip_id = ${member.tripId}
          and status = 'waiting'
        returning *
      `;
      if (!rows[0]) {
        return sendJson(res, 404, { ok: false, code: 'reservation_request_not_found', error: 'Waiting reservation request not found.' });
      }
      return sendJson(res, 200, { ok: true, request: formatReservationRequestView(rows[0], member.vacationTitle) });
    }
  }

  return sendJson(res, 404, { ok: false, error: 'Reservations route not found.' });
}
