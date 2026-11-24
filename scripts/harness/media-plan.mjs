import { MEDIA_PLAN } from './roster.mjs';

const DEFAULT_PHOTO_BYTES = 3000000;
const DEFAULT_VIDEO_30S_BYTES = 65000000;
const GB = 1000 ** 3;
const DRY_ITEMS_PER_DAY = 3;

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

export function dryMediaLoad(story, env = process.env) {
  const days = Number(story?.roster?.length_days) || 1;
  return mediaLoad({ itineraryItems: days * DRY_ITEMS_PER_DAY, hasHotel: true, source: `estimate-dry (${DRY_ITEMS_PER_DAY} items/day)` }, env);
}
