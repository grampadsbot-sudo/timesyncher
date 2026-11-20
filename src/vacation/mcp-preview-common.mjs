import crypto from 'node:crypto';
import { resolveLocalCaptureDate } from './mcp-exif.mjs';

export function cleanPreviewText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

export function previewIsoDateOnly(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function previewDateRange(startDate, endDate) {
  const start = previewIsoDateOnly(startDate);
  const end = previewIsoDateOnly(endDate) || start;
  if (!start) return [];
  const dates = [];
  let cursor = start;
  while (cursor <= end && dates.length < 60) {
    dates.push(cursor);
    const next = new Date(`${cursor}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return dates;
}

export function previewList(value) {
  return Array.isArray(value) ? value : [];
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalValue(value[key]);
    }
    return out;
  }
  return value;
}

export function computePreviewHash(payload) {
  const serialized = JSON.stringify(canonicalValue(payload));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function findClosestGpsItem(lat, lng, items = [], maxMeters = 1000) {
  const latNum = finiteNumber(lat);
  const lngNum = finiteNumber(lng);
  if (latNum === null || lngNum === null) return null;
  let best = null;
  for (const item of items) {
    const itemLat = finiteNumber(item?.location?.lat);
    const itemLng = finiteNumber(item?.location?.lng);
    if (itemLat === null || itemLng === null) continue;
    const distance = haversineMeters(latNum, lngNum, itemLat, itemLng);
    if (distance <= maxMeters && (!best || distance < best.distance_meters)) {
      best = { item, distance_meters: distance };
    }
  }
  return best;
}

function normalizeLocation(raw) {
  const loc = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  const address = cleanPreviewText(loc.address, 240);
  if (address) out.address = address;
  const lat = finiteNumber(loc.lat);
  const lng = finiteNumber(loc.lng);
  if (lat !== null) out.lat = lat;
  if (lng !== null) out.lng = lng;
  return out;
}

export function normalizeDraftLandingItem(defaultCategory, rawItem, { forceUnscheduled = false, currency = 'usd', source = 'mcp_import' } = {}) {
  const title = cleanPreviewText(rawItem?.title, 240);
  if (!title) return null;
  const category = cleanPreviewText(rawItem?.category || defaultCategory, 60) || defaultCategory;
  const rawDayDate = previewIsoDateOnly(rawItem?.day_date || rawItem?.check_in || rawItem?.starts_at) || null;
  const unscheduled = Boolean(forceUnscheduled || rawItem?.unscheduled === true || !rawDayDate);
  const dayDate = unscheduled ? null : rawDayDate;
  const checkIn = unscheduled ? null : (previewIsoDateOnly(rawItem?.check_in) || null);
  const checkOut = unscheduled ? null : (previewIsoDateOnly(rawItem?.check_out) || null);
  return {
    ref: cleanPreviewText(rawItem?.ref, 120) || null,
    category,
    title,
    source: cleanPreviewText(rawItem?.source, 80) || source,
    description: cleanPreviewText(rawItem?.description || rawItem?.body || '', 4000) || null,
    scheduled: !unscheduled,
    day_date: dayDate,
    starts_at: unscheduled ? null : (rawItem?.starts_at || (dayDate ? `${dayDate}T12:00:00.000Z` : null)),
    ends_at: unscheduled ? null : (rawItem?.ends_at || (checkOut ? `${checkOut}T11:00:00.000Z` : null)),
    check_in: checkIn,
    check_out: checkOut,
    total_price_cents: Number.isInteger(rawItem?.total_price_cents) ? rawItem.total_price_cents : null,
    currency: cleanPreviewText(rawItem?.currency || currency || 'usd', 12) || 'usd',
    location: normalizeLocation(rawItem?.location),
    website: cleanPreviewText(rawItem?.website, 500) || null,
    notes: cleanPreviewText(rawItem?.notes, 1000) || null,
    airline: cleanPreviewText(rawItem?.airline, 120) || null,
    flight_number: cleanPreviewText(rawItem?.flight_number, 60) || null,
    departure_airport: cleanPreviewText(rawItem?.departure_airport, 24) || null,
    arrival_airport: cleanPreviewText(rawItem?.arrival_airport, 24) || null,
    confirmation_code: cleanPreviewText(rawItem?.confirmation_code, 80) || null,
    pickup_location: cleanPreviewText(rawItem?.pickup_location, 180) || null,
    dropoff_location: cleanPreviewText(rawItem?.dropoff_location, 180) || null,
  };
}

export function collectDraftLandingItems(draft) {
  const currency = cleanPreviewText(draft?.vacation?.currency, 12) || 'usd';
  const items = [];
  const pushSection = (list, defaultCategory, forceUnscheduled = false) => {
    for (const entry of previewList(list)) {
      const normalized = normalizeDraftLandingItem(defaultCategory, entry, { forceUnscheduled, currency });
      if (normalized) items.push(normalized);
    }
  };
  pushSection(draft?.flights, 'flight');
  pushSection(draft?.hotels, 'hotel');
  pushSection(draft?.cars, 'car');
  pushSection(draft?.restaurants, 'restaurant');
  pushSection(draft?.stores, 'store');
  pushSection(draft?.things_to_do, 'activity');
  pushSection(draft?.notes, 'note');
  pushSection(draft?.unscheduled_things, 'activity', true);
  return {
    allItems: items,
    scheduledItems: items.filter((item) => item.scheduled),
    unscheduledItems: items.filter((item) => !item.scheduled),
  };
}

export function buildPreviewMediaEntries({
  mediaRows = [],
  mediaLinksById = new Map(),
  items = [],
  days = [],
  vacationTimeZone = 'UTC',
}) {
  const itemByRef = new Map();
  for (const item of items) {
    if (item.ref) itemByRef.set(String(item.ref), item);
    if (item.id) itemByRef.set(String(item.id), item);
  }
  const dayNumberByDate = new Map(days.map((day, idx) => [previewIsoDateOnly(day.date), Number(day.day_number || idx + 1)]));
  const media = [];
  let totalBytes = 0;

  for (const row of previewList(mediaRows)) {
    const link = mediaLinksById.get(String(row.id)) || {};
    const bytes = Number(row.actual_bytes || row.expected_bytes || 0);
    totalBytes += bytes;
    const exifRaw = row.exif_raw && typeof row.exif_raw === 'object' ? row.exif_raw : {};
    const capturedAt = row.exif_captured_at || exifRaw.capturedAtIso || exifRaw.capturedAtRaw || null;
    const localCaptureDate = resolveLocalCaptureDate({
      capturedAt,
      offsetText: exifRaw.offsetText || null,
      vacationTimeZone,
    });
    const exifDayNumber = localCaptureDate && dayNumberByDate.has(localCaptureDate)
      ? dayNumberByDate.get(localCaptureDate)
      : null;
    const timeMatched = Boolean(localCaptureDate && exifDayNumber !== null);
    const gpsMatch = findClosestGpsItem(row.exif_lat, row.exif_lng, items);

    const explicitRef = cleanPreviewText(link.thing_ref || link.thing_id || row.target_thing_ref, 120) || null;
    const resolvedItem = (explicitRef ? itemByRef.get(explicitRef) : null) || gpsMatch?.item || null;
    const attachedThingRef = resolvedItem ? (resolvedItem.ref || resolvedItem.id || explicitRef) : explicitRef;
    const attachedThingTitle = resolvedItem ? resolvedItem.title : null;
    const attachedThingScheduled = resolvedItem ? Boolean(resolvedItem.scheduled) : null;

    const explicitDayDate = previewIsoDateOnly(link.day_date || row.assigned_day_date) || null;
    const attachedDayDate = explicitDayDate
      || (timeMatched ? localCaptureDate : null)
      || (resolvedItem?.scheduled ? resolvedItem.day_date : null);
    const attachedDayNumber = attachedDayDate
      ? (dayNumberByDate.get(attachedDayDate) ?? row.assigned_day_number ?? null)
      : null;
    const assignmentBucket = attachedThingRef ? 'thing' : (attachedDayDate ? 'day' : 'unassigned');

    const reasons = [];
    if (timeMatched) reasons.push('exif_time');
    if (gpsMatch) reasons.push('exif_gps');
    if (!reasons.length && (explicitRef || explicitDayDate)) reasons.push('manual');
    const matchReason = reasons.length ? reasons.join('+') : 'unassigned';

    media.push({
      media_id: String(row.id),
      filename: String(row.filename || ''),
      media_kind: String(row.media_kind || 'photo'),
      mime_type: String(row.mime_type || ''),
      bytes,
      upload_status: String(row.upload_status || 'signed'),
      assignment_bucket: assignmentBucket,
      assigned_day_date: attachedDayDate,
      assigned_day_number: attachedDayNumber,
      attached_day_date: attachedDayDate,
      attached_day_number: attachedDayNumber,
      target_thing_ref: attachedThingRef,
      attached_thing_ref: attachedThingRef,
      attached_thing_title: attachedThingTitle,
      attached_thing_scheduled: attachedThingScheduled,
      caption: link.caption ?? row.caption ?? null,
      exif_match: {
        captured_at: capturedAt,
        local_date: localCaptureDate || null,
        timezone: vacationTimeZone,
        time_matched: timeMatched,
        matched_day_date: timeMatched ? localCaptureDate : null,
        matched_day_number: timeMatched ? exifDayNumber : null,
        lat: finiteNumber(row.exif_lat),
        lng: finiteNumber(row.exif_lng),
        gps_matched: Boolean(gpsMatch),
        gps_distance_meters: gpsMatch ? gpsMatch.distance_meters : null,
        gps_matched_thing_ref: gpsMatch ? (gpsMatch.item.ref || gpsMatch.item.id || null) : null,
        gps_matched_thing_title: gpsMatch ? gpsMatch.item.title : null,
        match_reason: matchReason,
      },
    });
  }

  return { media, totalBytes };
}

function itemLandingShape(item, attachedMedia = []) {
  return {
    ...(item.id ? { id: String(item.id) } : {}),
    ref: item.ref || null,
    category: item.category,
    title: item.title,
    source: cleanPreviewText(item.source, 80) || 'mcp_import',
    description: item.description || null,
    scheduled: Boolean(item.scheduled),
    day_date: item.scheduled ? (item.day_date || null) : null,
    starts_at: item.scheduled ? (item.starts_at || null) : null,
    ends_at: item.scheduled ? (item.ends_at || null) : null,
    ...(item.check_in ? { check_in: item.check_in } : {}),
    ...(item.check_out ? { check_out: item.check_out } : {}),
    total_price_cents: Number.isInteger(item.total_price_cents) ? item.total_price_cents : null,
    currency: item.currency || 'usd',
    location: item.location || {},
    website: item.website || null,
    notes: item.notes || null,
    media: attachedMedia.map((m) => ({
      media_id: m.media_id,
      filename: m.filename,
      media_kind: m.media_kind,
      bytes: m.bytes,
      caption: m.caption,
      exif_match: m.exif_match,
    })),
  };
}

export function groupLandingDaysAndUnscheduled({ resolvedDays, scheduledItems, unscheduledItems, mediaEntries }) {
  const mediaByThingKey = new Map();
  const mediaByDayDate = new Map();
  for (const media of mediaEntries) {
    if (media.attached_thing_ref) {
      const list = mediaByThingKey.get(media.attached_thing_ref) || [];
      list.push(media);
      mediaByThingKey.set(media.attached_thing_ref, list);
    }
    if (media.attached_day_date) {
      const list = mediaByDayDate.get(media.attached_day_date) || [];
      list.push(media);
      mediaByDayDate.set(media.attached_day_date, list);
    }
  }

  const itemsByDay = new Map();
  const extraDayDates = [];
  const knownDayDates = new Set(resolvedDays.map((d) => previewIsoDateOnly(d.date)));
  for (const item of scheduledItems) {
    const key = previewIsoDateOnly(item.day_date);
    if (!key) continue;
    if (!knownDayDates.has(key) && !extraDayDates.includes(key)) extraDayDates.push(key);
    const list = itemsByDay.get(key) || [];
    const mediaKey = item.ref || item.id || null;
    list.push(itemLandingShape(item, mediaKey ? (mediaByThingKey.get(String(mediaKey)) || []) : []));
    itemsByDay.set(key, list);
  }

  const days = resolvedDays.map((day, idx) => {
    const date = previewIsoDateOnly(day.date);
    return {
      day_number: Number(day.day_number || idx + 1),
      date,
      title: cleanPreviewText(day.title, 180),
      notes: cleanPreviewText(day.notes, 1000),
      items: itemsByDay.get(date) || [],
      media: mediaByDayDate.get(date) || [],
    };
  });

  for (const date of extraDayDates.sort()) {
    days.push({
      day_number: days.length + 1,
      date,
      title: '',
      notes: '',
      items: itemsByDay.get(date) || [],
      media: mediaByDayDate.get(date) || [],
    });
  }

  const unscheduledThings = unscheduledItems.map((item) => {
    const mediaKey = item.ref || item.id || null;
    return itemLandingShape(item, mediaKey ? (mediaByThingKey.get(String(mediaKey)) || []) : []);
  });

  return { days, unscheduledThings };
}
