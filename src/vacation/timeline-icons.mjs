const CATEGORY_ICONS = {
  flight: '✈️',
  hotel: '🧳',
  restaurant: '🍽️',
  store: '🛍️',
  shopping: '🛍️',
  car: '🚗',
  transport: '🚕',
  bar: '☕',
  cafe: '☕',
  event: '🎟️',
  tickets: '🎟️',
  tour: '🎟️',
  attraction: '🏛️',
  activity: '🎯',
  sightseeing: '🎟️',
  family_event: 'Family',
  music: '🎶',
  workout: '💪',
  artist: '🎨',
  theatre: '🎭',
  other: '📍',
};

const EMOJI_TO_TYPE = {
  '✈️': 'flight',
  '🏨': 'hotel',
  '🧳': 'hotel',
  '🛏️': 'hotel',
  '🍽️': 'restaurant',
  '🛍️': 'store',
  '🚌': 'transport',
  '🚕': 'transport',
  '🚗': 'car',
  '🏛️': 'attraction',
  '🎯': 'activity',
  '☕': 'bar',
  '🎟️': 'event',
  '📍': 'other',
};

const LUCIDE_TO_TYPE = {
  plane: 'flight',
  hotel: 'hotel',
  beddouble: 'hotel',
  utensils: 'restaurant',
  utensilscrossed: 'restaurant',
  shoppingbag: 'store',
  store: 'store',
  car: 'car',
  bus: 'transport',
  train: 'transport',
  mappin: 'attraction',
  landmark: 'attraction',
  users: 'family_event',
  ticket: 'event',
  coffee: 'bar',
};

function text(value) {
  return String(value || '').trim();
}

function haystack(thing = {}, extra = '') {
  return [
    thing.type,
    thing.category_name,
    thing.category?.name,
    thing.category_icon,
    thing.category?.icon,
    thing.title,
    thing.name,
    thing.notes,
    thing.description,
    thing.address,
    extra,
  ].map(text).join(' ');
}

export function normalizeThingType(raw) {
  const value = text(raw);
  if (!value) return '';
  if (EMOJI_TO_TYPE[value]) return EMOJI_TO_TYPE[value];
  const lower = value.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  const compact = lower.replace(/\s+/g, '');
  if (LUCIDE_TO_TYPE[compact]) return LUCIDE_TO_TYPE[compact];
  if (lower === 'other') return '';
  if (lower.includes('flight')) return 'flight';
  if (lower.includes('hotel') || lower.includes('lodging') || lower.includes('accommodation')) return 'hotel';
  if (lower.includes('restaurant') || lower.includes('dining') || lower.includes('utensil')) return 'restaurant';
  if (lower.includes('store') || lower.includes('shop') || lower.includes('shopping')) return 'store';
  if (/\bcar\b/.test(lower) || lower.includes('rental')) return 'car';
  if (lower.includes('transport') || lower.includes('transfer')) return 'transport';
  if (lower.includes('family event') || lower.includes('family_event')) return 'family_event';
  if (lower.includes('attraction')) return 'attraction';
  if (lower.includes('activity')) return 'activity';
  if (lower.includes('sightseeing')) return 'sightseeing';
  if (lower.includes('theatre') || lower.includes('theater') || lower.includes('broadway')) return 'theatre';
  if (lower.includes('workout') || lower.includes('fitness')) return 'workout';
  if (lower.includes('artist') || lower.includes('performer')) return 'artist';
  if (lower.includes('music') || lower.includes('jazz')) return 'music';
  if (lower.includes('bar') || lower.includes('cocktail') || lower.includes('cafe')) return 'bar';
  if (lower.includes('ticket') || lower.includes('event') || lower.includes('tour')) return 'event';
  return '';
}

export function looksLikeFlightText(value) {
  const source = text(value);
  if (!source) return false;
  if (/\b(las vegas|vegas)\b/i.test(source) && !/\b(flight|airport|sfo|jfk|lga|ewr|lax|depart|arrive)\b/i.test(source) && !/\b[A-Z]{3}\s+to\s+[A-Z]{3}\b/.test(source)) {
    return /\b(sfo|jfk|lga|ewr|lax|ord|dfw)\s+to\s+las\b/i.test(source) || /\blas\s+to\s+(sfo|jfk|lga|ewr|lax|ord|dfw)\b/i.test(source);
  }
  if (/\bflight\b|airport|jetblue|southwest|american airlines|\bdelta\b/i.test(source)) return true;
  if (/\b(sfo|jfk|lga|ewr|lax|ord|dfw)\b/i.test(source)) return true;
  if (/\b[A-Z]{3}\s+to\s+[A-Z]{3}\b/.test(source)) return true;
  if (/\blas\b(?!\s+vegas)/i.test(source) && /\b(to|from|sfo|jfk|lga|ewr|lax|thu|sun|mon|tue|wed|fri|sat|oct|nov|dec|jan)\b/i.test(source)) return true;
  return false;
}

export function inferThingTypeFromText(value) {
  const source = text(value);
  if (looksLikeFlightText(source)) return 'flight';
  const lower = source.toLowerCase();
  if (/rental car|car rental|hertz|avis|enterprise|budget rent|alamo/i.test(source)) return 'car';
  if (/hotel|marriott|hyatt|hilton|sheraton|bellagio|lodging|accommodation/i.test(source)) return 'hotel';
  if (/store|shop|shopping|grocery|market|pharmacy/i.test(source)) return 'store';
  if (/restaurant|bistro|dinner|lunch|breakfast|dining|carbone|eggslut|shake shack|lotus of siam/i.test(source)) return 'restaurant';
  if (/\bbar\b|cocktail|lounge|happy hour|conservatory/i.test(source)) return 'bar';
  if (/theatre|theater|broadway|cirque/i.test(source)) return 'theatre';
  if (/workout|fitness|gym/i.test(source)) return 'workout';
  if (/tour|ticket|museum|show|sightseeing/i.test(source)) return 'event';
  return '';
}

export function resolveThingType(thing = {}, override = {}, rowType = '') {
  const row = text(rowType).toLowerCase();
  if (row === 'hotel-wake' || row === 'hotel-sleep') return row;
  if (row === 'travel' || row === 'travel-to-thing') return row;
  if (row === 'flight') return 'flight';

  const candidates = [
    override.category,
    thing.type,
    thing.category_name,
    thing.category?.name,
    thing.category_icon,
    thing.category?.icon,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeThingType(candidate);
    if (normalized && normalized !== 'other') {
      if (normalized === 'transport' && looksLikeFlightText(haystack(thing, override.category))) return 'flight';
      return normalized;
    }
  }

  return inferThingTypeFromText(haystack(thing, override.category)) || 'other';
}

export const AIRPLANE_GLYPH_RE = /\u2708\uFE0F?|\u2708|✈️|^plane$/i;

export function isAirplaneGlyph(value) {
  return AIRPLANE_GLYPH_RE.test(text(value));
}

export function timelineCategoryIcon(type) {
  if (type === 'flight') return '✈️';
  if (type === 'hotel-wake' || type === 'hotel-sleep') return '🛏️';
  if (type === 'travel' || type === 'travel-to-thing') return '🚗';
  const icon = CATEGORY_ICONS[type] || '📍';
  if (isAirplaneGlyph(icon) && type !== 'flight') return '📍';
  return icon;
}

export function sanitizeTimelineGlyph(icon, type) {
  if (isAirplaneGlyph(icon) && type !== 'flight') return timelineCategoryIcon(type || 'other');
  return text(icon) || timelineCategoryIcon(type || 'other');
}

export function isVideoMediaUrl(value = '') {
  const source = text(value);
  return /\.mp4(\?|#|$)/i.test(source)
    || /[?&]raw=1\b/i.test(source) && /\.mp4\b/i.test(source)
    || /video\//i.test(source);
}

export function thingLogoUrl(thing = {}, override = {}) {
  const candidates = [
    override.logoUrl,
    override.iconUrl,
    thing.logoUrl,
    thing.iconUrl,
    thing.captured_logo_url,
    thing.image_url,
    thing.imageUrl,
  ].map(text).filter(Boolean);
  return candidates.find((url) => !isVideoMediaUrl(url)) || '';
}

export function timelineIcon(thing = {}, override = {}, rowType = '') {
  const type = resolveThingType(thing, override, rowType);
  return {
    type,
    logoUrl: thingLogoUrl(thing, override),
    icon: timelineCategoryIcon(type),
    isFlight: type === 'flight',
  };
}

export function isAirplaneAllowed(type) {
  return type === 'flight';
}

export function printThingIconHtml(thing = {}, override = {}, rowType = '') {
  const resolved = timelineIcon(thing, override, rowType);
  if (resolved.logoUrl) {
    const src = String(resolved.logoUrl)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
    return `<img class="tiny-logo" src="${src}" alt="" />`;
  }
  return `<span class="thing-emoji">${resolved.icon}</span>`;
}
