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

export function extractApprovalPreviewView(changeSet) {
  const preview = changeSet?.preview || {};
  const days = Array.isArray(preview.days)
    ? preview.days
    : (Array.isArray(preview.will_create?.days) ? preview.will_create.days : []);
  const unscheduledThings = Array.isArray(preview.unscheduled_things)
    ? preview.unscheduled_things
    : (Array.isArray(preview.will_create?.unscheduled_things) ? preview.will_create.unscheduled_things : []);
  const media = Array.isArray(preview.media)
    ? preview.media
    : (Array.isArray(preview.will_create?.media)
      ? preview.will_create.media
      : (Array.isArray(preview.will_attach_media) ? preview.will_attach_media : []));
  const totalBytes = Number.isFinite(Number(preview.total_bytes))
    ? Number(preview.total_bytes)
    : media.reduce((sum, item) => sum + Number(item?.bytes || 0), 0);
  const previewHash = String(preview.preview_hash || changeSet?.previewHash || '');
  return {
    previewHash,
    days,
    unscheduledThings,
    media,
    totalBytes,
  };
}

export function previewSummaryBullets(changeSet) {
  const preview = changeSet?.preview || {};
  const lines = [];
  if (preview.kind === 'targeted_edit') {
    for (const item of preview.will_add || []) {
      const tag = item.scheduled === false ? ' (unscheduled)' : '';
      lines.push(`Add ${item.category || 'item'}: ${item.title || 'Untitled'}${tag}`);
    }
    for (const item of preview.will_update || []) {
      const fields = Array.isArray(item.changed_fields) ? item.changed_fields.join(', ') : '';
      lines.push(`Update ${item.current_title || item.item_id}${fields ? ` (${fields})` : ''}`);
    }
    for (const item of preview.will_remove || []) {
      lines.push(`Remove ${item.category || 'item'}: ${item.title || item.item_id}`);
    }
    for (const day of preview.day_updates || []) {
      lines.push(`Update day ${day.day_date || ''}`);
    }
    for (const media of preview.will_attach_media || []) {
      lines.push(`Attach media: ${media.filename || media.media_id}`);
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
    ['unscheduled_things', 'Unscheduled long-list Things'],
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
