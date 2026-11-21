import crypto from 'node:crypto';
import { createMcpTestDb } from './mcp-test-harness.mjs';

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out;
  }
  return value;
}

export function createReservationsTestDb() {
  const baseDb = createMcpTestDb();
  const tables = baseDb.tables;
  tables.vacation_reservation_connections = [];
  tables.vacation_reservation_requests = [];

  function sqlTag(strings, ...values) {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
    const nowIso = new Date().toISOString();

    if (/^(create|alter|do)\s/.test(text)) return Promise.resolve([]);

    if (text.startsWith('insert into vacation_reservation_connections')) {
      const row = {
        id: crypto.randomUUID(),
        account_customer_id: String(values[0]),
        account_email: values[1] ? String(values[1]).toLowerCase() : null,
        label: String(values[2] || 'Reservations AI'),
        scope: 'reservations',
        token_hash: String(values[3]),
        token_prefix: String(values[4]),
        status: 'pending_handshake',
        mode: null,
        webhook_url: null,
        poll_interval_minutes: null,
        ai_client_name: null,
        handshake_completed_at: null,
        created_at: nowIso,
        last_used_at: null,
        revoked_at: null,
        expires_at: values[5] || null,
        metadata: clone(values[6] || {}),
      };
      tables.vacation_reservation_connections.push(row);
      return Promise.resolve([clone(row)]);
    }

    if (text.includes('from vacation_reservation_connections') && text.includes('where token_hash =')) {
      const found = tables.vacation_reservation_connections.find((r) => r.token_hash === String(values[0]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.includes('from vacation_reservation_connections') && text.includes('where id =')) {
      const found = tables.vacation_reservation_connections.find((r) => String(r.id) === String(values[0]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.includes('from vacation_reservation_connections') && text.includes("where status = 'active'")) {
      const cid = values[0] ? String(values[0]) : '';
      const email = String(values[1] || '').toLowerCase();
      const nowMs = Date.now();
      const matches = tables.vacation_reservation_connections
        .filter((r) => r.status === 'active'
          && (!r.expires_at || Date.parse(r.expires_at) > nowMs)
          && ((cid && String(r.account_customer_id) === cid) || (email && String(r.account_email || '').toLowerCase() === email)))
        .sort((a, b) => String(b.handshake_completed_at || b.created_at).localeCompare(String(a.handshake_completed_at || a.created_at)));
      return Promise.resolve(matches.length ? [clone(matches[0])] : []);
    }

    if (text.includes('from vacation_reservation_connections') && text.includes("status in ('pending_handshake', 'active')")) {
      const cid = values[0] ? String(values[0]) : '';
      const email = String(values[1] || '').toLowerCase();
      const nowMs = Date.now();
      const matches = tables.vacation_reservation_connections
        .filter((r) => (r.status === 'pending_handshake' || r.status === 'active')
          && (!r.expires_at || Date.parse(r.expires_at) > nowMs)
          && ((cid && String(r.account_customer_id) === cid) || (email && String(r.account_email || '').toLowerCase() === email)))
        .sort((a, b) => {
          const rankA = a.status === 'pending_handshake' ? 0 : 1;
          const rankB = b.status === 'pending_handshake' ? 0 : 1;
          if (rankA !== rankB) return rankA - rankB;
          return String(b.created_at).localeCompare(String(a.created_at));
        });
      return Promise.resolve(matches.length ? [clone(matches[0])] : []);
    }

    if (text.includes('from vacation_reservation_connections') && text.includes('order by created_at desc')) {
      return Promise.resolve([...tables.vacation_reservation_connections].reverse().map(clone));
    }

    if (text.startsWith('update vacation_reservation_connections set last_used_at =')) {
      const found = tables.vacation_reservation_connections.find((r) => String(r.id) === String(values[1]));
      if (found) found.last_used_at = String(values[0]);
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_reservation_connections set status = 'active'")) {
      const found = tables.vacation_reservation_connections.find((r) => String(r.id) === String(values[5]) && r.status !== 'revoked');
      if (!found) return Promise.resolve([]);
      found.status = 'active';
      found.mode = String(values[0]);
      found.webhook_url = values[1] || null;
      found.poll_interval_minutes = values[2] ?? null;
      if (values[3]) found.ai_client_name = String(values[3]);
      found.handshake_completed_at = nowIso;
      found.metadata = { ...(found.metadata || {}), ...(values[4] || {}) };
      return Promise.resolve([clone(found)]);
    }

    if (text.startsWith("update vacation_reservation_connections set status = 'revoked'")) {
      const found = tables.vacation_reservation_connections.find((r) => String(r.id) === String(values[0]));
      if (!found) return Promise.resolve([]);
      found.status = 'revoked';
      found.revoked_at = nowIso;
      return Promise.resolve([clone(found)]);
    }

    if (text.startsWith('insert into vacation_reservation_requests')) {
      const isDirect = !text.includes('requester_name');
      const row = isDirect
        ? {
          id: crypto.randomUUID(),
          connection_id: values[0] ? String(values[0]) : null,
          trip_id: String(values[1]),
          requester_customer_id: values[2] ? String(values[2]) : null,
          requester_email: values[3] || null,
          requester_name: null,
          venue_name: String(values[4]),
          category: String(values[5] || 'restaurant'),
          requested_date: values[6] || null,
          requested_time: values[7] || null,
          party_size: values[8] ?? null,
          request_text: String(values[9] || ''),
          notes: null,
          status: 'waiting',
          thing_id: null,
          confirmation_number: null,
          booked_time: null,
          booked_date: null,
          booked_party_size: null,
          result_notes: null,
          failure_reason: null,
          alternatives: [],
          webhook_status: null,
          webhook_notified_at: null,
          created_at: nowIso,
          updated_at: nowIso,
          completed_at: null,
          metadata: clone(values[10] || {}),
        }
        : {
          id: crypto.randomUUID(),
          connection_id: values[0] ? String(values[0]) : null,
          trip_id: String(values[1]),
          requester_customer_id: values[2] ? String(values[2]) : null,
          requester_email: values[3] || null,
          requester_name: values[4] || null,
          venue_name: String(values[5]),
          category: String(values[6] || 'restaurant'),
          requested_date: values[7] || null,
          requested_time: values[8] || null,
          party_size: values[9] ?? null,
          request_text: String(values[10] || ''),
          notes: values[11] || null,
          status: 'waiting',
          thing_id: null,
          confirmation_number: null,
          booked_time: null,
          booked_date: null,
          booked_party_size: null,
          result_notes: null,
          failure_reason: null,
          alternatives: [],
          webhook_status: null,
          webhook_notified_at: null,
          created_at: nowIso,
          updated_at: nowIso,
          completed_at: null,
          metadata: clone(values[12] || {}),
        };
      tables.vacation_reservation_requests.push(row);
      return Promise.resolve([clone(row)]);
    }

    if (text.includes('from vacation_reservation_requests') && text.includes('where id =')) {
      const found = tables.vacation_reservation_requests.find((r) => String(r.id) === String(values[0]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.includes('from vacation_reservation_requests') && text.includes('trip_id = any(')) {
      const ids = new Set((Array.isArray(values[0]) ? values[0] : []).map(String));
      return Promise.resolve(
        tables.vacation_reservation_requests.filter((r) => ids.has(String(r.trip_id))).reverse().map(clone),
      );
    }

    if (text.includes('from vacation_reservation_requests') && text.includes('where trip_id =')) {
      return Promise.resolve(
        tables.vacation_reservation_requests.filter((r) => String(r.trip_id) === String(values[0])).reverse().map(clone),
      );
    }

    if (text.startsWith('update vacation_reservation_requests set webhook_status =')) {
      const found = tables.vacation_reservation_requests.find((r) => String(r.id) === String(values[1]));
      if (found) {
        found.webhook_status = String(values[0]);
        found.webhook_notified_at = nowIso;
        found.updated_at = nowIso;
      }
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_reservation_requests set status = 'booked'")) {
      const found = tables.vacation_reservation_requests.find((r) => String(r.id) === String(values[7]));
      if (found) {
        found.status = 'booked';
        found.thing_id = String(values[0]);
        found.venue_name = String(values[1]);
        found.confirmation_number = values[2] || null;
        found.booked_time = values[3] || null;
        found.booked_date = values[4] || null;
        found.booked_party_size = values[5] ?? null;
        found.result_notes = values[6] || null;
        found.completed_at = nowIso;
        found.updated_at = nowIso;
      }
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_reservation_requests set status = 'failed'")) {
      const found = tables.vacation_reservation_requests.find((r) => String(r.id) === String(values[3]));
      if (found) {
        found.status = 'failed';
        found.failure_reason = String(values[0] || '');
        found.alternatives = clone(values[1] || []);
        found.result_notes = values[2] || null;
        found.completed_at = nowIso;
        found.updated_at = nowIso;
      }
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_reservation_requests set status = 'cancelled'")) {
      const found = tables.vacation_reservation_requests.find(
        (r) => String(r.id) === String(values[0]) && String(r.trip_id) === String(values[1]) && r.status === 'waiting',
      );
      if (!found) return Promise.resolve([]);
      found.status = 'cancelled';
      found.completed_at = nowIso;
      found.updated_at = nowIso;
      return Promise.resolve([clone(found)]);
    }

    if (text.includes('from trips where customer_id =')) {
      return Promise.resolve(
        tables.trips.filter((t) => String(t.customer_id) === String(values[0])).reverse().map(clone),
      );
    }

    if (text.includes('from onboarding_sessions os')) {
      const found = tables.onboarding_sessions.find((s) => String(s.token) === String(values[0]));
      if (!found) return Promise.resolve([]);
      const cust = tables.customers.find((c) => String(c.id) === String(found.customer_id));
      return Promise.resolve([clone({
        ...found,
        email: found.email || cust?.email || null,
        display_name: found.display_name || cust?.display_name || null,
        first_name: found.first_name || cust?.first_name || null,
        last_name: found.last_name || cust?.last_name || null,
      })]);
    }

    if (text.includes('from onboarding_sessions where customer_id =')) {
      return Promise.resolve(
        tables.onboarding_sessions.filter((s) => String(s.customer_id) === String(values[0])).map(clone),
      );
    }

    if (text.includes('from customers where lower(email) =')) {
      const found = tables.customers.find((c) => String(c.email || '').toLowerCase() === String(values[0]).toLowerCase());
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.includes('from vacation_web_access_grants') && text.includes('lower(email) =')) {
      const email = String(values[0]).toLowerCase();
      return Promise.resolve(
        tables.vacation_web_access_grants.filter((g) => g.status === 'accepted' && String(g.email || '').toLowerCase() === email).map(clone),
      );
    }

    if (text.includes('from vacation_collaborators') && text.includes('where trip_id =')) {
      return Promise.resolve(
        tables.vacation_collaborators.filter((c) => String(c.trip_id) === String(values[0]) && c.status === 'active').map(clone),
      );
    }

    return baseDb(strings, ...values);
  }

  sqlTag.tables = tables;
  sqlTag.liveSnapshot = () => JSON.stringify({
    trips: tables.trips,
    trip_things: tables.trip_things,
    vacation_reservation_requests: tables.vacation_reservation_requests,
  });
  sqlTag.seedVacation = (opts) => baseDb.seedVacation(opts);
  sqlTag.seedThing = (opts) => baseDb.seedThing(opts);
  sqlTag.seedEditorSession = (opts) => baseDb.seedEditorSession(opts);
  sqlTag.seedCollaborator = ({ tripId, ownerCustomerId, collaboratorCustomerId = crypto.randomUUID(), email, displayName = 'Collaborator', sessionToken = '' }) => {
    tables.customers.push({ id: collaboratorCustomerId, email, display_name: displayName, first_name: displayName });
    const inviteId = crypto.randomUUID();
    const token = sessionToken || `collab-sess-${crypto.randomBytes(6).toString('hex')}`;
    tables.vacation_collaborators.push({
      id: crypto.randomUUID(),
      invite_id: inviteId,
      owner_customer_id: ownerCustomerId,
      trip_id: tripId,
      display_name: displayName,
      status: 'active',
      metadata: { email: email.toLowerCase(), collaboratorCustomerId, onboardingToken: token },
    });
    const seat = { role: 'collaborator', ownerCustomerId, ownerTripId: tripId, displayName, inviteId };
    tables.onboarding_sessions.push({
      id: crypto.randomUUID(),
      customer_id: collaboratorCustomerId,
      trip_id: tripId,
      token,
      email: email.toLowerCase(),
      display_name: displayName,
      first_name: displayName,
      status: 'purchase_confirmed',
      metadata: { seat },
    });
    return { customerId: collaboratorCustomerId, email: email.toLowerCase(), displayName, token, inviteId, seat };
  };
  return sqlTag;
}
