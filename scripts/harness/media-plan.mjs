// Media load per vacation under the 11/18 spec (see MEDIA_PLAN in roster.mjs), so Craig can price
// media (single vacation $10/5 GB, unlimited $17/10 GB, +$10 per 10 GB are proposals pending these
// numbers). Bytes per photo and per 30-second video are inputs, not facts: live runs measure the
// bytes the app stored; dry runs use the documented defaults below and are labelled "estimate".
import { MEDIA_PLAN } from './roster.mjs';

// Defaults: a phone JPEG/HEIC photo of ~3 MB and a 30-second 1080p phone clip of ~65 MB.
// Override with HARNESS_MEDIA_PHOTO_BYTES / HARNESS_MEDIA_VIDEO_30S_BYTES (numbers, not secrets).
export const DEFAULT_PHOTO_BYTES = 3000000;
export const DEFAULT_VIDEO_30S_BYTES = 65000000;
const GB = 1000 ** 3;

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function mediaBytes(env = process.env) {
  return {
    photo: positive(env.HARNESS_MEDIA_PHOTO_BYTES, DEFAULT_PHOTO_BYTES),
    video30: positive(env.HARNESS_MEDIA_VIDEO_30S_BYTES, DEFAULT_VIDEO_30S_BYTES),
  };
}

// itineraryItems: items on the itinerary (TBDs included). Hotel check-in and check-out are counted
// separately when the vacation has a hotel. Long-list items off the itinerary get no media.
export function mediaLoad({ itineraryItems, hasHotel = true, source = 'estimate' }, env = process.env) {
  const items = Math.max(0, Number(itineraryItems) || 0);
  const bytes = mediaBytes(env);
  const hotelRows = hasHotel ? [MEDIA_PLAN.hotel_check_in, MEDIA_PLAN.hotel_check_out] : [];
  const photos = items * MEDIA_PLAN.itinerary_item.photos + hotelRows.reduce((sum, row) => sum + row.photos, 0);
  const videos = items * MEDIA_PLAN.itinerary_item.videos + hotelRows.reduce((sum, row) => sum + row.videos, 0);
  const total = photos * bytes.photo + videos * bytes.video30;
  const perGbMonth = Number(env.HARNESS_STORAGE_DOLLARS_PER_GB_MONTH);
  const gb = total / GB;
  return {
    source,
    itinerary_items: items,
    hotel: hasHotel,
    photos,
    videos,
    video_seconds: videos * MEDIA_PLAN.itinerary_item.video_seconds,
    bytes: total,
    gb: Number(gb.toFixed(3)),
    storage_dollars_per_month: Number.isFinite(perGbMonth) && perGbMonth >= 0 ? Number((gb * perGbMonth).toFixed(4)) : null,
    storage_price_state: Number.isFinite(perGbMonth) && perGbMonth >= 0 ? 'priced' : 'unpriced (set HARNESS_STORAGE_DOLLARS_PER_GB_MONTH)',
    assumptions: `photo ${bytes.photo} B, 30 s video ${bytes.video30} B`,
  };
}

// Dry runs do not know the itinerary the app would build. The documented planning assumption is
// three itinerary items per vacation day; the result is labelled estimate-dry so nobody reads it as measured.
export const DRY_ITEMS_PER_DAY = 3;

export function dryMediaLoad(story, env = process.env) {
  const days = Number(story?.roster?.length_days) || 1;
  return mediaLoad({ itineraryItems: days * DRY_ITEMS_PER_DAY, hasHotel: true, source: `estimate-dry (${DRY_ITEMS_PER_DAY} items/day)` }, env);
}
