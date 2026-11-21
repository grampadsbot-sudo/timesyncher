import crypto from 'node:crypto';
import { cleanText } from './http.mjs';
import { hashMcpToken } from './mcp-tokens.mjs';
import { asObject, isoDateOnly, vacationShareSlugForRow } from './mcp-read.mjs';
import { reservationModeLabel } from './mcp-reservations-tools.mjs';

const DEFAULT_RESERVATION_TOKEN_TTL_DAYS = 90;
const MAX_RESERVATION_TOKEN_TTL_DAYS = 180;

function generateRawReservationToken() {
  return `vkr_${crypto.randomBytes(24).toString('base64url')}`;
}

function maskReservationToken(rawToken = '') {
  const token = cleanText(rawToken, 300);
  if (!token) return 'vkr_••••••••••••';
  return `${token.slice(0, 10)}••••••••••••`;
}

async function runIdempotentDdl(step) {
  try {
    await step();
  } catch (error) {
    const code = String(error?.code || '');
    const msg = String(error?.message || '');
    if (code === '42710' || /constraint.*already exists/i.test(msg)) return;
    if (code === '23505' && /pg_type_typname_nsp_index/i.test(msg)) return;
    throw error;
  }
}

export async function ensureVacationReservationsSchema(db) {
  await runIdempotentDdl(() => db`create table if not exists vacation_reservation_connections (id uuid primary key default gen_random_uuid(), account_customer_id uuid not null references customers(id) on delete cascade, account_email text, label text not null default 'Reservations AI', scope text not null default 'reservations', token_hash text not null unique, token_prefix text not null, status text not null default 'pending_handshake', mode text, webhook_url text, poll_interval_minutes integer, ai_client_name text, handshake_completed_at timestamptz, created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz, expires_at timestamptz, metadata jsonb not null default '{}'::jsonb, check (scope = 'reservations'), check (status in ('pending_handshake', 'active', 'revoked')), check (mode is null or mode in ('webhook', 'polling', 'manual')))`);
  await runIdempotentDdl(() => db`create table if not exists vacation_reservation_requests (id uuid primary key default gen_random_uuid(), connection_id uuid references vacation_reservation_connections(id) on delete set null, trip_id uuid not null references trips(id) on delete cascade, requester_customer_id uuid references customers(id) on delete set null, requester_email text, requester_name text, venue_name text not null, category text not null default 'restaurant', requested_date date, requested_time text, party_size integer, request_text text not null default '', notes text, status text not null default 'waiting', thing_id uuid references trip_things(id) on delete set null, confirmation_number text, booked_time text, booked_date date, booked_party_size integer, result_notes text, failure_reason text, alternatives jsonb not null default '[]'::jsonb, webhook_status text, webhook_notified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz, metadata jsonb not null default '{}'::jsonb, check (status in ('waiting', 'booked', 'failed', 'cancelled')))`);
}

function publicReservationConnectionView(row) {
  if (!row) return null;
  const mode = row.mode || null;
  const pollIntervalMinutes = Number.isFinite(Number(row.poll_interval_minutes)) && Number(row.poll_interval_minutes) > 0
    ? Math.round(Number(row.poll_interval_minutes))
    : null;
  return {
    id: String(row.id),
    accountCustomerId: String(row.account_customer_id),
    accountEmail: row.account_email || null,
    label: String(row.label || 'Reservations AI'),
    scope: 'reservations',
    tokenPrefix: String(row.token_prefix || ''),
    status: String(row.status || 'pending_handshake'),
    mode,
    modeLabel: reservationModeLabel(mode, pollIntervalMinutes),
    webhookUrl: row.webhook_url || null,
    pollIntervalMinutes,
    aiClientName: row.ai_client_name || null,
    handshakeCompletedAt: row.handshake_completed_at || null,
    createdAt: row.created_at || null,
    lastUsedAt: row.last_used_at || null,
    revokedAt: row.revoked_at || null,
    expiresAt: row.expires_at || null,
  };
}

function resolveExpiry({ expiresInDays = null, now = () => new Date() } = {}) {
  const daysRaw = Number(expiresInDays);
  const days = Number.isFinite(daysRaw) && daysRaw > 0
    ? Math.min(MAX_RESERVATION_TOKEN_TTL_DAYS, Math.max(1, daysRaw))
    : DEFAULT_RESERVATION_TOKEN_TTL_DAYS;
  return new Date(now().getTime() + Math.round(days * 86400 * 1000)).toISOString();
}

export async function createReservationConnection(db, {
  accountCustomerId,
  accountEmail = null,
  label = 'Reservations AI',
  lastVacationId = null,
  pendingRequestText = '',
  expiresInDays = null,
  metadata = {},
  now = () => new Date(),
  env = process.env,
}) {
  await ensureVacationReservationsSchema(db);
  const customerId = cleanText(accountCustomerId, 80);
  if (!customerId) {
    throw Object.assign(new Error('Account customer id is required to connect reservations AI.'), { statusCode: 400, code: 'missing_account_id' });
  }
  const normalizedEmail = cleanText(accountEmail, 180).toLowerCase() || null;
  const normalizedLabel = cleanText(label, 120) || 'Reservations AI';
  const rawToken = generateRawReservationToken();
  const tokenHash = hashMcpToken(rawToken, env);
  const tokenPrefix = rawToken.slice(0, 10);
  const expiresAt = resolveExpiry({ expiresInDays, now });
  const safeMeta = {
    ...asObject(metadata),
    ...(lastVacationId ? { lastVacationId: String(lastVacationId) } : {}),
    ...(pendingRequestText ? { pendingRequestText: cleanText(pendingRequestText, 600) } : {}),
  };
  const rows = await db`
    insert into vacation_reservation_connections (
      account_customer_id, account_email, label, scope, token_hash, token_prefix,
      status, expires_at, metadata
    ) values (
      ${customerId}, ${normalizedEmail}, ${normalizedLabel}, 'reservations',
      ${tokenHash}, ${tokenPrefix}, 'pending_handshake', ${expiresAt}, ${safeMeta}
    )
    returning *
  `;
  return {
    token: rawToken,
    maskedToken: maskReservationToken(rawToken),
    record: publicReservationConnectionView(rows[0]),
  };
}

export async function authenticateReservationToken(db, rawToken, { env = process.env, now = () => new Date() } = {}) {
  const cleaned = cleanText(rawToken, 300);
  if (!cleaned) return null;
  await ensureVacationReservationsSchema(db);
  const tokenHash = hashMcpToken(cleaned, env);
  const rows = await db`
    select id, account_customer_id, account_email, label, scope, token_prefix,
      status, mode, webhook_url, poll_interval_minutes, ai_client_name,
      handshake_completed_at, created_at, expires_at, metadata
    from vacation_reservation_connections
    where token_hash = ${tokenHash}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.status === 'revoked') {
    throw Object.assign(new Error('AI reservations token has been revoked.'), { statusCode: 401, code: 'mcp_token_revoked' });
  }
  const currentNow = now();
  if (row.expires_at && new Date(row.expires_at).getTime() <= currentNow.getTime()) {
    throw Object.assign(new Error('AI reservations token has expired.'), { statusCode: 401, code: 'mcp_token_expired' });
  }
  await db`
    update vacation_reservation_connections
    set last_used_at = ${currentNow.toISOString()}
    where id = ${row.id}
  `;
  return {
    id: String(row.id),
    connectionId: String(row.id),
    accountCustomerId: String(row.account_customer_id),
    accountEmail: row.account_email ? String(row.account_email).toLowerCase() : null,
    label: String(row.label || 'Reservations AI'),
    tokenScope: 'reservations',
    status: String(row.status),
    mode: row.mode || null,
    webhookUrl: row.webhook_url || null,
    pollIntervalMinutes: row.poll_interval_minutes ?? null,
    aiClientName: row.ai_client_name || null,
    metadata: asObject(row.metadata),
  };
}

export function validateWebhookUrl(rawUrl) {
  const cleaned = cleanText(rawUrl, 600);
  if (!cleaned) return { ok: false, error: 'A valid http or https webhook URL is required for option (a).' };
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Webhook URL must start with https:// or http://.' };
    }
    if (!parsed.hostname) {
      return { ok: false, error: 'Webhook URL must include a valid host.' };
    }
    return { ok: true, url: parsed.toString() };
  } catch (error) {
    void error;
    return { ok: false, error: 'Webhook URL is not a valid web address.' };
  }
}

export async function completeReservationHandshake(db, {
  connectionId,
  mode,
  webhookUrl = null,
  pollIntervalMinutes = null,
  clientName = null,
  lastVacationId = null,
}) {
  await ensureVacationReservationsSchema(db);
  const id = cleanText(connectionId, 80);
  if (!id) throw Object.assign(new Error('Reservations connection id is required.'), { statusCode: 400, code: 'missing_connection_id' });
  const normalizedMode = mode === 'webhook' || mode === 'polling' || mode === 'manual' ? mode : '';
  if (!normalizedMode) {
    throw Object.assign(new Error('Handshake mode must be webhook, polling, or manual.'), { statusCode: 400, code: 'invalid_handshake_mode' });
  }
  let validWebhook = null;
  let validInterval = null;
  if (normalizedMode === 'webhook') {
    const checked = validateWebhookUrl(webhookUrl);
    if (!checked.ok) throw Object.assign(new Error(checked.error), { statusCode: 400, code: 'invalid_webhook_url' });
    validWebhook = checked.url;
  }
  if (normalizedMode === 'polling') {
    const parsed = Math.round(Number(pollIntervalMinutes));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1440) {
      throw Object.assign(new Error('Polling mode requires poll_interval_minutes between 1 and 1440.'), { statusCode: 400, code: 'invalid_poll_interval' });
    }
    validInterval = parsed;
  }
  const safeClientName = cleanText(clientName, 120) || null;
  const rows = await db`
    update vacation_reservation_connections
    set status = 'active',
      mode = ${normalizedMode},
      webhook_url = ${validWebhook},
      poll_interval_minutes = ${validInterval},
      ai_client_name = coalesce(${safeClientName}, ai_client_name),
      handshake_completed_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || ${lastVacationId ? { lastVacationId: String(lastVacationId) } : {}}
    where id = ${id}
      and status <> 'revoked'
    returning *
  `;
  if (!rows[0]) {
    throw Object.assign(new Error('Reservations connection not found or already revoked.'), { statusCode: 404, code: 'connection_not_found' });
  }
  return publicReservationConnectionView(rows[0]);
}

export async function getActiveReservationConnectionForAccount(db, { accountCustomerId, accountEmail = null }) {
  await ensureVacationReservationsSchema(db);
  const customerId = cleanText(accountCustomerId, 80);
  const email = cleanText(accountEmail, 180).toLowerCase();
  if (!customerId && !email) return null;
  const rows = await db`
    select *
    from vacation_reservation_connections
    where status = 'active'
      and (expires_at is null or expires_at > now())
      and (
        account_customer_id = ${customerId || null}
        or (${email || ''} <> '' and lower(coalesce(account_email, '')) = ${email || ''})
      )
    order by handshake_completed_at desc nulls last, created_at desc
    limit 1
  `;
  return rows[0] || null;
}

export async function getLatestPendingReservationConnectionForAccount(db, { accountCustomerId, accountEmail = null }) {
  await ensureVacationReservationsSchema(db);
  const customerId = cleanText(accountCustomerId, 80);
  const email = cleanText(accountEmail, 180).toLowerCase();
  if (!customerId && !email) return null;
  const rows = await db`
    select *
    from vacation_reservation_connections
    where status in ('pending_handshake', 'active')
      and (expires_at is null or expires_at > now())
      and (
        account_customer_id = ${customerId || null}
        or (${email || ''} <> '' and lower(coalesce(account_email, '')) = ${email || ''})
      )
    order by case when status = 'pending_handshake' then 0 else 1 end, created_at desc
    limit 1
  `;
  return rows[0] || null;
}

export async function listAccountVacations(db, { accountCustomerId, accountEmail = null }) {
  const customerId = cleanText(accountCustomerId, 80);
  const email = cleanText(accountEmail, 180).toLowerCase();
  const byId = new Map();

  if (customerId) {
    const owned = await db`
      select id, customer_id, title, destination, start_date, end_date, status, metadata
      from trips
      where customer_id = ${customerId}
      order by created_at desc
    `;
    for (const row of owned) {
      byId.set(String(row.id), { row, role: 'owner' });
    }
  }

  const collabTripIds = new Set();
  if (email) {
    try {
      const collabRows = await db`
        select trip_id, metadata
        from vacation_collaborators
        where status = 'active'
      `;
      for (const row of collabRows) {
        const meta = asObject(row.metadata);
        const rowEmail = cleanText(meta.email, 180).toLowerCase();
        const rowCid = cleanText(meta.collaboratorCustomerId, 80);
        if ((rowEmail && rowEmail === email) || (customerId && rowCid && rowCid === customerId)) {
          if (row.trip_id) collabTripIds.add(String(row.trip_id));
        }
      }
    } catch (error) {
      void error;
    }
    try {
      const grantRows = await db`
        select trip_id, role, email
        from vacation_web_access_grants
        where status = 'accepted'
          and lower(email) = ${email}
          and role in ('owner', 'web_editor', 'telegram_collaborator')
      `;
      for (const row of grantRows) {
        if (row.trip_id) collabTripIds.add(String(row.trip_id));
      }
    } catch (error) {
      void error;
    }
  }
  if (customerId) {
    try {
      const seatRows = await db`
        select trip_id, metadata
        from onboarding_sessions
        where customer_id = ${customerId}
      `;
      for (const row of seatRows) {
        const seat = asObject(asObject(row.metadata).seat);
        const seatTripId = cleanText(seat.ownerTripId || row.trip_id, 80);
        if (seatTripId) collabTripIds.add(seatTripId);
      }
    } catch (error) {
      void error;
    }
  }

  for (const tid of collabTripIds) {
    if (byId.has(tid)) continue;
    const found = await db`
      select id, customer_id, title, destination, start_date, end_date, status, metadata
      from trips
      where id = ${tid}
      limit 1
    `;
    if (found[0]) {
      const isOwner = customerId && String(found[0].customer_id || '') === customerId;
      byId.set(tid, { row: found[0], role: isOwner ? 'owner' : 'collaborator' });
    }
  }

  return [...byId.values()].map(({ row, role }) => {
    const meta = asObject(row.metadata);
    return {
      vacation_id: String(row.id),
      title: String(row.title || 'Vacation'),
      destination: String(row.destination || ''),
      start_date: isoDateOnly(row.start_date) || null,
      end_date: isoDateOnly(row.end_date) || null,
      timezone: cleanText(meta.timezone || meta.timeZone, 80) || 'UTC',
      share_slug: vacationShareSlugForRow(row),
      role,
      owner_customer_id: row.customer_id ? String(row.customer_id) : null,
    };
  });
}

export async function assertAccountVacationAccess(db, account, vacationId) {
  const targetId = cleanText(vacationId, 80);
  if (!targetId) {
    throw Object.assign(new Error('vacation_id is required.'), { statusCode: 400, code: 'missing_vacation_id' });
  }
  const vacations = await listAccountVacations(db, account);
  const match = vacations.find((v) => v.vacation_id === targetId);
  if (!match) {
    throw Object.assign(
      new Error('This reservations connection does not have access to that vacation.'),
      { statusCode: 403, code: 'vacation_access_denied' },
    );
  }
  return match;
}

export async function listReservationConnectionsForAccountOrTrip(db, {
  tripId = null,
  ownerCustomerId = null,
  accountCustomerId = null,
  accountEmail = null,
}) {
  await ensureVacationReservationsSchema(db);
  const customerIds = new Set([ownerCustomerId, accountCustomerId].map((v) => cleanText(v, 80)).filter(Boolean));
  const emails = new Set([accountEmail].map((v) => cleanText(v, 180).toLowerCase()).filter(Boolean));
  if (tripId) {
    try {
      const collabRows = await db`
        select metadata
        from vacation_collaborators
        where trip_id = ${tripId}
          and status = 'active'
      `;
      for (const row of collabRows) {
        const meta = asObject(row.metadata);
        if (meta.collaboratorCustomerId) customerIds.add(cleanText(meta.collaboratorCustomerId, 80));
        if (meta.email) emails.add(cleanText(meta.email, 180).toLowerCase());
      }
    } catch (error) {
      void error;
    }
  }
  const allRows = await db`
    select *
    from vacation_reservation_connections
    order by created_at desc
  `;
  return allRows
    .filter((row) => {
      if (customerIds.has(String(row.account_customer_id || ''))) return true;
      const rowEmail = cleanText(row.account_email, 180).toLowerCase();
      if (rowEmail && emails.has(rowEmail)) return true;
      const lastVid = cleanText(asObject(row.metadata).lastVacationId, 80);
      return Boolean(tripId && lastVid === String(tripId));
    })
    .map(publicReservationConnectionView);
}

export async function revokeReservationConnection(db, {
  connectionId,
  allowedCustomerIds = [],
  allowedEmails = [],
  tripId = null,
}) {
  await ensureVacationReservationsSchema(db);
  const id = cleanText(connectionId, 80);
  if (!id) throw Object.assign(new Error('Connection id is required.'), { statusCode: 400, code: 'invalid_revoke_request' });
  const existing = await db`
    select *
    from vacation_reservation_connections
    where id = ${id}
    limit 1
  `;
  const row = existing[0];
  if (!row) {
    throw Object.assign(new Error('Reservations connection not found.'), { statusCode: 404, code: 'connection_not_found' });
  }
  const cidSet = new Set(allowedCustomerIds.map((v) => cleanText(v, 80)).filter(Boolean));
  const emailSet = new Set(allowedEmails.map((v) => cleanText(v, 180).toLowerCase()).filter(Boolean));
  const rowEmail = cleanText(row.account_email, 180).toLowerCase();
  const lastVid = cleanText(asObject(row.metadata).lastVacationId, 80);
  const permitted = cidSet.has(String(row.account_customer_id || ''))
    || (rowEmail && emailSet.has(rowEmail))
    || (tripId && lastVid === String(tripId));
  if (!permitted) {
    throw Object.assign(new Error('You do not have permission to revoke this reservations connection.'), { statusCode: 403, code: 'connection_access_denied' });
  }
  const rows = await db`
    update vacation_reservation_connections
    set status = 'revoked', revoked_at = now()
    where id = ${id}
    returning *
  `;
  return publicReservationConnectionView(rows[0]);
}
