

const JUNK_RE = /bind[- ]?proof|neon file bind proof|placeholder|1024.?1024|default[-_]?thumb/i;

function text(value) {
  return String(value ?? '').trim();
}

function mediaBlob(row = {}) {
  return [
    row.filename,
    row.originalName,
    row.original_name,
    row.caption,
    row.url,
    row.publicUrl,
    row.public_url,
    row.id,
  ]
    .map((value) => String(value || ''))
    .join(' ');
}

export function isKeepsakeJunkMedia(row = {}) {
  return JUNK_RE.test(mediaBlob(row));
}

function sniffVideo(row = {}) {
  const mime = text(row.mimeType || row.mime_type);
  const url = text(row.publicUrl || row.public_url || row.url);
  if (/^video\//i.test(mime)) return true;
  return /\.(mp4|mov|webm)(\?|#|$)/i.test(url);
}

export function isPhotoMedia(row = {}) {
  if (sniffVideo(row)) return false;
  const mime = text(row.mimeType || row.mime_type);
  const url = text(row.publicUrl || row.public_url || row.url);
  if (/^image\//i.test(mime)) return true;
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url);
}

export function isVideoMedia(row = {}) {
  return sniffVideo(row);
}

export function mediaPrintSrc(row = {}) {
  return text(
    row.printDataUrl ||
      row.print_data_url ||
      row.url ||
      row.publicUrl ||
      row.public_url ||
      row.thumbnailUrl ||
      row.thumbnail_url,
  );
}

export function normalizeMediaRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row === 'object' && !isKeepsakeJunkMedia(row));
}

export function boundMediaForPlace(place) {
  const bound = normalizeMediaRows(place.bound_media);
  if (bound.length) return bound;
  return normalizeMediaRows([
    ...(Array.isArray(place.media) ? place.media : []),
    ...(Array.isArray(place.photos) ? place.photos : []),
  ]);
}

export function savedStoryFlagActive(place = {}, override = {}) {
  if (override.savedStory === true || override.isSavedStory === true) return true;
  const raw = override.story ?? place.story ?? place.saved_story ?? place.savedStory;
  if (raw === true) return true;
  if (typeof raw === 'string' && raw.trim()) return true;
  return false;
}

export function qrSvgUrl(payload) {
  const value = text(payload);
  if (!value) return '';
  return `/api/pdf/qr.svg?url=${encodeURIComponent(value)}`;
}
