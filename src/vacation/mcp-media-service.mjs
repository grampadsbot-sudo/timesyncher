import { cleanText } from './http.mjs';
import { putMediaBlob } from './thing-media-store.mjs';
import { extractExifFromBuffer, inferVacationTimeZone, resolveMediaDayAssignment } from './mcp-exif.mjs';
import {
  assertVacationScope,
  ensureVacationMcpSchema,
  signMediaUploadUrl,
  verifyMediaUploadSignature,
} from './mcp-tokens.mjs';
import { asArray, asObject, enumerateVacationDates, isoDateOnly, recordVacationMediaUsage } from './mcp-read.mjs';

const FORBIDDEN_MEDIA_BYTE_KEYS = new Set([
  'bytes', 'data', 'base64', 'content', 'dataurl', 'data_url',
  'filedata', 'file_data', 'body', 'buffer', 'binary', 'blob',
]);

function containsRawMediaBytes(value, depth = 0) {
  if (!value || depth > 5) return false;
  if (typeof value === 'string') return /^data:(?:image|video)\//i.test(value.trim());
  if (Array.isArray(value)) return value.some((entry) => containsRawMediaBytes(entry, depth + 1));
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_MEDIA_BYTE_KEYS.has(key.toLowerCase())) return true;
      if (containsRawMediaBytes(entry, depth + 1)) return true;
    }
  }
  return false;
}

export async function loadScopedChangeSet(db, { changeSetId, scopedTripId }) {
  const id = cleanText(changeSetId, 80);
  if (!id) throw Object.assign(new Error('draft_id is required.'), { statusCode: 400, code: 'missing_draft_id' });
  const rows = await db`select * from vacation_mcp_change_sets where id = ${id} limit 1`;
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Draft or change set not found.'), { statusCode: 404, code: 'change_set_not_found' });
  if (String(row.scope_trip_id) !== String(scopedTripId)) {
    throw Object.assign(
      new Error('This AI access token is scoped to a different vacation.'),
      { statusCode: 403, code: 'vacation_scope_mismatch' },
    );
  }
  return row;
}

export async function loadTripContext(db, tripId) {
  const tripRows = await db`
    select id, title, destination, start_date, end_date, metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const things = await db`
    select id, category, title, description, starts_at, ends_at, cost_estimate_cents, location, metadata
    from trip_things
    where trip_id = ${tripId}
    order by created_at asc
  `;
  return { trip: tripRows[0] || null, things };
}

async function resolveTimeZoneAndDates(db, { scopeTripId, changeSetId = null, fallbackTimeZone = '' }) {
  if (changeSetId) {
    const csRows = await db`select payload from vacation_mcp_change_sets where id = ${changeSetId} limit 1`;
    const draft = asObject(csRows[0]?.payload);
    const vac = asObject(draft.vacation);
    const draftDays = asArray(draft.days).map((d) => isoDateOnly(d?.date)).filter(Boolean);
    const dayDates = draftDays.length ? draftDays : enumerateVacationDates(vac.start_date, vac.end_date);
    const timeZone = inferVacationTimeZone({
      timezone: cleanText(vac.timezone || fallbackTimeZone, 80),
      timezoneExplicit: Boolean(cleanText(vac.timezone || fallbackTimeZone, 80)),
      destination: cleanText(vac.destination || vac.title, 180),
    });
    if (dayDates.length) return { timeZone, dayDates };
  }
  const tripRows = await db`select title, destination, start_date, end_date, metadata from trips where id = ${scopeTripId} limit 1`;
  const trip = tripRows[0];
  const meta = asObject(trip?.metadata);
  const metaDays = asArray(meta.days).map((d) => isoDateOnly(d?.date)).filter(Boolean);
  const dayDates = metaDays.length ? metaDays : enumerateVacationDates(trip?.start_date, trip?.end_date);
  const timeZone = inferVacationTimeZone({
    timezone: cleanText(meta.timezone || fallbackTimeZone, 80),
    timezoneExplicit: meta.timezoneExplicit === true,
    destination: cleanText(trip?.destination || trip?.title, 180),
  });
  return { timeZone, dayDates };
}

export async function handleUploadMedia(db, tokenRecord, args = {}, {
  baseUrl = '',
  ttlSeconds = 900,
  now = () => new Date(),
  env = process.env,
} = {}) {
  await ensureVacationMcpSchema(db);
  assertVacationScope(tokenRecord, args.vacation_id);
  if (containsRawMediaBytes(args)) {
    throw Object.assign(
      new Error('Media bytes cannot be sent in the MCP request body. Request a signed upload URL and PUT the file directly.'),
      { statusCode: 400, code: 'media_bytes_not_allowed_in_mcp' },
    );
  }
  const action = cleanText(args.action, 40) || (args.media_ids || args.media_id ? 'finalize' : 'request_upload');
  let changeSetId = null;
  if (args.draft_id) {
    const cs = await loadScopedChangeSet(db, { changeSetId: args.draft_id, scopedTripId: tokenRecord.tripId });
    changeSetId = String(cs.id);
  }

  if (action === 'finalize') {
    const ids = asArray(args.media_ids).length
      ? asArray(args.media_ids).map((id) => cleanText(id, 80)).filter(Boolean)
      : (args.media_id ? [cleanText(args.media_id, 80)] : []);
    if (!ids.length) {
      throw Object.assign(new Error('media_ids or media_id is required for finalize.'), { statusCode: 400, code: 'missing_media_ids' });
    }
    const finalized = [];
    let latestUsage = null;
    for (const mediaId of ids) {
      const rows = await db`select * from vacation_mcp_draft_media where id = ${mediaId} limit 1`;
      const row = rows[0];
      if (!row) throw Object.assign(new Error(`Media ${mediaId} not found.`), { statusCode: 404, code: 'media_not_found' });
      if (String(row.scope_trip_id) !== String(tokenRecord.tripId)) {
        throw Object.assign(new Error('This AI access token is scoped to a different vacation.'), { statusCode: 403, code: 'vacation_scope_mismatch' });
      }
      if (row.upload_status === 'signed') {
        throw Object.assign(new Error(`Media ${mediaId} has not been uploaded to its signed URL yet.`), { statusCode: 409, code: 'media_not_uploaded' });
      }
      const effectiveChangeSetId = changeSetId || (row.change_set_id ? String(row.change_set_id) : null);
      const { timeZone, dayDates } = await resolveTimeZoneAndDates(db, {
        scopeTripId: tokenRecord.tripId,
        changeSetId: effectiveChangeSetId,
        fallbackTimeZone: cleanText(args.timezone, 80),
      });
      const exifRaw = asObject(row.exif_raw);
      const hasOffset = Boolean(exifRaw.offsetText) || (typeof exifRaw.capturedAtIso === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(exifRaw.capturedAtIso));
      const capturedForMatch = !hasOffset && exifRaw.capturedAtRaw
        ? exifRaw.capturedAtRaw
        : (row.exif_captured_at || exifRaw.capturedAtIso || exifRaw.capturedAtRaw || null);
      const assignment = resolveMediaDayAssignment({
        capturedAt: capturedForMatch,
        offsetText: exifRaw.offsetText || null,
        vacationTimeZone: timeZone,
        dayDates,
        thingRef: row.target_thing_ref || null,
      });
      const alreadyCounted = row.upload_status === 'finalized' || row.upload_status === 'published';
      await db`
        update vacation_mcp_draft_media
        set change_set_id = ${effectiveChangeSetId},
          upload_status = 'finalized',
          assigned_day_date = ${assignment.dayDate},
          assigned_day_number = ${assignment.dayNumber},
          assignment_bucket = ${assignment.bucket},
          updated_at = now()
        where id = ${mediaId}
      `;
      if (!alreadyCounted) {
        latestUsage = await recordVacationMediaUsage(db, {
          tripId: tokenRecord.tripId,
          bytesDelta: Number(row.actual_bytes || 0),
          countDelta: 1,
        });
      }
      finalized.push({
        media_id: String(row.id),
        filename: String(row.filename),
        bytes: Number(row.actual_bytes || 0),
        assignment_bucket: assignment.bucket,
        assigned_day_date: assignment.dayDate,
        assigned_day_number: assignment.dayNumber,
        exif_captured_at: row.exif_captured_at || null,
        exif_lat: row.exif_lat ?? null,
        exif_lng: row.exif_lng ?? null,
        timezone_used: timeZone,
      });
    }
    return { ok: true, action: 'finalize', finalized, vacation_media_usage: latestUsage };
  }

  const files = asArray(args.files);
  if (!files.length) {
    throw Object.assign(new Error('files array with filename and mime_type is required.'), { statusCode: 400, code: 'missing_files' });
  }
  const uploads = [];
  for (const file of files) {
    const filename = cleanText(file?.filename, 240);
    const mimeType = cleanText(file?.mime_type, 120);
    if (!filename || !mimeType) {
      throw Object.assign(new Error('Each file requires filename and mime_type.'), { statusCode: 400, code: 'invalid_file_descriptor' });
    }
    const mediaKind = file?.media_kind === 'video' || mimeType.startsWith('video/') ? 'video' : 'photo';
    const placeholderHash = `pending:${Date.now()}:${Math.random()}`;
    const inserted = await db`
      insert into vacation_mcp_draft_media (
        scope_trip_id, change_set_id, filename, mime_type, media_kind,
        expected_bytes, upload_status, upload_token_hash, upload_expires_at,
        caption, target_thing_ref
      ) values (
        ${tokenRecord.tripId}, ${changeSetId}, ${filename}, ${mimeType}, ${mediaKind},
        ${Number.isInteger(file?.size_bytes) ? file.size_bytes : null},
        'signed', ${placeholderHash}, ${new Date(now().getTime() + ttlSeconds * 1000).toISOString()},
        ${cleanText(file?.caption, 400) || null},
        ${cleanText(file?.thing_ref, 120) || null}
      )
      returning id
    `;
    const mediaId = String(inserted[0].id);
    const signed = signMediaUploadUrl({ mediaId, tripId: tokenRecord.tripId, baseUrl, ttlSeconds, now, env });
    await db`
      update vacation_mcp_draft_media
      set upload_token_hash = ${signed.uploadTokenHash},
        upload_expires_at = ${signed.expiresAt},
        updated_at = now()
      where id = ${mediaId}
    `;
    uploads.push({
      media_id: mediaId,
      filename,
      mime_type: mimeType,
      media_kind: mediaKind,
      method: 'PUT',
      upload_url: signed.uploadUrl,
      expires_at: signed.expiresAt,
      headers: { 'content-type': mimeType },
    });
  }
  return {
    ok: true,
    action: 'request_upload',
    uploads,
    next_step: 'PUT each file binary directly to its upload_url, then call upload_media with action="finalize" and the media_ids.',
  };
}

export async function receiveSignedMediaUpload(db, {
  mediaId,
  exp,
  sig,
  buffer,
  contentType = '',
  now = () => new Date(),
  env = process.env,
}) {
  await ensureVacationMcpSchema(db);
  const rows = await db`select * from vacation_mcp_draft_media where id = ${mediaId} limit 1`;
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Media upload slot not found.'), { statusCode: 404, code: 'media_not_found' });
  const verified = verifyMediaUploadSignature({
    mediaId: String(row.id),
    tripId: String(row.scope_trip_id),
    exp,
    sig,
    now,
    env,
  });
  if (!verified.ok) {
    if (verified.code === 'upload_url_expired') {
      await db`update vacation_mcp_draft_media set upload_status = 'expired', updated_at = now() where id = ${row.id}`;
    }
    throw Object.assign(new Error(verified.error), { statusCode: verified.statusCode, code: verified.code });
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error('Uploaded media body cannot be empty.'), { statusCode: 400, code: 'empty_media_body' });
  }
  const mimeType = cleanText(contentType, 120) || String(row.mime_type || 'application/octet-stream');
  const exif = extractExifFromBuffer(buffer);
  const pathname = `mcp-vacation-media/${row.scope_trip_id}/${row.id}-${cleanText(row.filename, 80).replace(/[^A-Za-z0-9._-]/g, '_')}`;
  const blob = await putMediaBlob(buffer, { pathname, contentType: mimeType, env });
  const publicUrl = blob?.url || `/api/mcp/media/${encodeURIComponent(String(row.id))}`;
  const storageProvider = blob?.url ? 'vercel_blob' : 'neon';
  const storedBytes = blob?.url ? null : buffer;
  await db`
    update vacation_mcp_draft_media
    set actual_bytes = ${buffer.length},
      mime_type = ${mimeType},
      upload_status = 'uploaded',
      storage_provider = ${storageProvider},
      storage_pathname = ${blob?.pathname || pathname},
      public_url = ${publicUrl},
      exif_captured_at = ${exif.capturedAtIso},
      exif_lat = ${exif.lat},
      exif_lng = ${exif.lng},
      exif_raw = ${exif},
      file_bytes = ${storedBytes},
      updated_at = now()
    where id = ${row.id}
  `;
  return {
    ok: true,
    media_id: String(row.id),
    bytes: buffer.length,
    upload_status: 'uploaded',
    exif_detected: exif.hasExif,
    exif_captured_at: exif.capturedAtIso,
  };
}
