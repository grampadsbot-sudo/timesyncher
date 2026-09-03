import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { requireIntakeAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { classifyTurn } from '../src/vacation/turn-tags.mjs';
import { getSessionByToken, siteBase, vacationEulaStatus } from '../src/vacation/onboarding.mjs';
import { blockHighAuthorityRequest } from '../src/safety/high-authority-actions.mjs';
import { collaboratorStripe, createCollaboratorCheckout } from '../src/vacation/collaborator-checkout.mjs';
import {
  activeCollaboratorForTelegram,
  acceptCollaboratorInvite,
  collaboratorCheckoutCopy,
  collaboratorDeniedCopy,
  createCollaboratorInvite,
  isCollaboratorInviteRequest,
} from '../src/vacation/collaborators.mjs';
import {
  createTelegramWebAccessSession,
  publicTripUrl,
} from '../src/vacation/web-access.mjs';
import {
  actorFromLiveSession,
  gateMediaUploadIntake,
  gateTelegramIntakeEdit,
} from '../src/vacation/intake-edit-bridge.mjs';

const MAX_PHOTOS_PER_VACATION = 100;
const MAX_VIDEOS_PER_VACATION = 20;
const MAX_TELEGRAM_DOWNLOAD_BYTES = Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_MEDIA_MAX_BYTES || '20971520', 10);
const MAX_VIDEO_SECONDS = 120;

function displayName(user = {}) {
  return cleanText([user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' ') || user.username || `telegram:${user.id}`, 160);
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function findSessionForTelegram(db, telegramChatId, telegramUserId) {
  const rows = await db`
    select
      telegram_sessions.*,
      onboarding_sessions.token as onboarding_token
    from telegram_sessions
    left join onboarding_sessions on onboarding_sessions.id = telegram_sessions.onboarding_session_id
    where telegram_chat_id = ${telegramChatId}
       or (${telegramUserId} <> '' and telegram_user_id = ${telegramUserId})
    order by telegram_sessions.updated_at desc
    limit 1
  `;
  return rows[0] || null;
}

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
  await db`create index if not exists idx_vacation_media_trip_kind on vacation_media_uploads(trip_id, media_kind, created_at)`;
  await db`create index if not exists idx_vacation_media_public_token on vacation_media_uploads(public_token)`;
}

async function hasMediaEntitlement(db, session, mediaKind, env = process.env, host = '') {
  if (env.TIMESYNCHER_MEDIA_UPLOAD_STAGING_BYPASS === 'true' || /vacation-staging\.timesyncher\.com/i.test(host)) {
    return { allowed: true, source: 'staging_bypass' };
  }
  if (!session?.customer_id || !session?.trip_id) return { allowed: false, source: 'unlinked_session' };
  const metadataKey = mediaKind === 'video' ? 'video_memories' : 'photo_memories';
  const rows = await db`
    select 'entitlement' as source
    from entitlements
    where customer_id = ${session.customer_id}
      and status = 'active'
      and (
        metadata->>${metadataKey} = 'true'
        or metadata->>'media_uploads' = 'true'
        or metadata->>'media_memories' = 'true'
      )
    union all
    select 'paid_order' as source
    from paid_orders
    where customer_id = ${session.customer_id}
      and status in ('paid', 'coupon_redeemed')
      and (
        metadata->>${metadataKey} = 'true'
        or metadata->>'media_uploads' = 'true'
        or metadata->>'media_memories' = 'true'
      )
    limit 1
  `;
  return rows[0] ? { allowed: true, source: rows[0].source } : { allowed: false, source: 'missing_media_entitlement' };
}

function publicMedia(media, req) {
  const origin = `https://${req.headers.host || 'vacation.timesyncher.com'}`;
  return {
    id: media.id,
    kind: media.media_kind,
    attachmentScope: media.attachment_scope,
    dayDate: media.day_date,
    caption: media.caption,
    mimeType: media.mime_type,
    fileSizeBytes: media.file_size_bytes,
    width: media.width,
    height: media.height,
    durationSeconds: media.duration_seconds,
    createdAt: media.created_at,
    url: `${origin}/api/vacation-telegram-turn?action=media-download&id=${encodeURIComponent(media.id)}&token=${encodeURIComponent(media.public_token)}`,
  };
}

function normalizeMediaUpload(body) {
  const mediaKind = cleanText(body.mediaKind || body.media_kind || body.kind, 20).toLowerCase();
  if (!['photo', 'video'].includes(mediaKind)) {
    throw Object.assign(new Error('mediaKind must be photo or video.'), { statusCode: 400 });
  }
  const fileSizeBytes = Number.parseInt(body.fileSizeBytes || body.file_size_bytes || body.fileSize || '0', 10) || 0;
  const durationSeconds = Number.parseInt(body.durationSeconds || body.duration_seconds || '0', 10) || null;
  if (mediaKind === 'video' && durationSeconds && durationSeconds > MAX_VIDEO_SECONDS) {
    throw Object.assign(new Error('Video is longer than the 2 minute limit.'), { statusCode: 400 });
  }
  if (fileSizeBytes > MAX_TELEGRAM_DOWNLOAD_BYTES) {
    throw Object.assign(new Error(`Telegram bot intake can currently accept files up to ${Math.floor(MAX_TELEGRAM_DOWNLOAD_BYTES / 1024 / 1024)} MB. Use a private upload-link flow for larger originals.`), { statusCode: 413 });
  }
  return {
    mediaKind,
    fileSizeBytes,
    durationSeconds,
    attachmentScope: cleanText(body.attachmentScope || body.attachment_scope || 'trip', 20).toLowerCase(),
    caption: cleanText(body.caption, 1000) || null,
    mimeType: cleanText(body.mimeType || body.mime_type, 160) || null,
    originalName: cleanText(body.originalName || body.original_name, 240) || null,
    width: Number.parseInt(body.width || '0', 10) || null,
    height: Number.parseInt(body.height || '0', 10) || null,
    telegramFileId: cleanText(body.telegramFileId || body.telegram_file_id, 500),
    telegramFileUniqueId: cleanText(body.telegramFileUniqueId || body.telegram_file_unique_id, 500) || null,
    telegramFilePath: cleanText(body.telegramFilePath || body.telegram_file_path, 1000) || null,
    telegramMessageId: cleanText(body.telegramMessageId || body.telegram_message_id, 120) || null,
    telegramChatId: cleanText(body.telegramChatId || body.telegram_chat_id, 120),
    telegramUserId: cleanText(body.telegramUserId || body.telegram_user_id, 120),
    dayDate: cleanText(body.dayDate || body.day_date, 40) || null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };
}

async function recordMediaUpload(db, req, body) {
  await ensureMediaSchema(db);
  const media = normalizeMediaUpload(body);
  if (!media.telegramChatId) throw Object.assign(new Error('telegramChatId is required.'), { statusCode: 400 });
  if (!media.telegramFileId) throw Object.assign(new Error('telegramFileId is required.'), { statusCode: 400 });
  const session = await findSessionForTelegram(db, media.telegramChatId, media.telegramUserId);
  if (!session?.customer_id || !session?.trip_id) {
    const loggedOutGate = gateMediaUploadIntake({
      text: media.caption || `Upload this ${media.mediaKind} to the vacation`,
      actor: actorFromLiveSession({
        id: media.telegramUserId || media.telegramChatId,
        loggedOut: true,
        session: null,
      }),
      trip: { trip_id: 'trip-unspecified', title: 'Vacation', status: 'live', items: [] },
      media: {
        media_kind: media.mediaKind,
        bound_trip_id: null,
        attachment_scope: media.attachmentScope || 'trip',
      },
    });
    throw Object.assign(new Error(loggedOutGate.receipt?.customer_facing_response || 'A linked TimeSyncher Vacation session is required before uploading media.'), {
      statusCode: 403,
      vacationEditPipeline: loggedOutGate.compact,
    });
  }
  const meta = sessionMetadata(session);
  const collaboratorRole = String(meta.telegramRole || '').toLowerCase() === 'collaborator';
  const collaborator = collaboratorRole
    ? await activeCollaboratorForTelegram(db, {
      ownerCustomerId: session.customer_id,
      tripId: session.trip_id,
      telegramChatId: media.telegramChatId,
      telegramUserId: media.telegramUserId,
    })
    : null;
  const entitlement = await hasMediaEntitlement(db, session, media.mediaKind, process.env, req.headers.host || '');
  const mediaGate = gateMediaUploadIntake({
    text: media.caption || `Upload this ${media.mediaKind} to the vacation`,
    actor: actorFromLiveSession({
      id: media.telegramUserId || media.telegramChatId,
      telegramUserId: media.telegramUserId,
      customer_id: session.customer_id,
      trip_id: session.trip_id,
      metadata: meta,
      collaborator,
      entitlement,
    }),
    trip: { trip_id: session.trip_id, title: 'Vacation', status: 'live', items: [] },
    media: {
      media_kind: media.mediaKind,
      bound_trip_id: session.trip_id,
      attachment_scope: media.attachmentScope || 'trip',
    },
  });
  if (mediaGate.failClosed) {
    throw Object.assign(new Error(mediaGate.receipt?.customer_facing_response || 'Media upload rejected.'), {
      statusCode: 403,
      vacationEditPipeline: mediaGate.compact,
    });
  }
  if (!entitlement.allowed) {
    throw Object.assign(new Error(`${media.mediaKind === 'video' ? 'Video' : 'Photo'} Memories add-on is required before uploading ${media.mediaKind}s.`), { statusCode: 402 });
  }
  const limit = media.mediaKind === 'video' ? MAX_VIDEOS_PER_VACATION : MAX_PHOTOS_PER_VACATION;
  const countRows = await db`
    select count(*)::int as count
    from vacation_media_uploads
    where trip_id = ${session.trip_id}
      and media_kind = ${media.mediaKind}
      and status = 'active'
  `;
  if ((countRows[0]?.count || 0) >= limit) {
    throw Object.assign(new Error(`${media.mediaKind === 'video' ? 'Video' : 'Photo'} Memories limit reached for this vacation.`), { statusCode: 409 });
  }
  const publicToken = crypto.randomBytes(18).toString('base64url');
  const rows = await db`
    insert into vacation_media_uploads (
      customer_id, trip_id, telegram_session_id, public_token, media_kind, attachment_scope,
      day_date, caption, mime_type, original_name, file_size_bytes, width, height, duration_seconds,
      telegram_file_id, telegram_file_unique_id, telegram_file_path, telegram_message_id,
      telegram_chat_id, telegram_user_id, metadata
    )
    values (
      ${session.customer_id}, ${session.trip_id}, ${session.id}, ${publicToken}, ${media.mediaKind},
      ${['trip', 'day', 'thing'].includes(media.attachmentScope) ? media.attachmentScope : 'trip'},
      ${media.dayDate}, ${media.caption}, ${media.mimeType}, ${media.originalName}, ${media.fileSizeBytes},
      ${media.width}, ${media.height}, ${media.durationSeconds}, ${media.telegramFileId},
      ${media.telegramFileUniqueId}, ${media.telegramFilePath}, ${media.telegramMessageId},
      ${media.telegramChatId}, ${media.telegramUserId},
      ${{
        ...media.metadata,
        entitlementSource: entitlement.source,
        telegramBotApiDownloadLimitBytes: MAX_TELEGRAM_DOWNLOAD_BYTES,
      }}
    )
    returning *
  `;
  await recordTranscript(db, {
    session,
    speaker: 'customer',
    direction: 'inbound',
    body: media.caption || `Uploaded ${media.mediaKind}`,
    channel: 'telegram_vacation_media',
    telegramMessageId: media.telegramMessageId,
    payload: {
      vacationMediaUploadId: rows[0].id,
      mediaKind: media.mediaKind,
      fileSizeBytes: media.fileSizeBytes,
      durationSeconds: media.durationSeconds,
    },
    receivedAt: new Date().toISOString(),
    onboardingStep: session.current_step,
  });
  const responseMedia = publicMedia(rows[0], req);
  return {
    media: responseMedia,
    reply: media.mediaKind === 'video'
      ? 'Got it — I saved that video to this vacation.'
      : 'Got it — I saved that photo to this vacation.',
  };
}

async function listMedia(db, req) {
  await ensureMediaSchema(db);
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const sessionToken = cleanText(url.searchParams.get('session') || url.searchParams.get('token'), 160);
  if (!sessionToken) throw Object.assign(new Error('session is required.'), { statusCode: 400 });
  const trips = await db`
    select trips.id
    from onboarding_sessions
    join trips on trips.id = onboarding_sessions.trip_id
    where onboarding_sessions.token = ${sessionToken}
    limit 1
  `;
  if (!trips[0]) throw Object.assign(new Error('Itinerary not found.'), { statusCode: 404 });
  const rows = await db`
    select *
    from vacation_media_uploads
    where trip_id = ${trips[0].id}
      and status = 'active'
    order by created_at desc
    limit 200
  `;
  return rows.map((row) => publicMedia(row, req));
}

async function downloadMedia(db, req, res) {
  await ensureMediaSchema(db);
  const url = new URL(req.url || '/', 'https://timesyncher.com');
  const id = cleanText(url.searchParams.get('id'), 120);
  const token = cleanText(url.searchParams.get('token'), 120);
  if (!id || !token) throw Object.assign(new Error('id and token are required.'), { statusCode: 400 });
  const rows = await db`
    select *
    from vacation_media_uploads
    where id = ${id}
      and public_token = ${token}
      and status = 'active'
    limit 1
  `;
  const media = rows[0];
  if (!media) throw Object.assign(new Error('Media not found.'), { statusCode: 404 });
  const botToken = process.env.TIMESYNCHER_VACATION_MEDIA_BOT_TOKEN || process.env.TIMESYNCHER_TELEGRAM_BOT_TOKEN || '';
  if (!botToken) throw Object.assign(new Error('Media download is not configured.'), { statusCode: 503 });
  let filePath = media.telegram_file_path;
  if (!filePath) {
    const fileResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: media.telegram_file_id }),
    });
    const json = await fileResponse.json().catch(() => ({}));
    if (!fileResponse.ok || !json.ok || !json.result?.file_path) {
      throw Object.assign(new Error(json.description || 'Telegram could not resolve media file.'), { statusCode: 502 });
    }
    filePath = json.result.file_path;
  }
  const mediaResponse = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!mediaResponse.ok || !mediaResponse.body) {
    throw Object.assign(new Error(`Telegram media download ${mediaResponse.status}`), { statusCode: 502 });
  }
  res.statusCode = 200;
  res.setHeader('content-type', media.mime_type || (media.media_kind === 'video' ? 'video/mp4' : 'image/jpeg'));
  res.setHeader('cache-control', 'private, max-age=300');
  res.setHeader('x-content-type-options', 'nosniff');
  Readable.fromWeb(mediaResponse.body).pipe(res);
}

async function ensureTelegramSession(db, { onboarding, telegramChatId, telegramUserId, user, payload }) {
  const rows = await db`
    insert into telegram_sessions (
      customer_id, trip_id, onboarding_session_id, telegram_chat_id, telegram_user_id,
      current_step, last_message_at, metadata, updated_at
    )
    values (
      ${onboarding?.customer_id || null}, ${onboarding?.trip_id || null}, ${onboarding?.id || null},
      ${telegramChatId}, ${telegramUserId || null}, 'awaiting_vacation_identity', now(),
      ${{
        telegramUsername: user.username || null,
        displayName: displayName(user),
        ...payload,
      }}, now()
    )
    on conflict (telegram_chat_id) do update set
      customer_id = coalesce(excluded.customer_id, telegram_sessions.customer_id),
      trip_id = coalesce(excluded.trip_id, telegram_sessions.trip_id),
      onboarding_session_id = coalesce(excluded.onboarding_session_id, telegram_sessions.onboarding_session_id),
      telegram_user_id = coalesce(excluded.telegram_user_id, telegram_sessions.telegram_user_id),
      current_step = coalesce(excluded.current_step, telegram_sessions.current_step),
      last_message_at = now(),
      metadata = telegram_sessions.metadata || excluded.metadata,
      updated_at = now()
    returning *
  `;

  if (onboarding?.customer_id && telegramUserId) {
    await db`
      update customers
      set telegram_user_id = ${telegramUserId},
        display_name = coalesce(display_name, ${displayName(user)}),
        metadata = metadata || ${{
          telegramUsername: user.username || null,
          telegramLinkedAt: new Date().toISOString(),
        }},
        updated_at = now()
      where id = ${onboarding.customer_id}
    `;
    await db`
      update onboarding_sessions
      set status = 'telegram_started',
        current_step = 'telegram_started',
        started_at = coalesce(started_at, now()),
        updated_at = now()
      where id = ${onboarding.id}
    `;
  }

  return rows[0];
}

async function recordTranscript(db, { session, speaker, direction, body, channel = 'telegram_vacation_bot', telegramMessageId, payload, receivedAt, sentAt, responseLatencyMs, onboardingStep }) {
  const tag = classifyTurn({ text: body, speaker, direction, channel, payload });
  const rows = await db`
    insert into transcript_turns (
      customer_id, trip_id, telegram_session_id, speaker, channel, body, payload, direction,
      telegram_message_id, received_at, sent_at, response_latency_ms, onboarding_step,
      turn_category, turn_tags, turn_tag_source, turn_tag_confidence, turn_tagged_at
    )
    values (
      ${session?.customer_id || null}, ${session?.trip_id || null}, ${session?.id || null},
      ${speaker}, ${channel}, ${body}, ${payload || {}}, ${direction},
      ${telegramMessageId || null}, ${receivedAt || null}, ${sentAt || null},
      ${responseLatencyMs || null}, ${onboardingStep || session?.current_step || null},
      ${tag.category}, ${tag.tags}, ${tag.source}, ${tag.confidence}, now()
    )
    returning id
  `;
  return rows[0].id;
}

function requestKind(text) {
  const lower = cleanText(text, 1000).toLowerCase();
  if (/^(yes|yep|yeah|ok|okay|sure|go ahead|do it|continue|next pass|yes do next pass)[\s.!?]*$/i.test(lower)) {
    return {
      requestType: 'itinerary_research_update',
      jobType: 'itinerary_research_update',
      intent: 'continue_or_next_pass',
    };
  }
  if (/\b(next pass|research|update|refine|revise|change|add|remove|swap|rank|compare|web itinerary)\b/i.test(lower)) {
    return {
      requestType: 'itinerary_research_update',
      jobType: 'itinerary_research_update',
      intent: 'itinerary_update',
    };
  }
  return {
    requestType: 'onboarding_setup',
    jobType: 'onboarding_setup',
    intent: 'initial_or_additional_intake',
  };
}

function sessionMetadata(session) {
  return session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata) ? session.metadata : {};
}

function hasVacationIdentity(session) {
  const metadata = sessionMetadata(session);
  return Boolean(cleanText(metadata.vacationName, 160) && cleanText(metadata.unforgettableGoal, 1000));
}

export function parseVacationIdentity(text) {
  const cleaned = cleanText(text, 2000);
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nameMatch = cleaned.match(/(?:call|name|title)\s+(?:it|the vacation|this vacation)?\s*[:\-]?\s*["“]?([^"\n”]+)["”]?/i);
  const goalMatch = cleaned.match(/(?:unforgettable|special|goal|going for|want)\s*[:\-]?\s*([^"\n]+(?:\n[^"\n]+)?)/i);
  let vacationName = cleanVacationName(nameMatch?.[1] || '');
  let unforgettableGoal = cleanText(goalMatch?.[1] || '', 1000);

  if (!vacationName && lines.length >= 2) {
    vacationName = cleanVacationName(lines[0].replace(/^name\s*[:\-]\s*/i, ''));
    unforgettableGoal = cleanText(lines.slice(1).join(' ').replace(/^(goal|unforgettable)\s*[:\-]\s*/i, ''), 1000);
  }
  if (!vacationName && /^.{3,80}$/.test(cleaned) && !/\b(fly|hotel|restaurant|budget|date|july|august|maui|oahu|kona|waikiki|honolulu)\b/i.test(cleaned)) {
    vacationName = cleanVacationName(cleaned);
  }
  if (!unforgettableGoal && vacationName && cleaned.length > vacationName.length + 5) {
    unforgettableGoal = cleanText(cleaned.replace(vacationName, ''), 1000);
  }
  return { vacationName, unforgettableGoal };
}

function cleanVacationName(value) {
  let title = cleanText(value, 160)
    .replace(/\s+/g, ' ')
    .replace(/^(?:it|this|that|the vacation|this vacation)\s+(?:is|as)?\s*/i, '')
    .replace(/[.;,]$/, '')
    .trim();
  title = title.split(/\s+(?:and\s+)?what would make\b/i)[0].trim();
  title = title.split(/\s+and\s+(?:the )?(?:goal|vibe|point|idea)\b/i)[0].trim();
  title = title.replace(/^["“]+|["”]+$/g, '').trim();
  if (!title || title.length > 80) return '';
  if (/\b(destination|rough dates|who is traveling|budget|must-do|avoided|send me)\b/i.test(title)) return '';
  return title;
}

export function hasTripPlanningDetails(text) {
  const cleaned = cleanText(text, 2000);
  return /\b(hawaii|honolulu|waikiki|oahu|maui|kihei|kona|big island|night|nights|days|dates?|january|february|march|april|may|june|july|august|september|october|november|december|hotel|stay|restaurant|food|surf|beach|budget|flight|traveling|travellers|travelers|family|wife|husband|kids|avoid|summary|paragraph|unforgettable|special|relax|adventure|anniversary|birthday)\b/i.test(cleaned);
}

function missingSummaryQuestions(text) {
  const cleaned = cleanText(text, 3000);
  const questions = [];
  if (!/\b(destination|hawaii|honolulu|waikiki|oahu|maui|kihei|kona|big island|visit|going to|trip to|vacation in)\b/i.test(cleaned)) {
    questions.push('where you want to go');
  }
  if (!/\b(date|dates|when|night|nights|day|days|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2})\b/i.test(cleaned)) {
    questions.push('rough dates or trip length');
  }
  if (!/\b(adult|adults|kid|kids|child|children|family|wife|husband|spouse|couple|people|travelers|travellers|guests)\b/i.test(cleaned)) {
    questions.push('who is traveling');
  }
  if (!/\b(unforgettable|special|goal|vibe|relax|adventure|food|beach|surf|museum|show|shop|budget|avoid|must)\b/i.test(cleaned)) {
    questions.push('the vibe, must-dos, budget, or anything to avoid');
  }
  return questions;
}

function compactIntakeSummary(text) {
  const cleaned = cleanText(text, 1200);
  const details = [];
  const nights = cleaned.match(/\b(?:stay(?:ing)?\s*)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+nights?\b/i)?.[0];
  if (nights) details.push(nights.toLowerCase());
  const places = [];
  for (const [pattern, label] of [
    [/\boahu\b|\bhonolulu\b|\bwaikiki\b/i, 'Oahu/Waikiki'],
    [/\bmaui\b|\bkihei\b/i, 'Maui/Kihei'],
    [/\bkona\b|\bbig island\b/i, 'Kona/Big Island'],
    [/\bhawaii\b/i, 'Hawaii'],
  ]) {
    if (pattern.test(cleaned) && !places.includes(label)) places.push(label);
  }
  if (places.length) details.push(places.join(' -> '));
  if (/\bfabulous time|unforgettable|special|classic|relax|beach|surf|food|sunset\b/i.test(cleaned)) {
    details.push('the experience/vibe you described');
  }
  return details.length ? `I captured the starting brief: ${details.join(', ')}.` : 'I captured the trip brief you sent.';
}

export function vacationIdentityAck({ vacationName, text, queued }) {
  return [
    `Got it — I’ll use “${vacationName}” as the working title.`,
    compactIntakeSummary(text),
    '',
    queued
      ? 'I am turning that into the hosted TimeSyncher Vacation itinerary now. You can keep sending updates here while I work.'
      : 'Now send me the destination, rough dates, who is traveling, budget range, must-do experiences, and anything you want avoided. Voice notes are fine.',
  ].join('\n');
}

function identityPrompt() {
  return [
    'Send me one voice note or text summary for the trip.',
    '',
    'Include the vacation name, destination, rough dates or trip length, who is traveling, and what would make it unforgettable.',
    '',
    'Example: “Hawaii 2026 — classic Waikiki beach energy, great local food, surf lesson, and a few special sunset experiences.”',
  ].join('\n');
}

function firstTripDetailsAck({ queued }) {
  return [
    queued
      ? 'I captured your first trip summary and started setting up the vacation workspace.'
      : 'I captured your first trip summary.',
    '',
    'Now send any missing pieces in a voice note or text.',
    '',
    'The most useful pieces are the vacation name, destination, rough dates or trip length, who is traveling, budget range, must-do experiences, and anything you want avoided.',
  ].join('\n');
}

function voiceNoteIntro() {
  return [
    'Welcome. We are so excited to help you create your next unforgettable vacation.',
    '',
    'Before we start, I want to make sure you know you can send voice notes here.',
    '',
    'Hold the microphone button while you talk. Keep holding it for as long as you want, and tell me what you want to do on your vacation.',
    '',
    'One quick thing to try: tap the microphone icon and see how it changes to the video icon, then tap it again so it changes back to the microphone.',
    '',
    'If it ever switches to video by accident, that is why the voice-note button seems to disappear.',
    '',
    'Send one voice note with the trip summary: where you are going, when or how long, who is going, budget or style, must-do experiences, and what would make it unforgettable.',
  ].join('\n');
}

function eulaRequiredReply(eula) {
  return [
    'Your TimeSyncher Vacation purchase is linked.',
    '',
    'Before we start Telegram onboarding, please review and accept the TimeSyncher EULA:',
    eula.acceptUrl,
    '',
    'After acceptance, TimeSyncher will guide you to the next onboarding step.',
  ].join('\n');
}

function collaboratorCheckoutReplyText() {
  return [
    'Yes. You can share the vacation website with your wife or family so they can view it.',
    '',
    'Website editing is owner-approved and email-verified, so someone with only the shared URL stays view-only. Full access through Telegram, equal to yours, requires the Telegram access add-on. You can give Telegram access to up to 3 people.',
    '',
    'Choose a Telegram add-on option below. The checkout page also lets you add photo and video upload access with pricing that matches the selected scope.',
  ].join('\n');
}

function collaboratorStatusQuestion(text = '') {
  const normalized = cleanText(text, 2000).toLowerCase();
  return isQuestionLike(normalized)
    && /\b(already|yet|currently|status|listed|did you|have you|do i still need|is my|is she|is he|are they)\b/.test(normalized)
    && /\b(telegram collaborator|collaborator|telegram access|full access|access)\b/.test(normalized);
}

function accessPersonName(text = '', env = process.env) {
  const normalized = cleanText(text, 2000);
  if (/\bkim\b/i.test(normalized)) return 'Kim';
  const wifeName = cleanText(env.TIMESYNCHER_CUSTOMER_WIFE_DISPLAY_NAME || env.TIMESYNCHER_PRIMARY_SPOUSE_NAME, 80);
  if (/\bwife\b/i.test(normalized) && wifeName) return wifeName;
  if (/\bwife\b/i.test(normalized)) return 'your wife';
  if (/\bhusband\b/i.test(normalized)) return 'your husband';
  if (/\bspouse|partner\b/i.test(normalized)) return 'your spouse';
  const named = normalized.match(/\b([A-Z][a-z]{2,24})\b/);
  return cleanText(named?.[1] || 'that person', 80);
}

function isQuestionLike(value = '') {
  const normalized = cleanText(value, 1000).toLowerCase();
  return normalized.includes('?') || /\b(do|does|can|could|will|would|what|when|where|why|how|am i|are we|is there|did i|have i)\b/.test(normalized);
}

function isConcreteItineraryQuestion(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase();
  return /\b(find|compare|plan|build|create|make|draft|research|suggest|recommend|add|change|update|remove|swap|move|refine)\b/.test(normalized)
    && /\b(vacation|trip|itinerary|hotel|hotels|flight|flights|restaurant|restaurants|activity|activities|things to do|destination|miami|hawaii|oahu|maui|honolulu|waikiki)\b/.test(normalized);
}

export function vacationSupportIntent(text) {
  const normalized = cleanText(text, 2000).toLowerCase();
  if (!normalized || /^\/start\b/i.test(normalized)) return null;
  if (!isQuestionLike(normalized) || isConcreteItineraryQuestion(normalized)) return null;
  if (/\b(send|share|show|give|need|where|what|open)\b/.test(normalized) && /\b(website|web site|site|link|url)\b/.test(normalized) && /\b(vacation|trip|itinerary|vegas|las vegas|strip)\b/.test(normalized)) {
    return { intent: 'website_link_question', shouldQueueWorker: false, confidence: 0.95, answerMode: 'account_state' };
  }
  if (/\b(upload|add|send|post|attach)\b/.test(normalized) && /\b(pic|pics|photo|photos|picture|pictures|video|videos|media)\b/.test(normalized)) {
    return { intent: 'media_upload_question', shouldQueueWorker: false, confidence: 0.94 };
  }
  if (collaboratorStatusQuestion(normalized)) {
    return { intent: 'collaborator_access_question', shouldQueueWorker: false, confidence: 0.94, answerMode: 'account_state' };
  }
  if (/\b(unlimited|how many|access|included|include|plan|paid|payment|checkout|order|subscription|coupon|code|account)\b/.test(normalized)) {
    return { intent: 'account_question', shouldQueueWorker: false, confidence: 0.88 };
  }
  if (/\b(book|booking|reserve|reservation|purchase|pay for|hold)\b/.test(normalized)) {
    return { intent: 'support_question', shouldQueueWorker: false, confidence: 0.9 };
  }
  if (/\b(price|cost|refund|login|sign in|support|help|website link|url)\b/.test(normalized)) {
    return { intent: 'support_question', shouldQueueWorker: false, confidence: 0.78 };
  }
  return null;
}

const SUPPORT_ROUTER_INTENTS = new Set([
  'account_question',
  'support_question',
  'website_link_question',
  'media_upload_question',
  'collaborator_access_question',
  'ambiguous',
  'unsafe_internal',
]);

function normalizeRouterDecision(decision, source = 'grok') {
  if (!decision || typeof decision !== 'object') return null;
  const intent = cleanText(decision.intent, 80);
  const writeMode = cleanText(decision.write_mode || decision.writeMode || 'none', 40) || 'none';
  const shouldQueueWorker = Boolean(decision.shouldQueueWorker);
  const confidence = Number(decision.confidence);
  if (!SUPPORT_ROUTER_INTENTS.has(intent)) return null;
  if (!Number.isFinite(confidence) || confidence < 0.62) return null;
  return {
    intent,
    write_mode: writeMode,
    shouldQueueWorker,
    confidence,
    source,
    answerMode: cleanText(decision.answerMode || decision.answer_mode, 80) || null,
    reasons: Array.isArray(decision.reasons) ? decision.reasons.map((reason) => cleanText(reason, 160)).filter(Boolean).slice(0, 6) : [],
  };
}

function extractJsonObject(value = '') {
  const text = cleanText(value, 5000);
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function grokVacationSupportIntent(text, { env = process.env, fetchImpl = fetch, signal } = {}) {
  const apiKey = env.TIMESYNCHER_XAI_API_KEY || env.XAI_API_KEY || '';
  if (!apiKey) return null;
  const model = env.TIMESYNCHER_XAI_ROUTER_MODEL || env.TIMESYNCHER_XAI_SUMMARY_MODEL || env.XAI_MODEL || 'grok-4';
  const prompt = [
    'Classify the current TimeSyncher Vacation Telegram customer turn.',
    'Return only one JSON object. Do not include prose.',
    '',
    'Allowed intents:',
    '- account_question: asks about purchased plan, access, coupons, checkout, order, entitlement, remaining vacation count.',
    '- support_question: asks how the product works, pricing, booking boundary, login, support, website URL/link.',
    '- media_upload_question: asks whether/how the owner or collaborator can upload/send/add/attach photos, pictures, videos, or media.',
    '- collaborator_access_question: asks whether a wife, spouse, family member, assistant, or another person can view/edit/change/upload through the vacation.',
    '- ambiguous: unclear whether support or itinerary work.',
    '- itinerary_action: asks to create, update, refine, research, or modify vacation itinerary content.',
    '',
    'Rules:',
    '- Questions about ability, access, pricing, checkout, coupons, or media upload are no-write support/account turns.',
    '- Do not classify a question as itinerary_action just because it names a destination or vacation.',
    '- Use itinerary_action only when the current turn clearly asks to create/change itinerary content.',
    '- write_mode must be none for support/account/media/collaborator/ambiguous turns.',
    '- shouldQueueWorker must be false unless intent is itinerary_action.',
    '',
    'JSON schema:',
    '{"intent":"media_upload_question","write_mode":"none","answerMode":"account_state","shouldQueueWorker":false,"confidence":0.0,"reasons":["short reason"]}',
    '',
    `Customer turn: ${cleanText(text, 2000)}`,
  ].join('\n');
  const response = await fetchImpl('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 220,
      messages: [
        { role: 'system', content: 'You are a strict intent classifier for a vacation support router. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `XAI router HTTP ${response.status}`);
  const content = json.choices?.[0]?.message?.content || '';
  return normalizeRouterDecision(extractJsonObject(content), 'grok');
}

export async function ubuntuGrokVacationSupportIntent(text, { env = process.env, fetchImpl = fetch, signal } = {}) {
  const routerUrl = cleanText(env.TIMESYNCHER_GROK_ROUTER_URL, 500);
  const token = env.TIMESYNCHER_GROK_ROUTER_TOKEN || '';
  if (!routerUrl || !token) return null;
  const response = await fetchImpl(routerUrl, {
    method: 'POST',
    signal,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      text: cleanText(text, 4000),
      context: {
        product: 'timesyncher_vacation',
        surface: 'telegram',
      },
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) throw new Error(json.error || `Ubuntu Grok router HTTP ${response.status}`);
  return normalizeRouterDecision(json.decision, 'ubuntu_grok_router');
}

export async function vacationSupportIntentWithModel(text, { env = process.env, fetchImpl = fetch } = {}) {
  try {
    const timeoutMs = Number.parseInt(env.TIMESYNCHER_XAI_ROUTER_TIMEOUT_MS || '4500', 10);
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 4500)
      : undefined;
    const ubuntuDecision = await ubuntuGrokVacationSupportIntent(text, { env, fetchImpl, signal });
    if (ubuntuDecision) return ubuntuDecision;
    const modelDecision = await grokVacationSupportIntent(text, { env, fetchImpl, signal });
    if (modelDecision) return modelDecision;
  } catch (error) {
    console.warn('TimeSyncher Vacation Grok support router fallback', error?.message || error);
  }
  const fallback = vacationSupportIntent(text);
  return fallback ? { ...fallback, source: 'deterministic_fallback' } : null;
}

function linkedVacationMatchFromPayload(payload = {}, text = '') {
  const normalized = cleanText(text, 2000).toLowerCase();
  const items = [
    ...(Array.isArray(payload.linkedVacations) ? payload.linkedVacations : []),
    ...(Array.isArray(payload.customerVacations) ? payload.customerVacations : []),
  ].filter((item) => item && typeof item === 'object');
  if (!items.length) return null;
  if (/\b(vegas|las vegas|strip|jockey club)\b/.test(normalized)) {
    return items.find((item) => /\b(vegas|las vegas|strip|jockey club)\b/i.test([
      item.title,
      item.name,
      item.destination,
      item.url,
      item.shareToken,
      item.token,
    ].filter(Boolean).join(' '))) || items[0];
  }
  return items[0];
}

async function vacationAccessSummary(db, session, { telegramChatId = '', telegramUserId = '', payload = {}, text = '' } = {}) {
  if (!session?.customer_id) {
    return { linked: false, hasUnlimited: false, hasPhotoUpload: false, hasVideoUpload: false, activePlan: '', activeCount: 0, statuses: [] };
  }
  const tokenRows = session.token || session.onboarding_token ? [] : await db`
    select token
    from onboarding_sessions
    where customer_id = ${session.customer_id}
      and trip_id = ${session.trip_id}
    order by updated_at desc
    limit 1
  `;
  const sessionToken = cleanText(session.token || session.onboarding_token || tokenRows[0]?.token, 160);
  const rows = await db`
    select plan, status, metadata, 'entitlement' as source, created_at
    from entitlements
    where customer_id = ${session.customer_id}
      and status = 'active'
    union all
    select plan, status, metadata, 'paid_order' as source, created_at
    from paid_orders
    where customer_id = ${session.customer_id}
      and status in ('paid', 'coupon_redeemed')
    order by created_at desc
  `;
  const plans = rows.map((row) => cleanText(row.plan, 80).toLowerCase()).filter(Boolean);
  const metadataTrue = (row, keys) => {
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return keys.some((key) => String(metadata[key] ?? '').toLowerCase() === 'true');
  };
  const hasOwnerMediaPlan = plans.some((plan) => plan.includes('owner_media'));
  const hasPhotoUpload = hasOwnerMediaPlan || rows.some((row) => metadataTrue(row, ['photo_memories', 'photoUpload', 'media_uploads', 'media_memories']));
  const hasVideoUpload = hasOwnerMediaPlan || rows.some((row) => metadataTrue(row, ['video_memories', 'videoUpload', 'media_uploads', 'media_memories']));
  const tripRows = session.trip_id ? await db`
    select
      trips.*,
      customers.email as owner_email,
      customers.display_name as owner_display_name,
      customers.first_name as owner_first_name,
      customers.last_name as owner_last_name
    from trips
    left join customers on customers.id = trips.customer_id
    where trips.id = ${session.trip_id}
    limit 1
  ` : [];
  const trip = tripRows[0] || null;
  const linkedVacation = linkedVacationMatchFromPayload(payload, text);
  const linkedShareToken = cleanText(
    linkedVacation?.shareToken || linkedVacation?.share_token || linkedVacation?.token || linkedVacation?.sharedToken || linkedVacation?.shared_token,
    240,
  );
  const linkedPublicUrl = cleanText(linkedVacation?.url || linkedVacation?.publicUrl || linkedVacation?.webItineraryUrl, 600)
    || (linkedShareToken ? `${String(process.env.TIMESYNCHER_TRAVEL_BASE_URL || process.env.TIMESYNCHER_PUBLIC_TRAVEL_BASE_URL || 'https://travel.timesyncher.com').replace(/\/+$/, '')}/shared/${encodeURIComponent(linkedShareToken)}/` : '');
  const linkedTitle = cleanText(linkedVacation?.title || linkedVacation?.name || linkedVacation?.destination, 180);
  const isCollaboratorSession = String(session?.metadata?.telegramRole || '').toLowerCase() === 'collaborator';
  const collaborator = isCollaboratorSession ? await activeCollaboratorForTelegram(db, {
    ownerCustomerId: session.customer_id,
    tripId: session.trip_id,
    telegramChatId,
    telegramUserId,
  }) : null;
  let telegramWebAccess = null;
  if (trip && (!isCollaboratorSession || collaborator)) {
    const ownerName = cleanText(
      trip.owner_display_name || [trip.owner_first_name, trip.owner_last_name].filter(Boolean).join(' '),
      180,
    );
    const role = collaborator ? 'telegram_collaborator' : 'owner';
    const email = role === 'owner'
      ? cleanText(trip.owner_email, 180)
      : `telegram-${cleanText(telegramUserId || telegramChatId, 80).replace(/[^a-zA-Z0-9_.-]/g, '-') || collaborator.id}@telegram.timesyncher.local`;
    try {
      telegramWebAccess = await createTelegramWebAccessSession(db, {
        ownerCustomerId: session.customer_id,
        tripId: session.trip_id,
        email,
        displayName: role === 'owner' ? ownerName : cleanText(collaborator?.display_name || session?.metadata?.displayName || 'Telegram collaborator', 180),
        role,
        metadata: {
          source: 'telegram_vacation_link_request',
          telegramChatId: telegramChatId || null,
          telegramUserId: telegramUserId || null,
          collaboratorId: collaborator?.id || null,
          shareToken: linkedShareToken || null,
          publicUrl: linkedPublicUrl || null,
          linkedVacationTitle: linkedTitle || null,
        },
        env: process.env,
      });
  } catch (error) {
      console.warn('TimeSyncher Vacation Telegram website access launch fallback', error?.message || error);
    }
  }
  const collaboratorRows = session.customer_id ? await db`
    select id, display_name, telegram_chat_id, telegram_user_id, trip_id, plan_code, status, accepted_at, created_at
    from vacation_collaborators
    where owner_customer_id = ${session.customer_id}
      and status = 'active'
      and (${session.trip_id || null}::uuid is null or trip_id is null or trip_id = ${session.trip_id || null})
    order by accepted_at desc nulls last, created_at desc
    limit 20
  ` : [];
  const webEditorRows = session.customer_id ? await db`
    select id, email, display_name, role, status, invited_at, accepted_at, created_at
    from vacation_web_access_grants
    where owner_customer_id = ${session.customer_id}
      and (${session.trip_id || null}::uuid is null or trip_id = ${session.trip_id || null})
      and role = 'web_editor'
      and status in ('invited', 'accepted')
    order by accepted_at desc nulls last, invited_at desc nulls last, created_at desc
    limit 20
  ` : [];
  return {
    linked: true,
    session: { token: sessionToken },
    trip: trip ? {
      id: trip.id,
      title: linkedTitle || trip.title,
      shareToken: linkedShareToken || null,
      publicUrl: linkedPublicUrl || publicTripUrl(trip, process.env),
    } : null,
    telegramWebAccess: telegramWebAccess ? {
      role: telegramWebAccess.grant.role,
      launchUrl: telegramWebAccess.launchUrl,
      publicUrl: linkedPublicUrl || telegramWebAccess.grant.public_url,
    } : null,
    hasUnlimited: plans.includes('unlimited'),
    hasPhotoUpload,
    hasVideoUpload,
    activePlan: plans[0] || '',
    activeCount: rows.length,
    statuses: rows.map((row) => ({ plan: row.plan, status: row.status, source: row.source })),
    activeTelegramCollaborators: collaboratorRows.map((row) => ({
      displayName: cleanText(row.display_name, 180),
      telegramChatId: cleanText(row.telegram_chat_id, 120),
      telegramUserId: cleanText(row.telegram_user_id, 120),
      planCode: cleanText(row.plan_code, 120),
      status: cleanText(row.status, 80),
    })),
    websiteEditorGrants: webEditorRows.map((row) => ({
      email: cleanText(row.email, 180),
      displayName: cleanText(row.display_name, 180),
      role: cleanText(row.role, 80),
      status: cleanText(row.status, 80),
    })),
  };
}

export function ownerMediaCheckoutUrl(session, env = process.env) {
  const base = `${siteBase(env)}/owner-media-checkout.html`;
  const token = cleanText(session?.token || session?.onboardingToken || session?.onboarding_token, 160);
  return token ? `${base}?session=${encodeURIComponent(token)}` : base;
}

export function vacationSupportReply({ text, intent, access }) {
  const normalized = cleanText(text, 2000).toLowerCase();
  const asksForWebsiteLink = /\b(send|share|show|give|need|where|what|open)\b/.test(normalized)
    && /\b(website|web site|site|link|url)\b/.test(normalized)
    && /\b(vacation|trip|itinerary|vegas|las vegas|strip)\b/.test(normalized);
  if (intent?.intent === 'website_link_question' || (intent?.intent === 'support_question' && asksForWebsiteLink)) {
    if (!access?.linked) {
      return [
        'I do not see a linked TimeSyncher Vacation purchase for this Telegram chat yet.',
        '',
        'Use the Telegram link from the checkout email first, then I can send the vacation website link for this account.',
      ].join('\n');
    }
    const label = cleanText(access?.trip?.title || 'this vacation', 180);
    const url = cleanText(access?.telegramWebAccess?.launchUrl || access?.trip?.publicUrl, 800);
    if (!url) return `I found the linked account, but I could not find the website link for ${label} yet.`;
    const role = cleanText(access?.telegramWebAccess?.role, 80);
    if (role === 'owner' || role === 'telegram_collaborator') {
      return `Here is the ${escapeHtml(label)} website for this Telegram account: <a href="${escapeHtml(url)}">click this link</a>`;
    }
    return `Here is the ${label} website link:\n\n${url}`;
  }
  if (intent?.intent === 'media_upload_question') {
    if (!access?.linked) {
      return [
        'I do not see a linked TimeSyncher Vacation purchase for this Telegram chat yet.',
        '',
        'Use the Telegram link from the checkout email first, then this chat can check and use photo/video upload access.',
      ].join('\n');
    }
    const asksPhoto = /\b(pic|pics|photo|photos|picture|pictures|media)\b/.test(normalized);
    const asksVideo = /\b(video|videos|media)\b/.test(normalized);
    const photoOk = !asksPhoto || access.hasPhotoUpload;
    const videoOk = !asksVideo || access.hasVideoUpload;
    if (photoOk && videoOk) {
      return 'Yes. This linked TimeSyncher Vacation chat has the needed photo/video upload access. Send the pics or videos here, and I will attach them to the Vegas vacation.';
    }
    return [
      'Not yet. This chat is linked, but I do not see the needed photo/video upload add-on active for this account.',
      '',
      `Use the owner media add-on checkout here: ${ownerMediaCheckoutUrl(access?.session, process.env)}`,
    ].join('\n');
  }
  if (intent?.intent === 'collaborator_access_question') {
    if (collaboratorStatusQuestion(normalized)) {
      if (!access?.linked) {
        return [
          'I do not see a linked TimeSyncher Vacation purchase for this Telegram chat yet.',
          '',
          'Use the Telegram link from the checkout email first, then I can check collaborator access for this account.',
        ].join('\n');
      }
      let person = accessPersonName(text);
      const label = cleanText(access?.trip?.title || 'this vacation', 180);
      const grants = access.websiteEditorGrants || [];
      if (/^your (wife|husband|spouse|partner)$/i.test(person) && grants.length === 1 && cleanText(grants[0].displayName, 80)) {
        person = cleanText(grants[0].displayName, 80);
      }
      const personNeedle = person.toLowerCase();
      const telegramCollaborator = (access.activeTelegramCollaborators || []).some((collaborator) => [
        collaborator.displayName,
        collaborator.telegramChatId,
        collaborator.telegramUserId,
      ].filter(Boolean).join(' ').toLowerCase().includes(personNeedle));
      const webEditorGrant = grants.find((grant) => [
        grant.displayName,
        grant.email,
      ].filter(Boolean).join(' ').toLowerCase().includes(personNeedle));
      if (telegramCollaborator) return `Yes, ${person} is a Telegram collaborator on ${label}.`;
      const webCopy = webEditorGrant
        ? (webEditorGrant.status === 'accepted'
          ? ` ${person} has accepted the website editor invite, but website editing and Telegram collaboration are separate.`
          : ` ${person} has been sent a website editor invite, but website editing and Telegram collaboration are separate.`)
        : ' Website editing and Telegram collaboration are separate.';
      return `No, ${person} is not a Telegram collaborator on ${label} yet.${webCopy}`;
    }
    return collaboratorCheckoutCopy();
  }
  if (intent?.intent === 'account_question') {
    if (!access?.linked) {
      return [
        'I do not see a linked TimeSyncher Vacation purchase for this Telegram chat yet.',
        '',
        'Use the Telegram link from the checkout email, then I can check whether the account has single-vacation or unlimited access.',
      ].join('\n');
    }
    if (access.hasUnlimited) {
      return 'Yes. This Telegram chat is linked to an active unlimited TimeSyncher Vacation plan.';
    }
    if (access.activeCount > 0) {
      return 'This Telegram chat is linked to an active single-vacation TimeSyncher Vacation plan. I do not see unlimited access on this account.';
    }
    return [
      'I see this Telegram chat is linked to a TimeSyncher Vacation customer, but I do not see an active vacation entitlement yet.',
      '',
      'Use the checkout link from the purchase flow, or send the order context here and I can check again.',
    ].join('\n');
  }
  if (/\b(book|booking|reserve|reservation|purchase|pay for|hold)\b/.test(normalized)) {
    return 'TimeSyncher Vacation helps organize and compare itinerary options. Customers verify details and make any bookings themselves.';
  }
  return 'I can help with that. Ask the support question here, or tell me clearly if you want me to start or update a vacation itinerary.';
}

async function ownerHasUnlimitedVacationPlan(db, session) {
  if (!session?.customer_id) return false;
  const rows = await db`
    select 1
    from entitlements
    where customer_id = ${session.customer_id}
      and status = 'active'
      and plan = 'unlimited'
    union
    select 1
    from paid_orders
    where customer_id = ${session.customer_id}
      and status in ('paid', 'coupon_redeemed')
      and plan = 'unlimited'
    limit 1
  `;
  return Boolean(rows[0]);
}

function collaboratorPaymentUrl(token, planCode, env = process.env) {
  const path = env.TIMESYNCHER_COLLABORATOR_PAYMENT_PATH || '/addons-checkout.html?collaboratorInvite=';
  const base = siteBase(env);
  const separator = path.includes('?') ? '&' : '?';
  if (path.includes('collaboratorInvite=')) {
    return `${base}${path}${encodeURIComponent(token)}${separator}plan=${encodeURIComponent(planCode)}`;
  }
  return `${base}${path}${separator}collaboratorInvite=${encodeURIComponent(token)}&plan=${encodeURIComponent(planCode)}`;
}

async function createTokenizedCollaboratorPaymentLink(db, session, { text, telegramChatId, telegramUserId, planCode }) {
  const { invite, token } = await createCollaboratorInvite(db, {
    ownerCustomerId: session.customer_id,
    tripId: session.trip_id,
    planCode,
    requestedFor: text,
    metadata: {
      source: 'telegram_owner_request_tokenized_payment',
      requestedByTelegramChatId: telegramChatId || null,
      requestedByTelegramUserId: telegramUserId || null,
    },
    env: process.env,
  });
  return {
    inviteId: invite.id,
    checkoutUrl: collaboratorPaymentUrl(token, planCode, process.env),
    allowPromotionCodes: true,
  };
}

async function collaboratorCheckoutReply(db, session, { text, telegramChatId, telegramUserId }) {
  if (!session?.customer_id || !session?.trip_id) {
    return {
      reply: collaboratorCheckoutCopy(),
      payload: {
        collaboratorEntitlement: {
          required: true,
          error: 'linked owner vacation session required',
        },
      },
    };
  }

  let single;
  let unlimited = null;
  const showUnlimitedCollaboratorPlan = await ownerHasUnlimitedVacationPlan(db, session);
  try {
    const stripe = collaboratorStripe(process.env);
    const base = {
      db,
      stripe,
      env: process.env,
      ownerCustomerId: session.customer_id,
      tripId: session.trip_id,
      requestedFor: text,
      metadata: {
        requestedByTelegramChatId: telegramChatId || null,
        requestedByTelegramUserId: telegramUserId || null,
        requestedFrom: 'telegram_owner_request',
      },
    };
    single = await createCollaboratorCheckout({ ...base, planCode: 'telegram_collaborators_single_trip' });
    if (showUnlimitedCollaboratorPlan) {
      unlimited = await createCollaboratorCheckout({ ...base, planCode: 'telegram_collaborators_unlimited_trips' });
    }
  } catch (error) {
    if (!/Live Stripe is disabled/i.test(error?.message || '')) throw error;
    single = await createTokenizedCollaboratorPaymentLink(db, session, {
      text,
      telegramChatId,
      telegramUserId,
      planCode: 'telegram_collaborators_single_trip',
    });
    if (showUnlimitedCollaboratorPlan) {
      unlimited = await createTokenizedCollaboratorPaymentLink(db, session, {
        text,
        telegramChatId,
        telegramUserId,
        planCode: 'telegram_collaborators_unlimited_trips',
      });
    }
  }
  const checkoutLinks = {
    singleTrip: {
      inviteId: single.inviteId,
      checkoutUrl: single.checkoutUrl,
      allowPromotionCodes: single.allowPromotionCodes,
    },
  };
  if (unlimited) {
    checkoutLinks.unlimitedTrips = {
      inviteId: unlimited.inviteId,
      checkoutUrl: unlimited.checkoutUrl,
      allowPromotionCodes: unlimited.allowPromotionCodes,
    };
  }
  return {
    reply: collaboratorCheckoutReplyText(),
    payload: {
      collaboratorEntitlement: {
        required: true,
        plans: unlimited
          ? ['telegram_collaborators_single_trip', 'telegram_collaborators_unlimited_trips']
          : ['telegram_collaborators_single_trip'],
        checkoutEndpoint: '/api/create-payment-intent',
        checkoutAction: 'create_collaborator_checkout',
        checkoutLinks,
      },
    },
  };
}

async function markVoiceNotePracticePrompted(db, session) {
  const rows = await db`
    update telegram_sessions
    set current_step = 'awaiting_voice_note_practice',
      metadata = metadata || ${{
        voiceNotePracticePromptedAt: new Date().toISOString(),
      }},
      updated_at = now()
    where id = ${session.id}
    returning *
  `;
  return rows[0];
}

async function markEulaAcceptanceRequired(db, session, eula) {
  const rows = await db`
    update telegram_sessions
    set current_step = 'pending_eula_acceptance',
      metadata = metadata || ${{
        eulaRequiredAt: new Date().toISOString(),
        eulaAcceptUrl: eula.acceptUrl,
        eulaSessionId: eula.sessionId,
      }},
      updated_at = now()
    where id = ${session.id}
    returning *
  `;
  return rows[0];
}

async function markVoiceNotePracticeComplete(db, session) {
  const rows = await db`
    update telegram_sessions
    set current_step = 'awaiting_vacation_identity',
      metadata = metadata || ${{
        voiceNotePracticeCompletedAt: new Date().toISOString(),
      }},
      updated_at = now()
    where id = ${session.id}
    returning *
  `;
  return rows[0];
}

async function saveVacationIdentity(db, session, text) {
  const parsed = parseVacationIdentity(text);
  const existing = sessionMetadata(session);
  const vacationName = cleanText(parsed.vacationName || existing.vacationName, 160);
  const unforgettableGoal = cleanText(parsed.unforgettableGoal || existing.unforgettableGoal, 1000);
  if (!vacationName || !unforgettableGoal) {
    return { complete: false, vacationName, unforgettableGoal };
  }
  const rows = await db`
    update telegram_sessions
    set current_step = 'awaiting_trip_details',
      metadata = metadata || ${{
        vacationName,
        unforgettableGoal,
        vacationIdentityCapturedAt: new Date().toISOString(),
      }},
      updated_at = now()
    where id = ${session.id}
    returning *
  `;
  return { complete: true, session: rows[0], vacationName, unforgettableGoal };
}

async function queueSetupRequest(db, session, text, payload, kind) {
  if (!session?.customer_id || !session?.trip_id || !text) return null;
  const request = kind || requestKind(text);
  const metadata = sessionMetadata(session);
  const requestRows = await db`
    insert into vacation_requests (
      customer_id, trip_id, source, request_type, request_text, normalized_intent, payload,
      status, queued_at
    )
    values (
      ${session.customer_id}, ${session.trip_id}, 'telegram_vacation_bot', ${request.requestType},
      ${text}, ${{
        onboardingStep: session.current_step,
        source: 'telegram',
        intent: request.intent,
        vacationName: cleanText(metadata.vacationName, 160) || null,
        unforgettableGoal: cleanText(metadata.unforgettableGoal, 1000) || null,
      }}, ${payload}, 'queued', now()
    )
    returning id
  `;
  const requestId = requestRows[0].id;
  await db`
    insert into vacation_request_events (request_id, event_type, actor, details)
    values (${requestId}, 'telegram_setup_received', 'customer', ${payload})
  `;
  const jobRows = await db`
    insert into worker_jobs (request_id, trip_id, job_type, input)
    values (${requestId}, ${session.trip_id}, ${request.jobType}, ${{
      customerId: session.customer_id,
      tripId: session.trip_id,
      requestId,
      source: 'telegram_vacation_bot',
      requestType: request.requestType,
      requestText: text,
      payload: {
        ...payload,
        vacationName: cleanText(metadata.vacationName, 160) || null,
        unforgettableGoal: cleanText(metadata.unforgettableGoal, 1000) || null,
      },
    }})
    returning id
  `;
  return { requestId, jobId: jobRows[0].id };
}

async function canQueueTelegramModification(db, session, { telegramChatId, telegramUserId, kind }) {
  if (!session?.customer_id || !session?.trip_id) return { allowed: false, reason: 'unlinked_session' };
  if (kind?.requestType !== 'itinerary_research_update') return { allowed: true, reason: 'owner_onboarding_or_intake' };
  const ownerRows = await db`
    select id
    from telegram_sessions
    where customer_id = ${session.customer_id}
      and trip_id = ${session.trip_id}
      and coalesce(metadata->>'telegramRole', '') <> 'collaborator'
      and (
        (${telegramChatId || null}::text is not null and telegram_chat_id = ${telegramChatId || null})
        or (${telegramUserId || null}::text is not null and telegram_user_id = ${telegramUserId || null})
      )
    limit 1
  `;
  if (ownerRows[0]) return { allowed: true, reason: 'owner_telegram_session' };
  const collaborator = await activeCollaboratorForTelegram(db, {
    ownerCustomerId: session.customer_id,
    tripId: session.trip_id,
    telegramChatId,
    telegramUserId,
  });
  if (collaborator) return { allowed: true, reason: 'paid_collaborator', collaboratorId: collaborator.id };
  return { allowed: false, reason: 'missing_paid_collaborator' };
}

function setupReply({ startLinked, hasSession, text, kind }) {
  if (startLinked) {
    return voiceNoteIntro();
  }
  if (!hasSession) {
    return [
      'Welcome to TimeSyncher Vacation.',
      '',
      'I can start a planning note, but I do not see a linked paid onboarding session yet. Use the bot link from your purchase email if you have one.',
    ].join('\n');
  }
  if (/^\/help\b/i.test(text)) {
    return 'Send one voice note or text summary with the vacation name, destination, rough dates or trip length, who is traveling, budget range, must-dos, and anything you want avoided. I will use it to draft the trip paragraph, then ask only for missing details.';
  }
  if (kind?.requestType === 'itinerary_research_update') {
    return [
      'Got it. I am updating the hosted TimeSyncher Vacation itinerary now.',
      '',
      'I will send the itinerary link when the next pass is ready. You can keep sending changes or priorities here while I work.',
    ].join('\n');
  }
  return [
    'I am turning the information you sent into a hosted TimeSyncher Vacation itinerary.',
    '',
    'I will send the itinerary link when the first pass is ready. You can keep sending any updates, must-do experiences, reservations, or preferences here while I work.',
  ].join('\n');
}

export default async function handler(req, res) {
  try {
    const db = sql(process.env);
    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'https://timesyncher.com');
      const action = cleanText(url.searchParams.get('action'), 80);
      if (action === 'media-download') return await downloadMedia(db, req, res);
      if (action === 'media-list') return sendJson(res, 200, { ok: true, media: await listMedia(db, req) });
      return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    requireIntakeAuth(req, process.env);
    const body = await readJson(req);
    const event = cleanText(body.event || 'message', 80);

    if (event === 'delivery') {
      const transcriptId = cleanText(body.transcriptId || body.transcript_id, 80);
      if (!transcriptId) return sendJson(res, 400, { ok: false, error: 'transcriptId is required.' });
      await db`
        update transcript_turns
        set sent_at = coalesce(sent_at, ${body.sentAt || new Date().toISOString()}),
          telegram_message_id = coalesce(telegram_message_id, ${cleanText(body.telegramMessageId || body.telegram_message_id, 120) || null})
        where id = ${transcriptId}
      `;
      return sendJson(res, 200, { ok: true });
    }

    const message = body.message || {};
    const user = body.user || {};
    const telegramChatId = cleanText(body.telegramChatId || message.chatId || message.chat_id, 120);
    const telegramUserId = cleanText(body.telegramUserId || user.id, 120);
    if (event === 'bot_error') {
      const session = telegramChatId
        ? await findSessionForTelegram(db, telegramChatId, telegramUserId ? `telegram:${telegramUserId}` : '')
        : null;
      const stage = cleanText(body.stage || 'telegram_bot', 120);
      const errorMessage = cleanText(body.error || body.errorMessage || 'Unknown bot error', 1000);
      const transcriptId = await recordTranscript(db, {
        session,
        speaker: 'system',
        direction: 'system',
        body: `Bot error (${stage}): ${errorMessage}`,
        channel: 'telegram_vacation_bot_error',
        telegramMessageId: cleanText(body.telegramMessageId || message.messageId || message.message_id, 120),
        payload: {
          stage,
          error: errorMessage,
          updateId: cleanText(body.updateId || body.update_id, 120) || null,
          retryPolicy: body.retryPolicy || null,
          telegramChatId: telegramChatId || null,
          telegramUserId: telegramUserId || null,
          details: body.details || {},
        },
        receivedAt: body.failedAt || new Date().toISOString(),
        onboardingStep: session?.current_step || 'bot_error',
      });
      return sendJson(res, 200, { ok: true, transcriptId, telegramSessionId: session?.id || null });
    }

    if (event === 'media_upload') {
      const result = await recordMediaUpload(db, req, body);
      return sendJson(res, 200, { ok: true, ...result });
    }

    const text = cleanText(body.text || message.text, 12000);
    const receivedAt = body.receivedAt || new Date().toISOString();
    const startMatch = /^\/start(?:\s+(.+))?/i.exec(text);
    const startToken = cleanText(body.onboardingToken || (startMatch ? startMatch[1] : ''), 160);
    if (!telegramChatId) return sendJson(res, 400, { ok: false, error: 'telegramChatId is required.' });

    const onboarding = startToken ? await getSessionByToken(db, startToken) : null;
    if (startToken && !onboarding) {
      const collaboratorStart = await acceptCollaboratorInvite(db, {
        token: startToken,
        telegramChatId,
        telegramUserId: telegramUserId ? `telegram:${telegramUserId}` : '',
        displayName: displayName(user),
        username: cleanText(user.username, 120),
        payload: body.payload || {},
        env: process.env,
      });
      if (collaboratorStart.status !== 'not_found') {
        const collaboratorSession = await findSessionForTelegram(db, telegramChatId, telegramUserId ? `telegram:${telegramUserId}` : '');
        const inboundTranscriptId = await recordTranscript(db, {
          session: collaboratorSession,
          speaker: 'customer',
          direction: 'inbound',
          body: text,
          telegramMessageId: cleanText(body.telegramMessageId || message.messageId || message.message_id, 120),
          payload: {
            ...(body.payload || {}),
            collaboratorInviteId: collaboratorStart.invite?.id || null,
            collaboratorStartStatus: collaboratorStart.status,
          },
          receivedAt,
          onboardingStep: collaboratorSession?.current_step || 'collaborator_start',
        });
        const reply = collaboratorStart.reply || collaboratorDeniedCopy();
        const respondedAt = new Date();
        const latency = Math.max(0, respondedAt.getTime() - new Date(receivedAt).getTime());
        const outboundTranscriptId = await recordTranscript(db, {
          session: collaboratorSession,
          speaker: 'assistant',
          direction: 'outbound',
          body: reply,
          payload: {
            collaboratorInviteId: collaboratorStart.invite?.id || null,
            collaboratorStartStatus: collaboratorStart.status,
            eula: collaboratorStart.eula || null,
          },
          receivedAt,
          sentAt: respondedAt.toISOString(),
          responseLatencyMs: Number.isFinite(latency) ? latency : null,
          onboardingStep: collaboratorSession?.current_step || 'collaborator_start',
        });
        return sendJson(res, 200, {
          ok: true,
          reply,
          collaboratorInvite: {
            status: collaboratorStart.status,
            accepted: Boolean(collaboratorStart.ok),
            eulaRequired: collaboratorStart.status === 'eula_required',
            eulaAcceptUrl: collaboratorStart.eula?.acceptUrl || null,
          },
          telegramSessionId: collaboratorSession?.id || null,
          inboundTranscriptId,
          outboundTranscriptId,
          queued: null,
          responseLatencyMs: Number.isFinite(latency) ? latency : null,
        });
      }
    }
    if (startToken && onboarding) {
      const eula = await vacationEulaStatus(onboarding, process.env);
      if (!eula.ok) {
        let pendingSession = await ensureTelegramSession(db, {
          onboarding: null,
          telegramChatId,
          telegramUserId: telegramUserId ? `telegram:${telegramUserId}` : '',
          user,
          payload: {
            ...(body.payload || {}),
            onboardingSessionId: onboarding.id,
            eulaSessionId: eula.sessionId,
          },
        });
        pendingSession = await markEulaAcceptanceRequired(db, pendingSession, eula);
        const inboundTranscriptId = await recordTranscript(db, {
          session: pendingSession,
          speaker: 'customer',
          direction: 'inbound',
          body: text,
          telegramMessageId: cleanText(body.telegramMessageId || message.messageId || message.message_id, 120),
          payload: body.payload || {},
          receivedAt,
          onboardingStep: pendingSession.current_step,
        });
        const reply = eulaRequiredReply(eula);
        const respondedAt = new Date();
        const latency = Math.max(0, respondedAt.getTime() - new Date(receivedAt).getTime());
        const outboundTranscriptId = await recordTranscript(db, {
          session: pendingSession,
          speaker: 'assistant',
          direction: 'outbound',
          body: reply,
          payload: { eulaRequired: true, eulaAcceptUrl: eula.acceptUrl, eulaSessionId: eula.sessionId },
          receivedAt,
          sentAt: respondedAt.toISOString(),
          responseLatencyMs: Number.isFinite(latency) ? latency : null,
          onboardingStep: pendingSession.current_step,
        });
        return sendJson(res, 200, {
          ok: true,
          reply,
          eulaRequired: true,
          eulaAcceptUrl: eula.acceptUrl,
          telegramSessionId: pendingSession.id,
          inboundTranscriptId,
          outboundTranscriptId,
          queued: null,
          responseLatencyMs: Number.isFinite(latency) ? latency : null,
        });
      }
    }
    const existingSession = onboarding ? null : await findSessionForTelegram(db, telegramChatId, telegramUserId ? `telegram:${telegramUserId}` : '');
    let session;
    if (existingSession && !onboarding) {
      const rows = await db`
        update telegram_sessions
        set last_message_at = now(),
          metadata = metadata || ${{
            telegramUsername: user.username || null,
            displayName: displayName(user),
            ...(body.payload || {}),
          }},
          updated_at = now()
        where id = ${existingSession.id}
        returning *
      `;
      session = rows[0];
    } else {
      session = await ensureTelegramSession(db, {
        onboarding,
        telegramChatId,
        telegramUserId: telegramUserId ? `telegram:${telegramUserId}` : '',
        user,
        payload: body.payload || {},
      });
    }

    const inboundTranscriptId = await recordTranscript(db, {
      session,
      speaker: 'customer',
      direction: 'inbound',
      body: text,
      telegramMessageId: cleanText(body.telegramMessageId || message.messageId || message.message_id, 120),
      payload: body.payload || {},
      receivedAt,
      onboardingStep: session.current_step,
    });

    const blockedAction = blockHighAuthorityRequest(text, process.env);
    if (blockedAction.blocked) {
      const respondedAt = new Date();
      const latency = Math.max(0, respondedAt.getTime() - new Date(receivedAt).getTime());
      const reply = blockedAction.message;
      const outboundTranscriptId = await recordTranscript(db, {
        session,
        speaker: 'assistant',
        direction: 'outbound',
        body: reply,
        channel: 'system_guard',
        payload: {
          blocked: true,
          code: 'HIGH_AUTHORITY_ACTION_BLOCKED',
          kinds: blockedAction.kinds,
        },
        receivedAt,
        sentAt: respondedAt.toISOString(),
        responseLatencyMs: Number.isFinite(latency) ? latency : null,
        onboardingStep: session.current_step,
      });
      return sendJson(res, 200, {
        ok: true,
        reply,
        telegramSessionId: session.id,
        inboundTranscriptId,
        outboundTranscriptId,
        queued: null,
        blocked: true,
        blockedKinds: blockedAction.kinds,
        responseLatencyMs: Number.isFinite(latency) ? latency : null,
      });
    }

    let kind = requestKind(text);
    let queued = null;
    let reply;
    let replyPayload = {};
    const collaboratorInviteRequested = session?.customer_id && isCollaboratorInviteRequest(text) && !collaboratorStatusQuestion(text);
    const supportIntent = collaboratorInviteRequested ? null : await vacationSupportIntentWithModel(text);

    if (startMatch) {
      if (onboarding) session = await markVoiceNotePracticePrompted(db, session);
      reply = setupReply({ startLinked: Boolean(onboarding), hasSession: Boolean(session?.customer_id), text, kind });
    } else if (supportIntent) {
      const access = await vacationAccessSummary(db, session, { telegramChatId, telegramUserId, payload: body.payload || {}, text });
      reply = vacationSupportReply({ text, intent: supportIntent, access });
      replyPayload = {
        supportRouter: {
          intent: supportIntent.intent,
            shouldQueueWorker: false,
            confidence: supportIntent.confidence,
            source: supportIntent.source || 'deterministic_fallback',
            access: {
              linked: access.linked,
              hasUnlimited: access.hasUnlimited,
              hasPhotoUpload: access.hasPhotoUpload,
              hasVideoUpload: access.hasVideoUpload,
              activePlan: access.activePlan || null,
              activeCount: access.activeCount,
            },
        },
      };
    } else if (session?.customer_id && session.current_step === 'awaiting_voice_note_practice') {
      session = await markVoiceNotePracticeComplete(db, session);
      queued = await queueSetupRequest(db, session, text, {
        ...(body.payload || {}),
        initialTravelBrief: true,
        inboundTranscriptId,
        telegramChatId,
        telegramUserId,
      }, kind);
      reply = firstTripDetailsAck({ queued });
    } else if (session?.customer_id && !hasVacationIdentity(session)) {
      const saved = await saveVacationIdentity(db, session, text);
      if (saved.complete) {
        session = saved.session;
        replyPayload = { vacationName: saved.vacationName, unforgettableGoal: saved.unforgettableGoal };
        if (hasTripPlanningDetails(text)) {
          kind = requestKind(text);
          queued = await queueSetupRequest(db, session, text, {
            ...(body.payload || {}),
            vacationName: saved.vacationName,
            unforgettableGoal: saved.unforgettableGoal,
            inboundTranscriptId,
            telegramChatId,
            telegramUserId,
            identityMessageAlsoQueued: true,
          }, kind);
        }
        reply = vacationIdentityAck({ vacationName: saved.vacationName, text, queued });
      } else {
        replyPayload = { vacationName: saved.vacationName || null, unforgettableGoal: saved.unforgettableGoal || null };
        const missing = missingSummaryQuestions(text);
        reply = [
          identityPrompt(),
          '',
          saved.vacationName ? `I caught the name as “${saved.vacationName}”; I still need what would make it unforgettable.` : 'Please include both the vacation name and what would make it unforgettable.',
          missing.length ? `Also include: ${missing.join(', ')}.` : '',
        ].filter(Boolean).join('\n');
      }
    } else if (collaboratorInviteRequested) {
      try {
        const checkout = await collaboratorCheckoutReply(db, session, { text, telegramChatId, telegramUserId });
        reply = checkout.reply;
        replyPayload = checkout.payload;
      } catch (error) {
        reply = [
          collaboratorCheckoutCopy(),
          '',
          'I could not create the checkout links in this moment. Please try again in a minute.',
        ].join('\n');
        replyPayload = {
          collaboratorEntitlement: {
            required: true,
            error: error.message || 'checkout link creation failed',
          },
        };
      }
    } else {
      const authz = await canQueueTelegramModification(db, session, { telegramChatId, telegramUserId, kind });
      if (!authz.allowed) {
        reply = collaboratorDeniedCopy();
        replyPayload = { collaboratorAuthorization: authz };
      } else {
        let tripItems = [];
        try {
          if (session.trip_id) {
            const rows = await db`
              select id, title, location, metadata
              from trip_things
              where trip_id = ${session.trip_id}
              limit 200
            `;
            tripItems = rows.map((row) => ({
              id: row.id,
              trip_id: session.trip_id,
              title: row.title,
              location: row.location,
              day: Number(row.metadata?.day || 0) || null,
            }));
          }
        } catch {
          tripItems = [];
        }
        const editGate = gateTelegramIntakeEdit({
          text,
          payload: body.payload || {},
          audioPath: body.payload?.telegramVoice?.cachePath || body.payload?.voiceCache?.path,
          actor: actorFromLiveSession({
            id: telegramUserId || telegramChatId,
            telegramUserId,
            customer_id: session.customer_id,
            trip_id: session.trip_id,
            metadata: sessionMetadata(session),
            collaborator: authz.reason === 'paid_collaborator' ? { id: authz.collaboratorId || 'paid', status: 'active' } : null,
            entitlement: { allowed: false },
          }),
          trip: {
            trip_id: session.trip_id,
            title: cleanText(sessionMetadata(session).vacationName, 160) || 'Vacation',
            status: 'live',
            items: tripItems,
          },
        });
        replyPayload = { ...replyPayload, vacationEditPipeline: editGate.compact || { skip: Boolean(editGate.skip) } };
        if (!editGate.skip && editGate.failClosed) {
          reply = editGate.receipt.customer_facing_response;
        } else {
          queued = await queueSetupRequest(db, session, text, {
        ...(body.payload || {}),
        vacationName: cleanText(sessionMetadata(session).vacationName, 160) || null,
        unforgettableGoal: cleanText(sessionMetadata(session).unforgettableGoal, 1000) || null,
        inboundTranscriptId,
        telegramChatId,
        telegramUserId,
          collaboratorAuthorization: authz,
          vacationEditPipeline: editGate.compact,
        }, kind);
          reply = (!editGate.skip && editGate.receipt?.planned_writes?.length)
            ? editGate.receipt.customer_facing_response
            : setupReply({ startLinked: Boolean(onboarding), hasSession: Boolean(session?.customer_id), text, kind });
        }
      }
    }
    const respondedAt = new Date();
    const latency = Math.max(0, respondedAt.getTime() - new Date(receivedAt).getTime());
    const outboundTranscriptId = await recordTranscript(db, {
      session,
      speaker: 'assistant',
      direction: 'outbound',
      body: reply,
      payload: { queued, ...replyPayload },
      receivedAt,
      sentAt: respondedAt.toISOString(),
      responseLatencyMs: Number.isFinite(latency) ? latency : null,
      onboardingStep: session.current_step,
    });

    return sendJson(res, 200, {
      ok: true,
      reply,
      payload: { queued, ...replyPayload },
      telegramSessionId: session.id,
      inboundTranscriptId,
      outboundTranscriptId,
      queued,
      responseLatencyMs: Number.isFinite(latency) ? latency : null,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to record Telegram turn.' });
  }
}
