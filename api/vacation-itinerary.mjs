import { requireIntakeAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { queueOrSendWebEditorInviteEmail } from '../src/vacation/email.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import {
  acceptWebAccessInvite,
  createWebEditorInvite,
  loadWebAccessGrantBySessionToken,
  readCookie,
  requireWebEditAccess,
  webAccessCookieHeader,
  webAccessCookieName,
  webAccessForSession,
} from '../src/vacation/web-access.mjs';

function sendHtml(res, status, html, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(html);
}

function acceptedHtml({ grant }) {
  const trip = cleanText(grant.trip_title || 'this vacation', 180);
  const url = cleanText(grant.public_url || '', 500);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website editing enabled</title>
<style>body{margin:0;min-height:100vh;background:#070706;color:#fffaf0;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;padding:24px}main{max-width:640px;border:1px solid rgba(245,211,123,.28);border-radius:8px;padding:28px;background:#12110f}h1{font-family:Georgia,serif;color:#f5d37b;margin:0 0 12px}p{color:#cfc2a9;line-height:1.5}a{color:#f5d37b}</style></head>
<body><main><h1>Website editing enabled</h1><p>You can now edit ${trip} on the website when this browser is used.</p>${url ? `<p><a href="${url}">Open ${trip}</a></p>` : ''}</main></body></html>`;
}

async function handleWebAccess(req, res, db, url) {
  const action = cleanText(url.searchParams.get('action'), 80);
  if (req.method === 'GET' && action === 'accept') {
    const token = cleanText(url.searchParams.get('token'), 220);
    const accepted = await acceptWebAccessInvite(db, token, process.env);
    return sendHtml(res, 200, acceptedHtml(accepted), {
      'set-cookie': webAccessCookieHeader(accepted.sessionToken, process.env),
    });
  }

  if (req.method === 'GET' && action === 'telegram_launch') {
    const token = cleanText(url.searchParams.get('token'), 220);
    const requestedRedirect = cleanText(url.searchParams.get('redirect'), 600);
    const grant = await loadWebAccessGrantBySessionToken(db, token, process.env);
    if (!grant) return sendHtml(res, 404, '<!doctype html><title>Link expired</title><p>This Telegram website-edit link is invalid or expired. Ask the bot for a fresh vacation website link.</p>');
    const fallbackUrl = cleanText(grant.public_url, 600) || 'https://travel.timesyncher.com';
    const redirectUrl = requestedRedirect && requestedRedirect.startsWith('https://travel.timesyncher.com/')
      ? requestedRedirect
      : fallbackUrl;
    res.statusCode = 302;
    res.setHeader('cache-control', 'no-store');
    res.setHeader('set-cookie', webAccessCookieHeader(token, process.env));
    res.setHeader('location', redirectUrl);
    res.end('');
    return;
  }

  if (req.method === 'GET' && action === 'status') {
    const tripId = cleanText(url.searchParams.get('tripId'), 80);
    const shareToken = cleanText(url.searchParams.get('shareToken') || url.searchParams.get('publicSlug'), 240);
    const sessionToken = readCookie(req, webAccessCookieName()) || req.headers['x-timesyncher-web-access-token'] || '';
    const grant = await webAccessForSession(db, { sessionToken, tripId, shareToken, env: process.env });
    return sendJson(res, 200, {
      ok: true,
      canEdit: Boolean(grant),
      role: grant ? grant.role : 'viewer',
      email: grant?.email || null,
      tripId: tripId || grant?.trip_id || null,
      shareToken: shareToken || null,
    });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    if (body.action === 'create_web_editor_invite') {
      requireIntakeAuth(req, process.env);
      const invite = await createWebEditorInvite(db, {
        ownerCustomerId: cleanText(body.ownerCustomerId || body.customerId, 80),
        tripId: cleanText(body.tripId, 80),
        email: cleanText(body.email, 180),
        displayName: cleanText(body.displayName || body.name, 180),
        metadata: {
          source: 'vacation_web_access_api',
          requestedBy: cleanText(body.requestedBy, 120) || null,
        },
        env: process.env,
      });
      const email = await queueOrSendWebEditorInviteEmail(db, invite, process.env);
      return sendJson(res, 200, {
        ok: true,
        grantId: invite.grant.id,
        status: invite.grant.status,
        acceptUrl: invite.acceptUrl,
        email,
      });
    }

    if (body.action === 'assert_can_edit') {
      const result = await requireWebEditAccess(db, req, {
        tripId: cleanText(body.tripId, 80),
        ownerCustomerId: cleanText(body.ownerCustomerId, 80),
        env: process.env,
      });
      return sendJson(res, 200, { ok: true, canEdit: true, role: result.role });
    }
  }

  return sendJson(res, 404, { ok: false, error: 'unknown website access action' });
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key] || 'other';
    groups[value] = groups[value] || [];
    groups[value].push(item);
    return groups;
  }, {});
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'https://timesyncher.com');
    const db = sql(process.env);
    if (url.searchParams.get('webAccess') === '1' || url.pathname.endsWith('/vacation-web-access')) {
      return await handleWebAccess(req, res, db, url);
    }

    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    const token = cleanText(url.searchParams.get('session') || url.searchParams.get('token'), 160);
    if (!token) return sendJson(res, 400, { ok: false, error: 'session is required.' });

    const sessions = await db`
      select
        onboarding_sessions.token,
        onboarding_sessions.status as onboarding_status,
        trips.id as trip_id,
        trips.title,
        trips.start_date,
        trips.end_date,
        trips.destination,
        trips.status,
        customers.display_name,
        customers.first_name,
        customers.last_name
      from onboarding_sessions
      join trips on trips.id = onboarding_sessions.trip_id
      left join customers on customers.id = onboarding_sessions.customer_id
      where onboarding_sessions.token = ${token}
      limit 1
    `;
    const session = sessions[0];
    if (!session) return sendJson(res, 404, { ok: false, error: 'Itinerary not found.' });

    const things = await db`
      select id, category, subtype, title, description, starts_at, ends_at, cost_estimate_cents,
        currency, location, links, ratings, metadata, created_at
      from trip_things
      where trip_id = ${session.trip_id}
      order by
        coalesce(starts_at, created_at) asc,
        case category
          when 'transport' then 1
          when 'hotel' then 2
          when 'activity' then 3
          when 'restaurant' then 4
          else 9
        end,
        created_at asc
    `;
    const budgets = await db`
      select category, label, amount_cents, currency, metadata, created_at
      from budget_items
      where trip_id = ${session.trip_id}
      order by created_at asc
    `;
    await db`
      create table if not exists vacation_media_uploads (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid references customers(id) on delete set null,
        trip_id uuid references trips(id) on delete cascade,
        telegram_session_id uuid references telegram_sessions(id) on delete set null,
        public_token text not null unique,
        media_kind text not null,
        attachment_scope text not null default 'trip',
        thing_id uuid references trip_things(id) on delete set null,
        day_date date,
        caption text,
        mime_type text,
        original_name text,
        file_size_bytes bigint,
        width integer,
        height integer,
        duration_seconds integer,
        telegram_file_id text,
        telegram_file_unique_id text,
        telegram_file_path text,
        telegram_message_id text,
        telegram_chat_id text,
        telegram_user_id text,
        storage_provider text not null default 'telegram',
        status text not null default 'active',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    const media = await db`
      select id, public_token, media_kind, attachment_scope, day_date, caption, mime_type,
        file_size_bytes, width, height, duration_seconds, created_at
      from vacation_media_uploads
      where trip_id = ${session.trip_id}
        and status = 'active'
      order by created_at desc
      limit 200
    `;
    const origin = `https://${req.headers.host || 'vacation.timesyncher.com'}`;

    return sendJson(res, 200, {
      ok: true,
      trip: {
        title: session.title,
        destination: session.destination,
        startDate: session.start_date,
        endDate: session.end_date,
        status: session.status,
        travelerName: session.display_name || [session.first_name, session.last_name].filter(Boolean).join(' '),
      },
      sections: groupBy(things, 'category'),
      things,
      budgets,
      media: media.map((item) => ({
        id: item.id,
        kind: item.media_kind,
        attachmentScope: item.attachment_scope,
        dayDate: item.day_date,
        caption: item.caption,
        mimeType: item.mime_type,
        fileSizeBytes: item.file_size_bytes,
        width: item.width,
        height: item.height,
        durationSeconds: item.duration_seconds,
        createdAt: item.created_at,
        url: `${origin}/api/vacation-telegram-turn?action=media-download&id=${encodeURIComponent(item.id)}&token=${encodeURIComponent(item.public_token)}`,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to load itinerary.' });
  }
}
