import crypto from 'node:crypto';
import { cleanText } from './http.mjs';

const DEFAULT_UPLOAD_TTL_SECONDS = 900;
const DEFAULT_TOKEN_TTL_DAYS = 30;
const MAX_TOKEN_TTL_DAYS = 90;

function tokenSalt(env = process.env) {
  return String(
    env.TIMESYNCHER_MCP_TOKEN_SALT
    || env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT
    || env.TIMESYNCHER_AUDIT_HASH_SALT
    || 'vacay-keepsake-mcp-token-salt',
  );
}

function uploadSigningSecret(env = process.env) {
  return String(
    env.TIMESYNCHER_MCP_UPLOAD_SIGNING_SECRET
    || env.TIMESYNCHER_MCP_TOKEN_SALT
    || env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT
    || 'vacay-keepsake-mcp-upload-signing-secret',
  );
}

export function hashMcpToken(rawToken, env = process.env) {
  const cleaned = cleanText(rawToken, 300);
  return crypto.createHash('sha256').update(`${tokenSalt(env)}:${cleaned}`).digest('hex');
}

function generateRawMcpToken() {
  return `vkm_${crypto.randomBytes(24).toString('base64url')}`;
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

export async function ensureVacationMcpSchema(db) {
  await runIdempotentDdl(() => db`
    create table if not exists vacation_mcp_tokens (
      id uuid primary key default gen_random_uuid(),
      trip_id uuid not null references trips(id) on delete cascade,
      owner_customer_id uuid references customers(id) on delete set null,
      created_by_email text,
      label text not null default 'AI access',
      role text not null default 'collaborator',
      token_hash text not null unique,
      token_prefix text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      last_used_at timestamptz,
      revoked_at timestamptz,
      expires_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      check (role in ('owner', 'collaborator')),
      check (status in ('active', 'revoked'))
    )
  `);
  await runIdempotentDdl(() => db`
    create table if not exists vacation_mcp_change_sets (
      id uuid primary key default gen_random_uuid(),
      scope_trip_id uuid not null references trips(id) on delete cascade,
      target_trip_id uuid references trips(id) on delete set null,
      published_trip_id uuid references trips(id) on delete set null,
      token_id uuid references vacation_mcp_tokens(id) on delete set null,
      kind text not null,
      apply_mode text not null default 'create_new',
      status text not null default 'draft',
      summary text not null default '',
      payload jsonb not null default '{}'::jsonb,
      preview jsonb not null default '{}'::jsonb,
      committed_at timestamptz,
      reviewed_at timestamptz,
      reviewed_by text,
      review_note text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (kind in ('draft_import', 'targeted_edit')),
      check (apply_mode in ('create_new', 'populate_scoped', 'targeted_edit')),
      check (status in ('draft', 'pending_approval', 'approved', 'declined'))
    )
  `);
  await runIdempotentDdl(() => db`
    create table if not exists vacation_mcp_draft_media (
      id uuid primary key default gen_random_uuid(),
      scope_trip_id uuid not null references trips(id) on delete cascade,
      change_set_id uuid references vacation_mcp_change_sets(id) on delete cascade,
      filename text not null,
      mime_type text not null,
      media_kind text not null default 'photo',
      expected_bytes bigint,
      actual_bytes bigint not null default 0,
      upload_status text not null default 'signed',
      upload_token_hash text not null unique,
      upload_expires_at timestamptz not null,
      storage_provider text not null default 'pending',
      storage_pathname text,
      public_url text,
      caption text,
      target_thing_ref text,
      assigned_day_date date,
      assigned_day_number integer,
      assignment_bucket text not null default 'unassigned',
      exif_captured_at timestamptz,
      exif_lat double precision,
      exif_lng double precision,
      exif_raw jsonb not null default '{}'::jsonb,
      file_bytes bytea,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (media_kind in ('photo', 'video')),
      check (upload_status in ('signed', 'uploaded', 'finalized', 'published', 'expired')),
      check (assignment_bucket in ('day', 'thing', 'unassigned'))
    )
  `);
  await runIdempotentDdl(() => db`
    create table if not exists vacation_media_usage (
      trip_id uuid primary key references trips(id) on delete cascade,
      total_bytes bigint not null default 0,
      media_count integer not null default 0,
      updated_at timestamptz not null default now()
    )
  `);
}

function publicTokenView(row) {
  return {
    id: String(row.id),
    vacationId: String(row.trip_id),
    label: String(row.label || 'AI access'),
    role: String(row.role || 'collaborator'),
    tokenPrefix: String(row.token_prefix || ''),
    status: String(row.status || 'active'),
    createdByEmail: row.created_by_email || null,
    createdAt: row.created_at || null,
    lastUsedAt: row.last_used_at || null,
    revokedAt: row.revoked_at || null,
    expiresAt: row.expires_at || null,
  };
}

function resolveTokenExpiry({ expiresAt = null, expiresInDays = null, now = () => new Date() } = {}) {
  const currentMs = now().getTime();
  const maxMs = currentMs + MAX_TOKEN_TTL_DAYS * 86400 * 1000;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (!Number.isNaN(parsed.getTime())) {
      const clampedMs = Math.min(maxMs, parsed.getTime());
      return new Date(clampedMs).toISOString();
    }
  }
  const daysRaw = Number(expiresInDays);
  const days = Number.isFinite(daysRaw) && daysRaw > 0
    ? Math.min(MAX_TOKEN_TTL_DAYS, Math.max(1 / 24, daysRaw))
    : DEFAULT_TOKEN_TTL_DAYS;
  return new Date(currentMs + Math.round(days * 86400 * 1000)).toISOString();
}

export async function createMcpToken(db, {
  tripId,
  ownerCustomerId = null,
  createdByEmail = null,
  label = 'AI access',
  role = 'collaborator',
  expiresAt = null,
  expiresInDays = null,
  metadata = {},
  now = () => new Date(),
  env = process.env,
}) {
  await ensureVacationMcpSchema(db);
  const scopedTripId = cleanText(tripId, 80);
  if (!scopedTripId) throw Object.assign(new Error('Vacation id is required to create an AI access token.'), { statusCode: 400, code: 'missing_vacation_id' });
  const normalizedRole = role === 'owner' ? 'owner' : 'collaborator';
  const normalizedLabel = cleanText(label, 120) || 'AI access';
  const rawToken = generateRawMcpToken();
  const tokenHash = hashMcpToken(rawToken, env);
  const tokenPrefix = rawToken.slice(0, 10);
  const effectiveExpiresAt = resolveTokenExpiry({ expiresAt, expiresInDays, now });
  const safeMeta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const rows = await db`
    insert into vacation_mcp_tokens (
      trip_id, owner_customer_id, created_by_email, label, role,
      token_hash, token_prefix, status, expires_at, metadata
    ) values (
      ${scopedTripId}, ${ownerCustomerId || null}, ${cleanText(createdByEmail, 180) || null},
      ${normalizedLabel}, ${normalizedRole}, ${tokenHash}, ${tokenPrefix},
      'active', ${effectiveExpiresAt}, ${safeMeta}
    )
    returning *
  `;
  return {
    token: rawToken,
    record: publicTokenView(rows[0]),
  };
}

export async function listMcpTokens(db, { tripId }) {
  await ensureVacationMcpSchema(db);
  const scopedTripId = cleanText(tripId, 80);
  if (!scopedTripId) return [];
  const rows = await db`
    select id, trip_id, created_by_email, label, role, token_prefix, status, created_at, last_used_at, revoked_at, expires_at
    from vacation_mcp_tokens
    where trip_id = ${scopedTripId}
    order by created_at desc
  `;
  return rows.map(publicTokenView);
}

export async function revokeMcpToken(db, { tripId, tokenId }) {
  await ensureVacationMcpSchema(db);
  const scopedTripId = cleanText(tripId, 80);
  const normalizedTokenId = cleanText(tokenId, 80);
  if (!scopedTripId || !normalizedTokenId) {
    throw Object.assign(new Error('Vacation id and token id are required.'), { statusCode: 400, code: 'invalid_revoke_request' });
  }
  const rows = await db`
    update vacation_mcp_tokens
    set status = 'revoked', revoked_at = now()
    where id = ${normalizedTokenId}
      and trip_id = ${scopedTripId}
    returning id, trip_id, created_by_email, label, role, token_prefix, status, created_at, last_used_at, revoked_at, expires_at
  `;
  if (!rows[0]) {
    throw Object.assign(new Error('AI access token not found for this vacation.'), { statusCode: 404, code: 'token_not_found' });
  }
  return publicTokenView(rows[0]);
}

export async function authenticateMcpToken(db, rawToken, { env = process.env, now = () => new Date() } = {}) {
  const cleaned = cleanText(rawToken, 300);
  if (!cleaned) {
    throw Object.assign(new Error('AI access token is required.'), { statusCode: 401, code: 'mcp_token_required' });
  }
  await ensureVacationMcpSchema(db);
  const tokenHash = hashMcpToken(cleaned, env);
  const rows = await db`
    select id, trip_id, owner_customer_id, created_by_email, label, role, status, expires_at, metadata
    from vacation_mcp_tokens
    where token_hash = ${tokenHash}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error('AI access token is invalid.'), { statusCode: 401, code: 'mcp_token_invalid' });
  }
  if (row.status !== 'active') {
    throw Object.assign(new Error('AI access token has been revoked.'), { statusCode: 401, code: 'mcp_token_revoked' });
  }
  const currentNow = now();
  if (row.expires_at && new Date(row.expires_at).getTime() <= currentNow.getTime()) {
    throw Object.assign(new Error('AI access token has expired.'), { statusCode: 401, code: 'mcp_token_expired' });
  }
  await db`
    update vacation_mcp_tokens
    set last_used_at = ${currentNow.toISOString()}
    where id = ${row.id}
  `;
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    ownerCustomerId: row.owner_customer_id ? String(row.owner_customer_id) : null,
    createdByEmail: row.created_by_email || null,
    label: String(row.label || 'AI access'),
    role: String(row.role || 'collaborator'),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

export function assertVacationScope(tokenRecord, requestedVacationId) {
  const requested = cleanText(requestedVacationId, 80);
  if (!requested) return tokenRecord.tripId;
  if (requested !== tokenRecord.tripId) {
    throw Object.assign(
      new Error('This AI access token is scoped to a different vacation.'),
      { statusCode: 403, code: 'vacation_scope_mismatch' },
    );
  }
  return tokenRecord.tripId;
}

function hmacSignature(payload, env = process.env) {
  return crypto.createHmac('sha256', uploadSigningSecret(env)).update(payload).digest('base64url');
}

export function signMediaUploadUrl({
  mediaId,
  tripId,
  baseUrl,
  ttlSeconds = DEFAULT_UPLOAD_TTL_SECONDS,
  now = () => new Date(),
  env = process.env,
}) {
  const nowMs = now().getTime();
  const safeTtl = Math.max(30, Math.min(3600, Number(ttlSeconds) || DEFAULT_UPLOAD_TTL_SECONDS));
  const expiresAtDate = new Date(nowMs + safeTtl * 1000);
  const exp = Math.floor(expiresAtDate.getTime() / 1000);
  const sig = hmacSignature(`${mediaId}:${tripId}:${exp}`, env);
  const origin = String(baseUrl || env.TIMESYNCHER_SITE_BASE_URL || 'https://www.timesyncher.com').replace(/\/+$/, '');
  const uploadUrl = `${origin}/api/mcp/upload/${encodeURIComponent(mediaId)}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
  return {
    uploadUrl,
    expiresAt: expiresAtDate.toISOString(),
    exp,
    sig,
    uploadTokenHash: hashMcpToken(`${mediaId}:${exp}:${sig}`, env),
  };
}

export function verifyMediaUploadSignature({
  mediaId,
  tripId,
  exp,
  sig,
  now = () => new Date(),
  env = process.env,
}) {
  const expSec = Number(exp);
  if (!Number.isFinite(expSec) || expSec <= 0) {
    return { ok: false, statusCode: 403, code: 'invalid_upload_signature', error: 'Upload URL signature is invalid.' };
  }
  const nowSec = Math.floor(now().getTime() / 1000);
  if (nowSec > expSec) {
    return { ok: false, statusCode: 410, code: 'upload_url_expired', error: 'Signed upload URL has expired.' };
  }
  const expected = hmacSignature(`${mediaId}:${tripId}:${expSec}`, env);
  const left = Buffer.from(String(sig || ''));
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, statusCode: 403, code: 'invalid_upload_signature', error: 'Upload URL signature is invalid.' };
  }
  return { ok: true };
}
