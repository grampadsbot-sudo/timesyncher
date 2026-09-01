import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { requireIntakeAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { queueOrSendWebEditorInviteEmail } from '../src/vacation/email.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { classifyTurn } from '../src/vacation/turn-tags.mjs';
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


const MAX_WEBSITE_AUDIO_NOTE_BYTES = 3 * 1024 * 1024;
const MAX_WEBSITE_MEDIA_BYTES = Number.parseInt(process.env.TIMESYNCHER_WEB_MEDIA_MAX_BYTES || '4194304', 10);
const MAX_WEBSITE_VIDEO_SECONDS = Number.parseInt(process.env.TIMESYNCHER_WEB_VIDEO_MAX_SECONDS || '120', 10);

async function ensureMediaSchema(db) {
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
      updated_at timestamptz not null default now(),
      check (media_kind in ('photo', 'video')),
      check (attachment_scope in ('trip', 'day', 'thing'))
    )
  `;
  await db`alter table vacation_media_uploads add column if not exists thing_id uuid references trip_things(id) on delete set null`;
  await db`alter table vacation_media_uploads add column if not exists storage_provider text not null default 'telegram'`;
  await db`create index if not exists idx_vacation_media_trip_kind on vacation_media_uploads(trip_id, media_kind, created_at)`;
  await db`create index if not exists idx_vacation_media_thing on vacation_media_uploads(thing_id, created_at)`;
  await db`create index if not exists idx_vacation_media_public_token on vacation_media_uploads(public_token)`;
}

function parseAudioDataUrl(value) {
  const raw = String(value || '');
  if (!raw) throw Object.assign(new Error('Audio note is required.'), { statusCode: 400 });
  const match = raw.match(/^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*)(?:\s*;[^,;]*)*;\s*base64\s*,([a-z0-9+/=\r\n]+)$/i);
  if (!match) throw Object.assign(new Error('Audio note must be a base64 data URL.'), { statusCode: 400 });
  const mimeType = cleanText(match[1].toLowerCase(), 80);
  if (!/^(audio|video)\//.test(mimeType)) throw Object.assign(new Error('Audio note must use an audio MIME type.'), { statusCode: 400 });
  const base64 = match[2].replace(/\s/g, '');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw Object.assign(new Error('Audio note was empty.'), { statusCode: 400 });
  if (bytes.length > MAX_WEBSITE_AUDIO_NOTE_BYTES) {
    throw Object.assign(new Error('Audio note is too large. Please keep recordings under about 45 seconds.'), { statusCode: 413 });
  }
  return { bytes, mimeType };
}

function parseMediaDataUrl(value) {
  const raw = String(value || '');
  if (!raw) throw Object.assign(new Error('Media file is required.'), { statusCode: 400 });
  const match = raw.match(/^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*)(?:\s*;[^,;]*)*;\s*base64\s*,([a-z0-9+/=\r\n]+)$/i);
  if (!match) throw Object.assign(new Error('Media must be a base64 data URL.'), { statusCode: 400 });
  const mimeType = cleanText(match[1].toLowerCase(), 120);
  const mediaKind = mimeType.startsWith('image/') ? 'photo' : mimeType.startsWith('video/') ? 'video' : '';
  if (!mediaKind) throw Object.assign(new Error('Only image and video uploads are supported.'), { statusCode: 400 });
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length) throw Object.assign(new Error('Media file was empty.'), { statusCode: 400 });
  if (bytes.length > MAX_WEBSITE_MEDIA_BYTES) {
    throw Object.assign(new Error(`Please use a compressed file under ${Math.floor(MAX_WEBSITE_MEDIA_BYTES / 1024 / 1024)} MB.`), { statusCode: 413 });
  }
  return { bytes, mimeType, mediaKind };
}

function mediaExtension(mimeType = '') {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  return mimeType.startsWith('video/') ? 'mp4' : 'jpg';
}

function audioExtension(mimeType = '') {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

async function transcribeWebsiteAudioNote({ bytes, mimeType }) {
  const apiKey = process.env.TIMESYNCHER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw Object.assign(new Error('Website audio note transcription is not configured yet.'), { statusCode: 503 });
  const model = process.env.TIMESYNCHER_STT_MODEL || 'whisper-1';
  const form = new FormData();
  form.append('model', model);
  form.append('file', new Blob([bytes], { type: mimeType }), `website-audio-note.${audioExtension(mimeType)}`);
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.error?.message || `Website audio note transcription failed with ${response.status}.`), { statusCode: 502 });
  const text = cleanText(json.text, 12000);
  if (!text) throw Object.assign(new Error('Website audio note transcription returned empty text.'), { statusCode: 422 });
  return { text, model };
}

async function loadItinerarySession(db, token) {
  const sessions = await db`
    select
      onboarding_sessions.token,
      onboarding_sessions.customer_id,
      onboarding_sessions.trip_id,
      trips.customer_id as owner_customer_id,
      trips.title,
      trips.destination,
      customers.display_name,
      customers.first_name,
      customers.last_name
    from onboarding_sessions
    join trips on trips.id = onboarding_sessions.trip_id
    left join customers on customers.id = onboarding_sessions.customer_id
    where onboarding_sessions.token = ${token}
    limit 1
  `;
  return sessions[0] || null;
}

async function loadItinerarySessionByShareToken(db, shareToken) {
  const token = cleanText(shareToken, 240);
  if (!token) return null;
  const sessions = await db`
    select
      onboarding_sessions.token,
      onboarding_sessions.customer_id,
      onboarding_sessions.trip_id,
      trips.customer_id as owner_customer_id,
      trips.title,
      trips.destination,
      customers.display_name,
      customers.first_name,
      customers.last_name
    from trips
    left join onboarding_sessions on onboarding_sessions.trip_id = trips.id
    left join customers on customers.id = trips.customer_id
    where
      trips.metadata->>'sharedToken' = ${token}
      or trips.metadata->>'shareToken' = ${token}
      or trips.metadata->>'publicSlug' = ${token}
      or trips.metadata->>'source_token' = ${token}
      or trips.metadata->>'slug' = ${token}
    order by onboarding_sessions.updated_at desc nulls last
    limit 1
  `;
  return sessions[0] || null;
}

async function handleWebsiteAudioNote(req, res, db, body) {
  const token = cleanText(body.session || body.token, 160);
  const shareToken = cleanText(body.shareToken || body.publicSlug, 240);
  if (!token && !shareToken) throw Object.assign(new Error('session or shareToken is required.'), { statusCode: 400 });
  const session = token
    ? await loadItinerarySession(db, token)
    : await loadItinerarySessionByShareToken(db, shareToken);
  if (!session) throw Object.assign(new Error('Itinerary not found.'), { statusCode: 404 });
  const access = token
    ? await requireWebEditAccess(db, req, {
      tripId: session.trip_id,
      ownerCustomerId: session.owner_customer_id,
      env: process.env,
    })
    : { ok: true, role: 'shared_link', grant: null };
  const parsed = parseAudioDataUrl(body.audioDataUrl || body.audio?.dataUrl);
  const durationValue = Number(body.durationSeconds || body.audio?.durationSeconds);
  const durationSeconds = Number.isFinite(durationValue) ? Math.max(0, Math.round(durationValue)) : null;
  const transcription = await transcribeWebsiteAudioNote(parsed);
  const pageContext = body.pageContext && typeof body.pageContext === 'object' && !Array.isArray(body.pageContext)
    ? body.pageContext
    : null;
  const payload = {
    websiteAudioNote: {
      mimeType: parsed.mimeType,
      fileSizeBytes: parsed.bytes.length,
      durationSeconds,
      transcriptionModel: transcription.model,
      webAccessRole: access.role,
      webAccessGrantId: access.grant?.id || null,
      submittedAt: new Date().toISOString(),
      userAgent: cleanText(req.headers['user-agent'], 300) || null,
      pageContextItemCount: Array.isArray(pageContext?.items) ? pageContext.items.length : 0,
    },
    pageContext,
    transcribedFromWebsiteAudio: true,
  };
  const normalizedIntent = {
    source: 'website_audio_note',
    intent: 'itinerary_update_from_audio_note',
    role: access.role,
  };
  const requestRows = await db`
    insert into vacation_requests (
      customer_id, trip_id, source, request_type, request_text, normalized_intent, payload,
      status, queued_at
    )
    values (
      ${session.customer_id}, ${session.trip_id}, 'website_audio_note', 'itinerary_research_update',
      ${transcription.text}, ${normalizedIntent}, ${payload}, 'queued', now()
    )
    returning id, queued_at
  `;
  const requestId = requestRows[0].id;
  const turnTag = classifyTurn({
    text: transcription.text,
    speaker: 'customer',
    direction: 'inbound',
    channel: 'website_audio_note',
    payload,
  });
  await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      turn_category, turn_tags, turn_tag_source, turn_tag_confidence, turn_tagged_at
    )
    values (
      ${session.customer_id}, ${session.trip_id}, ${requestId}, 'customer', 'website_audio_note',
      ${transcription.text}, ${payload}, 'inbound',
      ${turnTag.category}, ${turnTag.tags}, ${turnTag.source}, ${turnTag.confidence}, now()
    )
  `;
  await db`
    insert into vacation_request_events (request_id, event_type, actor, details)
    values
      (${requestId}, 'website_audio_note_transcribed', 'website', ${payload}),
      (${requestId}, 'queued', 'system', ${normalizedIntent})
  `;
  const jobRows = await db`
    insert into worker_jobs (request_id, trip_id, job_type, input)
    values (${requestId}, ${session.trip_id}, 'itinerary_research_update', ${{
      customerId: session.customer_id,
      tripId: session.trip_id,
      requestId,
      source: 'website_audio_note',
      requestType: 'itinerary_research_update',
      requestText: transcription.text,
      payload,
    }})
    returning id
  `;
  return sendJson(res, 201, {
    ok: true,
    status: 'queued',
    requestId,
    jobId: jobRows[0].id,
    transcript: transcription.text,
    queuedAt: requestRows[0].queued_at,
  });
}

async function handleWebsiteMediaUpload(req, res, db, body) {
  await ensureMediaSchema(db);
  const token = cleanText(body.session || body.token, 160);
  if (!token) throw Object.assign(new Error('session is required.'), { statusCode: 400 });
  const session = await loadItinerarySession(db, token);
  if (!session) throw Object.assign(new Error('Itinerary not found.'), { statusCode: 404 });
  const access = await requireWebEditAccess(db, req, {
    tripId: session.trip_id,
    ownerCustomerId: session.owner_customer_id,
    env: process.env,
  });
  const parsed = parseMediaDataUrl(body.mediaDataUrl || body.media?.dataUrl);
  const durationValue = Number(body.durationSeconds || body.media?.durationSeconds);
  const durationSeconds = Number.isFinite(durationValue) ? Math.max(0, Math.round(durationValue)) : null;
  if (parsed.mediaKind === 'video' && durationSeconds && durationSeconds > MAX_WEBSITE_VIDEO_SECONDS) {
    throw Object.assign(new Error('Please keep uploaded videos under 2 minutes.'), { statusCode: 400 });
  }

  const requestedThingId = cleanText(body.thingId || body.thing_id || body.media?.thingId, 80);
  let thing = null;
  if (requestedThingId) {
    const thingRows = await db`
      select id, title
      from trip_things
      where id = ${requestedThingId}
        and trip_id = ${session.trip_id}
      limit 1
    `;
    thing = thingRows[0] || null;
    if (!thing) throw Object.assign(new Error('That itinerary item is not part of this vacation.'), { statusCode: 403 });
  }

  const publicToken = crypto.randomBytes(18).toString('base64url');
  const blobPath = [
    'vacation-media',
    String(session.trip_id),
    `${Date.now()}-${publicToken}.${mediaExtension(parsed.mimeType)}`,
  ].join('/');
  const blob = await put(blobPath, parsed.bytes, {
    access: 'public',
    contentType: parsed.mimeType,
    addRandomSuffix: false,
  });
  const attachmentScope = thing ? 'thing' : cleanText(body.attachmentScope || body.attachment_scope || 'trip', 20).toLowerCase();
  const caption = cleanText(body.caption || body.media?.caption, 1000) || null;
  const rows = await db`
    insert into vacation_media_uploads (
      customer_id, trip_id, public_token, media_kind, attachment_scope, thing_id,
      day_date, caption, mime_type, original_name, file_size_bytes, width, height,
      duration_seconds, storage_provider, metadata
    )
    values (
      ${session.customer_id}, ${session.trip_id}, ${publicToken}, ${parsed.mediaKind},
      ${attachmentScope === 'day' ? 'day' : thing ? 'thing' : 'trip'}, ${thing?.id || null},
      ${cleanText(body.dayDate || body.day_date, 40) || null}, ${caption}, ${parsed.mimeType},
      ${cleanText(body.originalName || body.original_name || body.media?.name, 240) || null},
      ${parsed.bytes.length}, ${Number.parseInt(body.width || '0', 10) || null},
      ${Number.parseInt(body.height || '0', 10) || null}, ${durationSeconds},
      'vercel_blob',
      ${{
        source: 'shared_itinerary_website',
        blobUrl: blob.url,
        blobPath,
        webAccessRole: access.role,
        webAccessGrantId: access.grant?.id || null,
        thingTitle: thing?.title || null,
        compressedExpected: true,
        maxUploadBytes: MAX_WEBSITE_MEDIA_BYTES,
      }}
    )
    returning *
  `;
  const origin = `https://${req.headers.host || 'vacation.timesyncher.com'}`;
  const item = rows[0];
  return sendJson(res, 201, {
    ok: true,
    media: {
      id: item.id,
      kind: item.media_kind,
      attachmentScope: item.attachment_scope,
      thingId: item.thing_id,
      dayDate: item.day_date,
      caption: item.caption,
      mimeType: item.mime_type,
      fileSizeBytes: item.file_size_bytes,
      width: item.width,
      height: item.height,
      durationSeconds: item.duration_seconds,
      createdAt: item.created_at,
      url: `${origin}/api/vacation-telegram-turn?action=media-download&id=${encodeURIComponent(item.id)}&token=${encodeURIComponent(item.public_token)}`,
    },
  });
}

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

    if (req.method === 'POST') {
      const body = await readJson(req);
      if (body.action === 'upload_audio_note') return await handleWebsiteAudioNote(req, res, db, body);
      if (body.action === 'upload_media') return await handleWebsiteMediaUpload(req, res, db, body);
      return sendJson(res, 404, { ok: false, error: 'unknown itinerary action' });
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
    await ensureMediaSchema(db);
    const media = await db`
      select id, public_token, media_kind, attachment_scope, thing_id, day_date, caption, mime_type,
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
        id: session.trip_id,
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
        thingId: item.thing_id,
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
