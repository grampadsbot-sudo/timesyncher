import crypto from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

import { cleanText } from './http.mjs';

export const TREK_SHARED_API_BASE = 'https://travel.timesyncher.com';
export const VACATION3_SHARE_TOKEN = 'las-vegas-vacation-3';

export const FILENAME_THING_HINTS = [
  [/carbone/i, 'Carbone'],
  [/shake/i, 'Shake Shack'],
  [/lotus/i, 'Lotus of Siam'],
  [/eggslut/i, 'Eggslut'],
  [/cosmo|shop/i, 'Cosmopolitan shops'],
  [/conservatory|bellagio.*cocktail|anniversary cocktail/i, 'Bellagio Conservatory'],
  [/bellagio|lodging|hotel|fountain/i, 'Bellagio'],
  [/boarding|sfo.*las|outbound|depart/i, 'SFO to LAS'],
  [/las.*sfo|return|inbound/i, 'LAS to SFO'],
];

export const THINGS_NOT_ON_VACATION3 = [
  { pattern: /high.?roller/i, name: 'High Roller' },
  { pattern: /\bsphere\b/i, name: 'Sphere' },
  { pattern: /cirque/i, name: 'Cirque O' },
];

export const SCT_VACATION3_MEDIA_DIR = '/workspace/sct-runs/story-draft-20260907/media';

export const SCT_VACATION3_MEDIA_PACK = [
  {
    file: 'boarding-passes-photo.jpg',
    action: 'bind',
    targets: [
      { thingId: 8877, thingName: 'SFO to LAS' },
      { thingId: 8878, thingName: 'LAS to SFO' },
    ],
  },
  {
    file: 'carbone-late-hands-photo.jpg',
    action: 'bind',
    targets: [{ thingId: 8872, thingName: 'Carbone' }],
  },
  {
    file: 'carbone-plates-photo.jpg',
    action: 'bind',
    targets: [{ thingId: 8872, thingName: 'Carbone' }],
  },
  {
    file: 'cirque-program-photo.jpg',
    action: 'skip',
    skipName: 'Cirque O',
    skipReason: 'Cirque O is not on trip 197',
  },
  {
    file: 'conservatory-photo.jpg',
    action: 'bind',
    targets: [{ thingId: 8871, thingName: 'Bellagio Conservatory' }],
  },
  {
    file: 'eggslut-sandwich-photo.jpg',
    action: 'bind',
    targets: [{ thingId: 8875, thingName: 'Eggslut' }],
  },
  {
    file: 'high-roller-photo-01.jpg',
    action: 'skip',
    skipName: 'High Roller',
    skipReason: 'High Roller is not on trip 197',
  },
  {
    file: 'high-roller-photo-02.jpg',
    action: 'skip',
    skipName: 'High Roller',
    skipReason: 'High Roller is not on trip 197',
  },
  {
    file: 'high-roller-photo-03.jpg',
    action: 'skip',
    skipName: 'High Roller',
    skipReason: 'High Roller is not on trip 197',
  },
  {
    file: 'shake-shack-fries-photo.jpg',
    action: 'bind',
    targets: [{ thingId: 8873, thingName: 'Shake Shack' }],
  },
  {
    file: 'sphere-late-photo-01.jpg',
    action: 'skip',
    skipName: 'Sphere',
    skipReason: 'Sphere is not on trip 197',
  },
  {
    file: 'sphere-late-photo-02.jpg',
    action: 'skip',
    skipName: 'Sphere',
    skipReason: 'Sphere is not on trip 197',
  },
  {
    file: 'bellagio-fountain-late-video.mp4',
    action: 'bind',
    targets: [{ thingId: 8869, thingName: 'Bellagio' }],
  },
  {
    file: 'bellagio-fountain-night-video.mp4',
    action: 'bind',
    targets: [{ thingId: 8869, thingName: 'Bellagio' }],
  },
  {
    file: 'sphere-led-video.mp4',
    action: 'skip',
    skipName: 'Sphere',
    skipReason: 'Sphere is not on trip 197',
  },
];

function basenameLower(filename = '') {
  return String(filename || '').split('/').pop().trim().toLowerCase();
}

export function mapVacation3SctMediaFile(filename = '') {
  const file = basenameLower(filename);
  const exact = SCT_VACATION3_MEDIA_PACK.find((row) => row.file === file);
  if (exact) {
    return {
      file,
      action: exact.action,
      targets: exact.targets ? exact.targets.map((target) => ({ ...target })) : [],
      skipName: exact.skipName || '',
      skipReason: exact.skipReason || '',
      exact: true,
    };
  }
  const guessed = guessThingNameFromFilename(file);
  if (guessed.missing) {
    return {
      file,
      action: 'skip',
      targets: [],
      skipName: guessed.thingName,
      skipReason: `${guessed.thingName} is not on trip 197`,
      exact: false,
    };
  }
  if (guessed.thingName) {
    return {
      file,
      action: 'bind',
      targets: [{ thingId: 0, thingName: guessed.thingName }],
      skipName: '',
      skipReason: '',
      exact: false,
    };
  }
  return {
    file,
    action: 'unknown',
    targets: [],
    skipName: '',
    skipReason: 'No Thing mapping for this filename',
    exact: false,
  };
}

function text(value, max = 240) {
  return cleanText(value, max);
}

function normalize(value) {
  return text(value, 400).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function guessThingNameFromFilename(filename = '') {
  const base = String(filename || '').split('/').pop() || '';
  for (const missing of THINGS_NOT_ON_VACATION3) {
    if (missing.pattern.test(base)) {
      return { thingName: missing.name, missing: true };
    }
  }
  for (const [pattern, thingName] of FILENAME_THING_HINTS) {
    if (pattern.test(base)) return { thingName, missing: false };
  }
  return { thingName: '', missing: false };
}

export function thingDisplayName(place = {}, override = {}) {
  return text(override.title || place.name || place.title, 200);
}

export function listSharedThings(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places : [];
  const overrides = shared.thingOverrides && typeof shared.thingOverrides === 'object' ? shared.thingOverrides : {};
  const assignments = shared.assignments && typeof shared.assignments === 'object' ? shared.assignments : {};
  const days = Array.isArray(shared.days) ? shared.days : [];
  const dayById = new Map(days.map((day) => [String(day.id), day]));
  const dayForPlace = new Map();
  for (const [dayId, rows] of Object.entries(assignments)) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const placeId = Number(row?.place?.id || row?.place_id || 0);
      if (!placeId || dayForPlace.has(placeId)) continue;
      dayForPlace.set(placeId, {
        dayId: Number(dayId),
        dayNumber: Number(dayById.get(String(dayId))?.day_number || 0) || null,
      });
    }
  }
  return places.map((place) => {
    const override = overrides[`place:${place.id}`] || {};
    const day = dayForPlace.get(Number(place.id)) || {};
    return {
      thingId: Number(place.id),
      trekTripId: Number(place.trip_id || shared.trip?.id || 0) || null,
      name: thingDisplayName(place, override),
      originalName: text(place.name, 200),
      categoryName: text(place.category_name || override.category, 80),
      dayId: day.dayId || null,
      dayNumber: day.dayNumber || null,
      imageUrl: text(place.image_url || override.logoUrl || override.iconUrl, 500),
    };
  });
}

export function resolveThingFromShared(shared, { thingId, thingName } = {}) {
  const things = listSharedThings(shared);
  const id = Number(thingId || 0);
  if (id) {
    const hit = things.find((thing) => thing.thingId === id);
    if (hit) return hit;
    throw Object.assign(new Error(`No Thing with id ${id} on this share token.`), { statusCode: 404 });
  }
  const needle = normalize(thingName);
  if (!needle) throw Object.assign(new Error('thingName or thingId is required.'), { statusCode: 400 });
  const scored = things
    .map((thing) => {
      const hay = normalize(`${thing.name} ${thing.originalName}`);
      let score = 0;
      if (hay === needle) score = 100;
      else if (hay.includes(needle) || needle.includes(hay)) score = 80;
      else if (needle.split(' ').filter((token) => token.length >= 3).every((token) => hay.includes(token))) score = 60;
      return { thing, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) {
    throw Object.assign(new Error(`No Thing named "${thingName}" on this share token.`), { statusCode: 404 });
  }
  return scored[0].thing;
}

export function publicBindingPath(shareToken, filename) {
  const token = encodeURIComponent(text(shareToken, 180));
  const file = text(filename, 180).replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `/ts-thing-media/${token}/${file}`;
}

export function toPublicBinding(row = {}) {
  return {
    id: row.id,
    shareToken: row.shareToken || row.share_token,
    trekTripId: Number(row.trekTripId || row.trek_trip_id || 0) || null,
    thingId: Number(row.thingId || row.trek_place_id || row.place_id || 0) || null,
    thingName: row.thingName || row.thing_name || '',
    dayId: Number(row.dayId || row.trek_day_id || 0) || null,
    dayNumber: Number(row.dayNumber || row.day_number || 0) || null,
    caption: row.caption || '',
    mediaKind: row.mediaKind || row.media_kind || 'photo',
    mimeType: row.mimeType || row.mime_type || 'image/jpeg',
    originalName: row.originalName || row.original_name || '',
    fileSizeBytes: Number(row.fileSizeBytes || row.file_size_bytes || 0) || null,
    publicUrl: row.publicUrl || row.public_url || row.url || '',
    storageProvider: row.storageProvider || row.storage_provider || 'url',
    trekApplyStatus: row.trekApplyStatus || row.trek_apply_status || 'pending',
    createdAt: row.createdAt || row.created_at || null,
  };
}

export function mergeBindingsIntoShared(shared = {}, bindings = []) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    media: Array.isArray(shared.media) ? [...shared.media] : [],
  };
  const byPlace = new Map();
  for (const raw of bindings) {
    const binding = toPublicBinding(raw);
    if (!binding.thingId || !binding.publicUrl) continue;
    const list = byPlace.get(binding.thingId) || [];
    list.push(binding);
    byPlace.set(binding.thingId, list);
    next.media.push({
      id: binding.id,
      trip_id: binding.trekTripId,
      place_id: binding.thingId,
      day_id: binding.dayId,
      filename: binding.originalName,
      original_name: binding.originalName,
      mime_type: binding.mimeType,
      caption: binding.caption || binding.thingName,
      url: binding.publicUrl,
      public_url: binding.publicUrl,
      thumbnail_url: binding.publicUrl,
      source: 'timesyncher-bind',
    });
  }
  for (const place of next.places) {
    const bound = byPlace.get(Number(place.id)) || [];
    if (!bound.length) continue;
    if (!place.image_url) place.image_url = bound[0].publicUrl;
    place.bound_media = bound;
  }
  return next;
}

export function newBindingId() {
  return crypto.randomUUID();
}

export function proofPngBuffer({ width = 480, height = 270, label = 'Carbone bind proof' } = {}) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const inBanner = y > height * 0.38 && y < height * 0.62;
      const r = inBanner ? 245 : 24;
      const g = inBanner ? 211 : 28;
      const b = inBanner ? 123 : 36;
      const offset = 1 + x * 3;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunks = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', Buffer.from(`Label\0${label}`)),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

export function mimeFromName(name = '', fallback = 'image/jpeg') {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

export function mediaKindFromMime(mime = '') {
  return String(mime || '').startsWith('video/') ? 'video' : 'photo';
}

export function neonRawMediaPath(shareToken, bindingId) {
  return `/api/bind-thing-media?shareToken=${encodeURIComponent(text(shareToken, 180))}&id=${encodeURIComponent(text(bindingId, 80))}&raw=1`;
}

export function chooseMediaStorage({
  bytes = null,
  sourceUrl = '',
  blobUrl = '',
  hasDatabase = false,
  origin = '',
  shareToken = '',
  bindingId = '',
} = {}) {
  if (blobUrl) {
    return { publicUrl: blobUrl, storageProvider: 'vercel-blob', storeBytes: false };
  }
  if (hasDatabase && bytes && bytes.length) {
    return {
      publicUrl: `${origin || ''}${neonRawMediaPath(shareToken, bindingId)}`,
      storageProvider: 'neon',
      storeBytes: true,
    };
  }
  if (sourceUrl) {
    return { publicUrl: sourceUrl, storageProvider: 'url', storeBytes: false };
  }
  if (bytes && bytes.length) {
    return { publicUrl: '', storageProvider: 'request', storeBytes: false, error: 'no-store' };
  }
  return { publicUrl: '', storageProvider: '', storeBytes: false, error: 'no-input' };
}
