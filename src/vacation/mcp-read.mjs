import crypto from 'node:crypto';
import { cleanText } from './http.mjs';
import { intakeShareSlug, intId, tripIsoDay } from './intake-shared-trip.mjs';
import { inferVacationTimeZone } from './mcp-exif.mjs';
import { neonRawMediaPath } from './thing-media-bind.mjs';

export function isoDateOnly(value) {
  return tripIsoDay(value);
}

export function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function enumerateVacationDates(startDate, endDate) {
  const start = isoDateOnly(startDate);
  const end = isoDateOnly(endDate) || start;
  if (!start) return [];
  const out = [];
  let cursor = start;
  while (cursor <= end && out.length < 60) {
    out.push(cursor);
    const next = new Date(`${cursor}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return out;
}

export function vacationShareSlugForRow(tripRow) {
  const meta = asObject(tripRow?.metadata);
  const existing = cleanText(
    meta.publicSlug || meta.sharedToken || meta.shareToken || meta.slug || '',
    220,
  );
  if (existing) return existing;
  return intakeShareSlug(tripRow?.id) || String(tripRow?.id || '');
}

export async function publishMediaRow(db, {
  mediaRow,
  shareSlug,
  tripId,
  linkedThingId = null,
  linkedThingTitle = null,
  dayDate = null,
  dayNumber = null,
  caption = null,
}) {
  const effectiveCaption = cleanText(caption ?? mediaRow.caption, 400) || null;
  const effectiveDayDate = dayDate !== undefined
    ? (isoDateOnly(dayDate) || null)
    : (isoDateOnly(mediaRow.assigned_day_date) || null);
  const effectiveDayNumber = dayNumber !== undefined
    ? (dayNumber ?? null)
    : (mediaRow.assigned_day_number ?? null);
  const bucket = linkedThingId ? 'thing' : (effectiveDayDate ? 'day' : 'unassigned');
  const bindingId = crypto.randomUUID();
  const storedUrl = cleanText(mediaRow.public_url, 600);
  const publicUrl = (!storedUrl || storedUrl.startsWith('/api/mcp/media/') || mediaRow.storage_provider === 'neon')
    ? neonRawMediaPath(shareSlug, bindingId)
    : storedUrl;
  const meta = {
    source: 'mcp_import',
    mcpMediaId: String(mediaRow.id),
    tripId: String(tripId),
    thingId: linkedThingId ? String(linkedThingId) : null,
    assignedDayDate: effectiveDayDate,
    assignmentBucket: bucket,
    exifCapturedAt: mediaRow.exif_captured_at || null,
    exifLat: mediaRow.exif_lat ?? null,
    exifLng: mediaRow.exif_lng ?? null,
  };
  await db`
    insert into thing_media_bindings (
      id, share_token, trek_trip_id, trek_place_id, day_number, thing_name, caption,
      media_kind, mime_type, original_name, file_size_bytes, public_url,
      storage_provider, storage_pathname, trek_apply_status, metadata, file_bytes
    ) values (
      ${bindingId}, ${shareSlug}, ${intId(tripId)}, ${intId(linkedThingId || tripId)},
      ${effectiveDayNumber}, ${linkedThingTitle || null}, ${effectiveCaption},
      ${String(mediaRow.media_kind || 'photo')}, ${String(mediaRow.mime_type || 'application/octet-stream')},
      ${String(mediaRow.filename || 'media')}, ${Number(mediaRow.actual_bytes || 0)},
      ${publicUrl}, ${String(mediaRow.storage_provider || 'neon')},
      ${mediaRow.storage_pathname || null}, 'applied', ${meta}, ${mediaRow.file_bytes || null}
    )
  `;
  await db`
    update vacation_mcp_draft_media
    set upload_status = 'published',
      assigned_day_date = ${effectiveDayDate},
      assigned_day_number = ${effectiveDayNumber},
      assignment_bucket = ${bucket},
      caption = ${effectiveCaption},
      updated_at = now()
    where id = ${mediaRow.id}
  `;
  return {
    media_id: String(mediaRow.id),
    filename: String(mediaRow.filename || ''),
    public_url: publicUrl,
    bytes: Number(mediaRow.actual_bytes || 0),
    assignment_bucket: bucket,
    assigned_day_date: effectiveDayDate,
    assigned_day_number: effectiveDayNumber,
    thing_id: linkedThingId ? String(linkedThingId) : null,
  };
}

export async function recordVacationMediaUsage(db, { tripId, bytesDelta, countDelta = 1 }) {
  const bytes = Math.max(0, Number(bytesDelta) || 0);
  const count = Math.max(0, Number(countDelta) || 0);
  const rows = await db`
    insert into vacation_media_usage (trip_id, total_bytes, media_count, updated_at)
    values (${tripId}, ${bytes}, ${count}, now())
    on conflict (trip_id) do update set
      total_bytes = vacation_media_usage.total_bytes + excluded.total_bytes,
      media_count = vacation_media_usage.media_count + excluded.media_count,
      updated_at = now()
    returning trip_id, total_bytes, media_count
  `;
  return {
    vacation_id: String(rows[0]?.trip_id || tripId),
    total_bytes: Number(rows[0]?.total_bytes || bytes),
    media_count: Number(rows[0]?.media_count || count),
  };
}

export async function readLiveVacationDocument(db, tripId) {
  const tripRows = await db`
    select id, customer_id, title, destination, start_date, end_date, status, metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const trip = tripRows[0];
  if (!trip) return null;
  const meta = asObject(trip.metadata);
  const things = await db`
    select id, category, subtype, title, description, starts_at, ends_at,
      cost_estimate_cents, currency, location, links, ratings, metadata
    from trip_things
    where trip_id = ${tripId}
    order by created_at asc
  `;
  const shareSlug = vacationShareSlugForRow(trip);
  const bindings = await db`
    select id, day_number, thing_name, caption, media_kind, mime_type, original_name,
      file_size_bytes, public_url, metadata
    from thing_media_bindings
    where share_token = ${shareSlug}
    order by created_at asc
  `;
  const usageRows = await db`
    select total_bytes, media_count
    from vacation_media_usage
    where trip_id = ${tripId}
    limit 1
  `;

  const dayMeta = asObject(meta.dayMeta);
  const storedDays = asArray(meta.days);
  const dateList = enumerateVacationDates(trip.start_date, trip.end_date);
  const days = storedDays.length
    ? storedDays.map((day, idx) => {
      const date = isoDateOnly(day.date);
      const override = asObject(dayMeta[date]);
      return {
        day_number: Number(day.day_number || idx + 1),
        date,
        title: String(override.title ?? day.title ?? ''),
        notes: String(override.notes ?? day.notes ?? ''),
      };
    })
    : dateList.map((date, idx) => {
      const override = asObject(dayMeta[date]);
      return {
        day_number: idx + 1,
        date,
        title: String(override.title || ''),
        notes: String(override.notes || ''),
      };
    });

  const items = things.map((row) => {
    const rowMeta = asObject(row.metadata);
    const dayDate = rowMeta.unscheduled === true ? null : (isoDateOnly(rowMeta.dayDate || row.starts_at) || null);
    const scheduled = Boolean(dayDate) && rowMeta.unscheduled !== true && rowMeta.timeline !== false;
    return {
      id: String(row.id),
      category: String(row.category || 'note'),
      title: String(row.title || ''),
      description: row.description || '',
      day_date: dayDate,
      scheduled,
      starts_at: row.starts_at || null,
      ends_at: row.ends_at || null,
      total_price_cents: Number.isInteger(row.cost_estimate_cents) ? row.cost_estimate_cents : null,
      currency: String(row.currency || 'usd'),
      location: asObject(row.location),
      links: asArray(row.links),
      ratings: asObject(row.ratings),
      notes: asArray(rowMeta.notes),
      metadata: rowMeta,
    };
  });

  const inferredDates = [
    ...days.map((d) => isoDateOnly(d.date)),
    ...items.map((item) => isoDateOnly(item.day_date || item.starts_at)),
  ].filter(Boolean).sort();
  const resolvedStartDate = isoDateOnly(trip.start_date) || inferredDates[0] || null;
  const resolvedEndDate = isoDateOnly(trip.end_date) || inferredDates[inferredDates.length - 1] || resolvedStartDate || null;
  const resolvedTimeZone = inferVacationTimeZone({
    timezone: cleanText(meta.timezone || meta.timeZone || meta.ianaTimezone, 80),
    timezoneExplicit: meta.timezoneExplicit === true,
    destination: cleanText(trip.destination || trip.title, 180),
    points: items.map((item) => item.location).filter(Boolean),
  });

  return {
    vacation: {
      id: String(trip.id),
      title: String(trip.title || ''),
      destination: String(trip.destination || ''),
      start_date: resolvedStartDate,
      end_date: resolvedEndDate,
      timezone: resolvedTimeZone,
      currency: String(meta.currency || 'usd'),
      summary: String(meta.summary || ''),
      status: String(trip.status || 'active'),
      share_slug: shareSlug,
    },
    days,
    flights: items.filter((item) => item.category === 'flight'),
    hotels: items.filter((item) => item.category === 'hotel' || item.category === 'lodging'),
    cars: items.filter((item) => item.category === 'car'),
    restaurants: items.filter((item) => item.category === 'restaurant'),
    stores: items.filter((item) => item.category === 'store'),
    things_to_do: items.filter((item) => !['flight', 'hotel', 'lodging', 'car', 'restaurant', 'note'].includes(item.category)),
    notes: items.filter((item) => item.category === 'note'),
    unscheduled_things: items.filter((item) => !item.scheduled),
    long_list: items,
    media: bindings.map((row) => {
      const m = asObject(row.metadata);
      return {
        id: String(row.id),
        mcp_media_id: m.mcpMediaId || null,
        filename: String(row.original_name || ''),
        media_kind: String(row.media_kind || 'photo'),
        mime_type: String(row.mime_type || ''),
        bytes: Number(row.file_size_bytes || 0),
        public_url: String(row.public_url || ''),
        caption: row.caption || null,
        day_number: row.day_number ?? null,
        day_date: m.assignedDayDate || null,
        thing_id: m.thingId || null,
        assignment_bucket: m.assignmentBucket || 'unassigned',
      };
    }),
    media_usage: {
      total_bytes: Number(usageRows[0]?.total_bytes || 0),
      media_count: Number(usageRows[0]?.media_count || 0),
    },
  };
}
