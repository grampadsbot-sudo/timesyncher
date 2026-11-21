export function changeSetStatusLabel(status) {
  if (status === 'pending_approval') return 'Pending approval';
  if (status === 'approved') return 'Approved';
  if (status === 'declined') return 'Declined';
  return 'Draft';
}

export function changeSetKindLabel(kind) {
  return kind === 'targeted_edit' ? 'Targeted vacation edit' : 'Vacation draft import';
}

export function formatMediaBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMediaMatchLabel(media) {
  const parts = [];
  const dayDate = media?.attached_day_date || media?.assigned_day_date || null;
  const dayNumber = media?.attached_day_number ?? media?.assigned_day_number ?? null;
  if (dayDate) {
    parts.push(`Day ${dayNumber || ''} (${dayDate})`.replace('Day  ', 'Day '));
  }
  if (media?.attached_thing_title) {
    const scope = media.attached_thing_scheduled === false ? 'unscheduled' : 'item';
    parts.push(`${media.attached_thing_title} (${scope})`);
  }
  if (!parts.length) parts.push('Unassigned');
  const exif = media?.exif_match || {};
  const matchNotes = [];
  if (exif.time_matched) matchNotes.push('EXIF time');
  if (exif.gps_matched) {
    const dist = Number.isFinite(Number(exif.gps_distance_meters)) ? ` ${exif.gps_distance_meters}m` : '';
    matchNotes.push(`EXIF GPS${dist}`);
  }
  if (matchNotes.length) parts.push(matchNotes.join(' + '));
  return parts.join(' · ');
}

function normalizePreviewMediaEntry(media) {
  if (!media || typeof media !== 'object') return null;
  const mediaId = String(media.media_id || media.id || '').trim();
  const mime = String(media.mime_type || media.mimeType || '').trim();
  const url = String(media.url || media.preview_url || media.public_url || '').trim()
    || (mediaId ? `/api/mcp/media/${encodeURIComponent(mediaId)}` : '');
  const isVideo = String(media.media_kind || media.kind || '').toLowerCase() === 'video'
    || mime.toLowerCase().startsWith('video/')
    || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url);
  const posterUrl = String(media.poster_url || media.posterUrl || media.thumbnail_url || '').trim();
  return {
    ...media,
    media_id: mediaId || url,
    media_kind: isVideo ? 'video' : 'photo',
    mime_type: mime || (isVideo ? 'video/mp4' : 'image/jpeg'),
    url,
    preview_url: url,
    ...(posterUrl && posterUrl !== url ? { poster_url: posterUrl } : {}),
  };
}

function isDayOnlyMediaEntry(media) {
  if (!media || typeof media !== 'object') return false;
  if (media.attached_thing_ref || media.target_thing_ref || media.attached_thing_title) return false;
  if (media.assignment_bucket === 'thing') return false;
  return Boolean(media.attached_day_date || media.assigned_day_date || media.attached_day_number || media.assigned_day_number || media.assignment_bucket === 'day');
}

function isSkippedMediaEntry(media) {
  if (!media || typeof media !== 'object') return false;
  if (media.assignment_bucket === 'unassigned') return true;
  return !media.attached_thing_ref
    && !media.target_thing_ref
    && !media.attached_thing_title
    && !media.attached_day_date
    && !media.assigned_day_date;
}

function formatSkippedMediaNote(items) {
  const count = items.length;
  if (!count) return '';
  const hasPhoto = items.some((m) => String(m.media_kind || 'photo').toLowerCase() !== 'video');
  const hasVideo = items.some((m) => String(m.media_kind || 'photo').toLowerCase() === 'video');
  if (count === 1) {
    return hasVideo
      ? "This video doesn't have a date during this vacation, so it won't be imported."
      : "This photo doesn't have a date during this vacation, so it won't be imported.";
  }
  const noun = hasPhoto && hasVideo ? 'photos and videos' : (hasVideo ? 'videos' : 'photos');
  return `These ${count} ${noun} don't have a date during this vacation, so they won't be imported.`;
}

export function extractApprovalPreviewView(changeSet) {
  const preview = changeSet?.preview || {};
  const rawDays = Array.isArray(preview.days)
    ? preview.days
    : (Array.isArray(preview.will_create?.days) ? preview.will_create.days : []);
  const rawUnscheduled = Array.isArray(preview.unscheduled_things)
    ? preview.unscheduled_things
    : (Array.isArray(preview.will_create?.unscheduled_things) ? preview.will_create.unscheduled_things : []);
  const rawMedia = Array.isArray(preview.media)
    ? preview.media
    : (Array.isArray(preview.will_create?.media)
      ? preview.will_create.media
      : (Array.isArray(preview.will_attach_media) ? preview.will_attach_media : []));
  const media = rawMedia.map(normalizePreviewMediaEntry).filter(Boolean);
  const days = rawDays.map((day) => {
    const items = Array.isArray(day?.items)
      ? day.items.map((item) => ({
        ...item,
        media: (Array.isArray(item?.media) ? item.media : []).map(normalizePreviewMediaEntry).filter(Boolean),
      }))
      : [];
    const rawDayOnly = Array.isArray(day?.day_media)
      ? day.day_media
      : (Array.isArray(day?.media) ? day.media.filter(isDayOnlyMediaEntry) : []);
    return {
      ...day,
      items,
      day_media: rawDayOnly.map(normalizePreviewMediaEntry).filter(Boolean),
    };
  });
  const unscheduledThings = rawUnscheduled.map((item) => ({
    ...item,
    media: (Array.isArray(item?.media) ? item.media : []).map(normalizePreviewMediaEntry).filter(Boolean),
  }));
  const rawSkipped = Array.isArray(preview.skipped_media)
    ? preview.skipped_media
    : media.filter(isSkippedMediaEntry);
  const skippedMedia = rawSkipped.map(normalizePreviewMediaEntry).filter(Boolean);
  const skippedMediaNote = String(preview.skipped_media_note || '').trim() || formatSkippedMediaNote(skippedMedia);
  const totalBytes = Number.isFinite(Number(preview.total_bytes))
    ? Number(preview.total_bytes)
    : media.reduce((sum, item) => sum + Number(item?.bytes || 0), 0);
  const previewHash = String(preview.preview_hash || changeSet?.previewHash || '');
  const previewVersion = Math.max(1, Number(preview.preview_version || changeSet?.previewVersion || 1));
  const lastChanges = Array.isArray(preview.last_changes) ? preview.last_changes.filter(Boolean) : [];
  const rawRequests = Array.isArray(preview.change_requests)
    ? preview.change_requests
    : (Array.isArray(changeSet?.changeRequests) ? changeSet.changeRequests : []);
  const changeRequests = rawRequests.filter((entry) => entry && typeof entry === 'object' && String(entry.note || '').trim());
  return {
    previewVersion,
    previewHash,
    days,
    unscheduledThings,
    media,
    skippedMedia,
    skippedMediaNote,
    lastChanges,
    changeRequests,
    totalBytes,
  };
}

const PREVIEW_CATEGORY_ICONS = {
  flight: '✈️',
  hotel: '🏨',
  car: '🚗',
  restaurant: '🍽️',
  bar: '🍸',
  store: '🛍️',
  sightseeing: '🏞️',
  tour: '🧭',
  attraction: '🎟️',
  music: '🎵',
  theatre: '🎭',
  workout: '🏃',
  tickets: '🎫',
  family_event: '👨‍👩‍👧‍👦',
  artist: '🎨',
  transport: '🚆',
  event: '🎉',
  note: '📝',
  activity: '📍',
};

export function previewCategoryIcon(category) {
  const key = String(category || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PREVIEW_CATEGORY_ICONS[key] || '📍';
}

export function formatPreviewDayDate(iso) {
  const trimmed = String(iso || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)
    : Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return trimmed;
  return new Date(parsed).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatPreviewClock(value) {
  const raw = String(value || '').trim().replace(/(\d{1,2}:\d{2}):\d{2}/g, '$1');
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function previewSummaryChips(changeSet) {
  const preview = changeSet?.preview || {};
  const chips = [];
  if (preview.kind === 'targeted_edit') {
    for (const item of preview.will_add || []) {
      const tag = item.scheduled === false ? ' · saved for later' : '';
      chips.push(`Add ${item.title || 'Untitled'}${tag}`);
    }
    for (const item of preview.will_update || []) {
      chips.push(`Update ${item.current_title || item.item_id}`);
    }
    for (const item of preview.will_remove || []) {
      chips.push(`Remove ${item.title || item.item_id}`);
    }
    for (const day of preview.day_updates || []) {
      chips.push(`Update ${formatPreviewDayDate(day.day_date) || 'day'}`);
    }
    const attachMedia = Array.isArray(preview.will_attach_media) ? preview.will_attach_media : [];
    if (attachMedia.length > 0) {
      chips.push(`${attachMedia.length} ${attachMedia.length === 1 ? 'photo or video' : 'photos & videos'}`);
    }
    return chips;
  }
  const willCreate = preview.will_create || {};
  const sectionLabels = [
    ['days', 'day', 'days'],
    ['flights', 'flight', 'flights'],
    ['hotels', 'hotel', 'hotels'],
    ['cars', 'car', 'cars'],
    ['restaurants', 'restaurant', 'restaurants'],
    ['stores', 'store', 'stores'],
    ['things_to_do', 'activity', 'activities'],
    ['notes', 'note', 'notes'],
    ['unscheduled_things', 'saved for later', 'saved for later'],
    ['media', 'photo or video', 'photos & videos'],
  ];
  for (const [key, singular, plural] of sectionLabels) {
    const items = Array.isArray(willCreate[key]) ? willCreate[key] : [];
    if (items.length > 0) chips.push(`${items.length} ${items.length === 1 ? singular : plural}`);
  }
  return chips;
}

export function previewSummaryBullets(changeSet) {
  const preview = changeSet?.preview || {};
  const lines = [];
  if (preview.kind === 'targeted_edit') {
    for (const item of preview.will_add || []) {
      const tag = item.scheduled === false ? ' (saved for later)' : '';
      lines.push(`Add ${item.title || 'Untitled'}${tag}`);
    }
    for (const item of preview.will_update || []) {
      const fields = Array.isArray(item.changed_fields) ? item.changed_fields.join(', ') : '';
      lines.push(`Update ${item.current_title || item.item_id}${fields ? ` (${fields})` : ''}`);
    }
    for (const item of preview.will_remove || []) {
      lines.push(`Remove ${item.title || item.item_id}`);
    }
    for (const day of preview.day_updates || []) {
      lines.push(`Update ${formatPreviewDayDate(day.day_date) || 'day'}`);
    }
    const attachMedia = Array.isArray(preview.will_attach_media) ? preview.will_attach_media : [];
    if (attachMedia.length > 0) {
      lines.push(`Photos & videos: ${attachMedia.length}`);
    }
    return lines;
  }
  const willCreate = preview.will_create || {};
  if (willCreate.vacation?.title) {
    lines.push(`Vacation: ${willCreate.vacation.title}${willCreate.vacation.destination ? ` — ${willCreate.vacation.destination}` : ''}`);
  }
  const sectionLabels = [
    ['days', 'Days'],
    ['flights', 'Flights'],
    ['hotels', 'Hotels'],
    ['cars', 'Cars'],
    ['restaurants', 'Restaurants'],
    ['stores', 'Stores'],
    ['things_to_do', 'Activities'],
    ['notes', 'Notes'],
    ['unscheduled_things', 'Saved for later'],
    ['media', 'Photos & videos'],
  ];
  for (const [key, label] of sectionLabels) {
    const items = Array.isArray(willCreate[key]) ? willCreate[key] : [];
    if (items.length > 0) lines.push(`${label}: ${items.length}`);
  }
  return lines;
}

export function sortChangeSetsForReview(changes) {
  const list = Array.isArray(changes) ? [...changes] : [];
  const rank = { pending_approval: 0, draft: 1, approved: 2, declined: 3 };
  return list.sort((a, b) => {
    const left = rank[a?.status] ?? 9;
    const right = rank[b?.status] ?? 9;
    if (left !== right) return left - right;
    return String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''));
  });
}

export function reservationConnectionModeLabel(connection) {
  if (connection?.modeLabel) return String(connection.modeLabel);
  if (connection?.mode === 'webhook') return 'Webhook (automatic ping)';
  if (connection?.mode === 'polling') {
    const mins = Math.max(1, Math.round(Number(connection?.pollIntervalMinutes) || 5));
    return `Scheduled polling (every ${mins} min)`;
  }
  if (connection?.mode === 'manual') return 'Manual check';
  return 'Waiting for handshake';
}

export function formatReservationCreatedDate(iso) {
  const value = String(iso || '').trim().slice(0, 10);
  return value ? `Created ${value}` : '';
}
