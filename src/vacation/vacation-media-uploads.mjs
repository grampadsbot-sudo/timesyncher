import crypto from 'node:crypto';

import { cleanText } from './http.mjs';
import { requireWebEditAccess } from './web-access.mjs';
import { isFunctionMediaProxyUrl } from './thing-media-bind.mjs';
import { putMediaBlob } from './thing-media-store.mjs';

const MAX_WEBSITE_MEDIA_BYTES = Number.parseInt(process.env.TIMESYNCHER_WEB_MEDIA_MAX_BYTES || '4194304', 10);
const MAX_WEBSITE_VIDEO_SECONDS = Number.parseInt(process.env.TIMESYNCHER_WEB_VIDEO_MAX_SECONDS || '120', 10);

function blobUrlFromMetadata(metadata = {}) {
  const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  return cleanText(meta.blobUrl || meta.blob_url || meta.publicBlobUrl || meta.cdnUrl || '', 1200);
}

function resolveVacationMediaPublicUrl(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const blobUrl = blobUrlFromMetadata(metadata);
  if (blobUrl && !isFunctionMediaProxyUrl(blobUrl)) return blobUrl;
  const provider = cleanText(row.storage_provider || row.storageProvider || '', 80).toLowerCase();
  if (provider === 'telegram') {
    console.error(`skipped vacation media ${row.id}: storage_provider=telegram has no blob URL`);
    return '';
  }
  if (provider === 'vercel_blob' || provider === 'vercel-blob') {
    console.error(`skipped vacation media ${row.id}: vercel blob row missing metadata.blobUrl`);
    return '';
  }
  console.error(`skipped vacation media ${row.id}: no direct blob/CDN URL (storage_provider=${provider || 'unknown'})`);
  return '';
}

export function serializeVacationMediaRow(row = {}) {
  const url = resolveVacationMediaPublicUrl(row);
  if (!url) return null;
  return {
    id: row.id,
    kind: row.media_kind,
    attachmentScope: row.attachment_scope,
    thingId: row.thing_id || null,
    dayDate: row.day_date,
    caption: row.caption,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    storageProvider: row.storage_provider,
    url,
  };
}

export async function ensureVacationMediaSchema(db) {
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
      storage_provider text not null default 'url',
      status text not null default 'active',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await db`alter table vacation_media_uploads add column if not exists thing_id uuid references trip_things(id) on delete set null`;
  await db`alter table vacation_media_uploads add column if not exists storage_provider text not null default 'url'`;
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

export async function handleWebsiteMediaUpload(req, res, db, body, { sendJson }) {
  await ensureVacationMediaSchema(db);
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
  const blob = await putMediaBlob(parsed.bytes, {
    pathname: blobPath,
    contentType: parsed.mimeType,
    env: process.env,
  });
  if (!blob?.url) {
    throw Object.assign(new Error('Media blob store is not configured or upload failed.'), { statusCode: 503 });
  }

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
        source: 'vacation_app_website',
        blobUrl: blob.url,
        blobPath: blob.pathname || blobPath,
        webAccessRole: access.role,
        webAccessGrantId: access.grant?.id || null,
        thingTitle: thing?.title || null,
        compressedExpected: true,
        maxUploadBytes: MAX_WEBSITE_MEDIA_BYTES,
      }}
    )
    returning *
  `;
  const item = rows[0];
  const media = serializeVacationMediaRow(item);
  if (!media) {
    throw Object.assign(new Error('Uploaded media row did not resolve a public blob URL.'), { statusCode: 500 });
  }
  return sendJson(res, 201, { ok: true, media });
}
