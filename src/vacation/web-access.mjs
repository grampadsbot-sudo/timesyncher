import crypto from 'node:crypto';

const WEB_ACCESS_COOKIE = 'ts_vacation_web_access';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function siteBase(env = process.env) {
  return String(env.TIMESYNCHER_SITE_BASE_URL || env.SITE_BASE_URL || 'https://www.timesyncher.com').replace(/\/+$/, '');
}

function travelBase(env = process.env) {
  return String(env.TIMESYNCHER_TRAVEL_BASE_URL || env.TIMESYNCHER_PUBLIC_TRAVEL_BASE_URL || 'https://travel.timesyncher.com').replace(/\/+$/, '');
}

function cookieDomain(env = process.env) {
  const configured = clean(env.TIMESYNCHER_WEB_ACCESS_COOKIE_DOMAIN || env.TIMESYNCHER_COOKIE_DOMAIN, 120);
  if (configured) return configured;
  const bases = [siteBase(env), travelBase(env)];
  if (bases.some((base) => {
    try {
      return new URL(base).hostname.endsWith('.timesyncher.com');
    } catch {
      return false;
    }
  })) return '.timesyncher.com';
  return '';
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function editableRole(role = 'web_editor') {
  const normalized = clean(role, 80);
  return ['owner', 'web_editor', 'telegram_collaborator'].includes(normalized) ? normalized : 'web_editor';
}

export function webAccessTokenHash(token, env = process.env) {
  const salt = env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-vacation-web-access';
  return crypto.createHash('sha256').update(`${salt}:${token}`).digest('hex');
}

export function webAccessCookieName() {
  return WEB_ACCESS_COOKIE;
}

export function webAccessAcceptUrl(token, env = process.env) {
  return `${siteBase(env)}/api/vacation-web-access?action=accept&token=${encodeURIComponent(token)}`;
}

export function webAccessTelegramLaunchUrl(token, redirectUrl = '', env = process.env) {
  const url = new URL(`${siteBase(env)}/api/vacation-web-access`);
  url.searchParams.set('action', 'telegram_launch');
  url.searchParams.set('token', token);
  if (redirectUrl) url.searchParams.set('redirect', redirectUrl);
  return url.toString();
}

export function publicTripUrl(trip, env = process.env) {
  const explicitUrl = clean(trip?.metadata?.publicUrl || trip?.metadata?.public_url || trip?.metadata?.webItineraryUrl || '', 600);
  if (explicitUrl) return explicitUrl;
  const slug = clean(trip?.metadata?.sharedToken || trip?.metadata?.shareToken || trip?.metadata?.publicSlug || trip?.metadata?.source_token || trip?.metadata?.slug || '', 220);
  if (slug) return `${travelBase(env)}/shared/${encodeURIComponent(slug).replace(/%2F/gi, '/')}/`;
  return travelBase(env);
}

export async function ensureVacationWebAccessSchema(db) {
  await db`
    create table if not exists vacation_web_access_grants (
      id uuid primary key default gen_random_uuid(),
      owner_customer_id uuid not null references customers(id) on delete cascade,
      trip_id uuid not null references trips(id) on delete cascade,
      email text not null,
      display_name text,
      role text not null default 'web_editor',
      status text not null default 'invited',
      invite_token_hash text unique,
      session_token_hash text unique,
      invited_at timestamptz not null default now(),
      accepted_at timestamptz,
      revoked_at timestamptz,
      expires_at timestamptz,
      last_seen_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (role in ('owner', 'web_editor', 'telegram_collaborator', 'viewer')),
      check (status in ('invited', 'accepted', 'revoked', 'expired'))
    )
  `;
  await db`alter table vacation_web_access_grants drop constraint if exists vacation_web_access_grants_role_check`;
  await db`
    alter table vacation_web_access_grants
    add constraint vacation_web_access_grants_role_check
    check (role in ('owner', 'web_editor', 'telegram_collaborator', 'viewer'))
  `;
  await db`
    create unique index if not exists vacation_web_access_active_email_idx
      on vacation_web_access_grants (trip_id, lower(email), role)
      where status in ('invited', 'accepted')
  `;
}

export async function createWebEditorInvite(db, {
  ownerCustomerId,
  tripId,
  email,
  displayName = '',
  role = 'web_editor',
  metadata = {},
  env = process.env,
}) {
  await ensureVacationWebAccessSchema(db);
  const ownerId = clean(ownerCustomerId, 80);
  const normalizedTripId = clean(tripId, 80);
  const normalizedEmail = clean(email, 180).toLowerCase();
  const normalizedRole = role === 'viewer' ? 'viewer' : editableRole(role);
  if (!ownerId) throw Object.assign(new Error('ownerCustomerId is required.'), { statusCode: 400 });
  if (!normalizedTripId) throw Object.assign(new Error('tripId is required.'), { statusCode: 400 });
  if (!normalizedEmail || !normalizedEmail.includes('@')) throw Object.assign(new Error('Valid invited email is required.'), { statusCode: 400 });

  const ownerTrip = await db`
    select
      trips.*,
      customers.email as owner_email,
      customers.display_name as owner_display_name
    from trips
    join customers on customers.id = trips.customer_id
    where trips.id = ${normalizedTripId}
      and trips.customer_id = ${ownerId}
    limit 1
  `;
  if (!ownerTrip[0]) throw Object.assign(new Error('Only the vacation owner can invite website editors.'), { statusCode: 403 });

  const token = randomToken();
  const rows = await db`
    insert into vacation_web_access_grants (
      owner_customer_id, trip_id, email, display_name, role, status,
      invite_token_hash, expires_at, metadata
    )
    values (
      ${ownerId}, ${normalizedTripId}, ${normalizedEmail}, ${clean(displayName, 180) || null},
      ${normalizedRole}, 'invited', ${webAccessTokenHash(token, env)},
      now() + interval '30 days', ${metadata}
    )
    on conflict (trip_id, lower(email), role) where status in ('invited', 'accepted')
    do update set
      display_name = coalesce(excluded.display_name, vacation_web_access_grants.display_name),
      status = case when vacation_web_access_grants.status = 'accepted' then 'accepted' else 'invited' end,
      invite_token_hash = excluded.invite_token_hash,
      expires_at = excluded.expires_at,
      metadata = vacation_web_access_grants.metadata || excluded.metadata,
      updated_at = now()
    returning *
  `;
  return {
    ok: true,
    grant: {
      ...rows[0],
      trip_title: ownerTrip[0].title,
      owner_email: ownerTrip[0].owner_email,
      owner_display_name: ownerTrip[0].owner_display_name,
      public_url: publicTripUrl(ownerTrip[0], env),
    },
    token,
    acceptUrl: webAccessAcceptUrl(token, env),
  };
}

export async function createTelegramWebAccessSession(db, {
  ownerCustomerId,
  tripId,
  email,
  displayName = '',
  role = 'owner',
  metadata = {},
  env = process.env,
}) {
  await ensureVacationWebAccessSchema(db);
  const ownerId = clean(ownerCustomerId, 80);
  const normalizedTripId = clean(tripId, 80);
  const normalizedEmail = clean(email, 180).toLowerCase();
  const normalizedRole = editableRole(role);
  if (!ownerId) throw Object.assign(new Error('ownerCustomerId is required.'), { statusCode: 400 });
  if (!normalizedTripId) throw Object.assign(new Error('tripId is required.'), { statusCode: 400 });
  if (!normalizedEmail || !normalizedEmail.includes('@')) throw Object.assign(new Error('A linked owner email is required for Telegram website access.'), { statusCode: 400 });

  const ownerTrip = await db`
    select
      trips.*,
      customers.email as owner_email,
      customers.display_name as owner_display_name
    from trips
    join customers on customers.id = trips.customer_id
    where trips.id = ${normalizedTripId}
      and trips.customer_id = ${ownerId}
    limit 1
  `;
  if (!ownerTrip[0]) throw Object.assign(new Error('Only the vacation owner or paid collaborator can create Telegram website access.'), { statusCode: 403 });

  const sessionToken = randomToken();
  const rows = await db`
    insert into vacation_web_access_grants (
      owner_customer_id, trip_id, email, display_name, role, status,
      session_token_hash, accepted_at, expires_at, metadata
    )
    values (
      ${ownerId}, ${normalizedTripId}, ${normalizedEmail}, ${clean(displayName, 180) || null},
      ${normalizedRole}, 'accepted', ${webAccessTokenHash(sessionToken, env)},
      now(), now() + interval '7 days', ${metadata}
    )
    on conflict (trip_id, lower(email), role) where status in ('invited', 'accepted')
    do update set
      display_name = coalesce(excluded.display_name, vacation_web_access_grants.display_name),
      status = 'accepted',
      session_token_hash = excluded.session_token_hash,
      accepted_at = coalesce(vacation_web_access_grants.accepted_at, now()),
      expires_at = excluded.expires_at,
      metadata = vacation_web_access_grants.metadata || excluded.metadata,
      updated_at = now()
    returning *
  `;
  const publicUrl = clean(metadata.publicUrl || metadata.public_url || '', 600) || publicTripUrl(ownerTrip[0], env);
  return {
    ok: true,
    grant: {
      ...rows[0],
      trip_title: ownerTrip[0].title,
      owner_email: ownerTrip[0].owner_email,
      owner_display_name: ownerTrip[0].owner_display_name,
      public_url: publicUrl,
    },
    sessionToken,
    launchUrl: webAccessTelegramLaunchUrl(sessionToken, publicUrl, env),
  };
}

export async function loadWebAccessGrantByInviteToken(db, token, env = process.env) {
  if (!token) return null;
  await ensureVacationWebAccessSchema(db);
  const rows = await db`
    select
      g.*,
      trips.title as trip_title,
      trips.metadata as trip_metadata,
      customers.email as owner_email,
      customers.display_name as owner_display_name
    from vacation_web_access_grants g
    join trips on trips.id = g.trip_id
    left join customers on customers.id = g.owner_customer_id
    where g.invite_token_hash = ${webAccessTokenHash(token, env)}
      and g.status in ('invited', 'accepted')
      and (g.expires_at is null or g.expires_at > now())
    limit 1
  `;
  return rows[0] || null;
}

export async function loadWebAccessGrantBySessionToken(db, token, env = process.env) {
  if (!token) return null;
  await ensureVacationWebAccessSchema(db);
  const rows = await db`
    select
      g.*,
      trips.title as trip_title,
      trips.metadata as trip_metadata,
      customers.email as owner_email,
      customers.display_name as owner_display_name
    from vacation_web_access_grants g
    join trips on trips.id = g.trip_id
    left join customers on customers.id = g.owner_customer_id
    where g.session_token_hash = ${webAccessTokenHash(token, env)}
      and g.role in ('owner', 'web_editor', 'telegram_collaborator')
      and g.status = 'accepted'
      and (g.expires_at is null or g.expires_at > now())
    limit 1
  `;
  if (!rows[0]) return null;
  await db`
    update vacation_web_access_grants
    set last_seen_at = now(), updated_at = now()
    where id = ${rows[0].id}
  `;
  return {
    ...rows[0],
    public_url: publicTripUrl({ metadata: rows[0].trip_metadata }, env),
  };
}

export async function acceptWebAccessInvite(db, token, env = process.env) {
  const grant = await loadWebAccessGrantByInviteToken(db, token, env);
  if (!grant) throw Object.assign(new Error('Website editor invite is invalid or expired.'), { statusCode: 404 });
  const sessionToken = randomToken();
  const rows = await db`
    update vacation_web_access_grants
    set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      session_token_hash = ${webAccessTokenHash(sessionToken, env)},
      last_seen_at = now(),
      updated_at = now(),
      metadata = metadata || ${{
        acceptedVia: 'email_magic_link',
      }}
    where id = ${grant.id}
    returning *
  `;
  return {
    ok: true,
    grant: {
      ...grant,
      ...rows[0],
      public_url: publicTripUrl({ metadata: grant.trip_metadata }, env),
    },
    sessionToken,
  };
}

export function webAccessCookieHeader(sessionToken, env = process.env) {
  const secure = String(env.NODE_ENV || 'production') !== 'development';
  const domain = cookieDomain(env);
  return [
    `${WEB_ACCESS_COOKIE}=${encodeURIComponent(sessionToken)}`,
    'Path=/',
    domain ? `Domain=${domain}` : '',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    'Max-Age=2592000',
  ].filter(Boolean).join('; ');
}

export function readCookie(req, name) {
  const cookie = req?.headers?.cookie || '';
  const parts = String(cookie).split(';').map((part) => part.trim());
  const pair = parts.find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

export async function webAccessForSession(db, {
  sessionToken,
  tripId,
  shareToken = '',
  role = '',
  env = process.env,
}) {
  if (!sessionToken || (!tripId && !shareToken)) return null;
  await ensureVacationWebAccessSchema(db);
  const sessionHash = webAccessTokenHash(sessionToken, env);
  const normalizedShareToken = clean(shareToken, 240);
  const normalizedRole = clean(role, 80);
  const roles = normalizedRole ? [normalizedRole] : ['owner', 'web_editor', 'telegram_collaborator'];
  const rows = tripId
    ? await db`
      select *
      from vacation_web_access_grants
      where session_token_hash = ${sessionHash}
        and trip_id = ${tripId}
        and role = any(${roles})
        and status = 'accepted'
        and (expires_at is null or expires_at > now())
      limit 1
    `
    : await db`
      select g.*
      from vacation_web_access_grants g
      join trips on trips.id = g.trip_id
      where g.session_token_hash = ${sessionHash}
        and g.role = any(${roles})
        and g.status = 'accepted'
        and (g.expires_at is null or g.expires_at > now())
        and (
          g.metadata->>'shareToken' = ${normalizedShareToken}
          or g.metadata->>'sharedToken' = ${normalizedShareToken}
          or g.metadata->>'publicSlug' = ${normalizedShareToken}
          or trips.metadata->>'sharedToken' = ${normalizedShareToken}
          or trips.metadata->>'shareToken' = ${normalizedShareToken}
          or trips.metadata->>'publicSlug' = ${normalizedShareToken}
          or trips.metadata->>'source_token' = ${normalizedShareToken}
          or trips.metadata->>'slug' = ${normalizedShareToken}
        )
      limit 1
    `;
  if (!rows[0]) return null;
  await db`
    update vacation_web_access_grants
    set last_seen_at = now(), updated_at = now()
    where id = ${rows[0].id}
  `;
  return rows[0];
}

export async function requireWebEditAccess(db, req, { tripId, ownerCustomerId = '', env = process.env }) {
  const sessionToken = readCookie(req, WEB_ACCESS_COOKIE) || req?.headers?.['x-timesyncher-web-access-token'] || '';
  const webGrant = await webAccessForSession(db, { sessionToken, tripId, env });
  if (webGrant) return { ok: true, role: webGrant.role, grant: webGrant };

  const ownerToken = req?.headers?.['x-timesyncher-owner-customer-id'] || '';
  if (ownerCustomerId && ownerToken && ownerToken === ownerCustomerId) {
    return { ok: true, role: 'owner' };
  }

  throw Object.assign(new Error('Website editing requires the owner, a paid Telegram collaborator, or an accepted owner-approved email invite.'), { statusCode: 403 });
}
