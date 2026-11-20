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

export function previewSummaryBullets(changeSet) {
  const preview = changeSet?.preview || {};
  const lines = [];
  if (preview.kind === 'targeted_edit') {
    for (const item of preview.will_add || []) {
      lines.push(`Add ${item.category || 'item'}: ${item.title || 'Untitled'}`);
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
    ['things_to_do', 'Activities'],
    ['notes', 'Notes'],
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
