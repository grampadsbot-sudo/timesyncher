import { timelineIcon, timelineCategoryIcon } from './timeline-icons.mjs';

const BOUND_MEDIA_RE = /\/api\/bind-thing-media\b|\/ts-thing-media\//i;
const PLACEHOLDER_LOGO_RE = /admit\s*one|pDe|family-event-placeholder|data:image\/svg\+xml/i;

export function isBoundStoryMediaUrl(value = '') {
  return BOUND_MEDIA_RE.test(String(value || ''));
}

export function isPlaceholderLogoUrl(value = '') {
  const src = String(value || '').trim();
  if (!src) return true;
  if (PLACEHOLDER_LOGO_RE.test(src)) return true;
  if (src.startsWith('data:image/svg+xml')) return true;
  return false;
}

function text(value) {
  return String(value || '').trim();
}

function sourceRecord(thing = {}, override = {}) {
  return {
    ...(thing.source && typeof thing.source === 'object' ? thing.source : {}),
    ...(override.source && typeof override.source === 'object' ? override.source : {}),
  };
}

function httpUrl(value) {
  const src = text(value);
  if (!src) return null;
  try {
    const parsed = new URL(src);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.replace(/^www\./, '');
    if (/(^|\.)google\./i.test(host) || /(^|\.)gstatic\.com$/i.test(host) || /(^|\.)googleusercontent\.com$/i.test(host)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function usableLogo(value) {
  const src = text(value);
  if (!src || isBoundStoryMediaUrl(src) || isPlaceholderLogoUrl(src)) return '';
  const parsed = httpUrl(src);
  if (parsed) return parsed.href;
  if (src.startsWith('/')) return src;
  return '';
}

/** Logo or favicon on the source record, else the favicon of its page URL. Otherwise none. */
export function sourceLogoUrl(thing = {}, override = {}) {
  const source = sourceRecord(thing, override);
  const explicit = [
    source.logo,
    source.logoUrl,
    source.favicon,
    source.faviconUrl,
    thing.logo,
    thing.favicon,
    thing.faviconUrl,
    override.logoUrl,
    override.iconUrl,
    thing.logoUrl,
    thing.iconUrl,
  ];
  for (const value of explicit) {
    const logo = usableLogo(value);
    if (logo) return logo;
  }
  const page = httpUrl(source.url || source.website || source.sourceUrl || thing.url || thing.website || thing.sourceUrl || thing.source_url);
  if (!page) return '';
  return `${page.origin}/favicon.ico`;
}

/** Names are not a logo source. The shared bundle calls this with a title and gets nothing. */
export function logoLookupRuntimeSource() {
  return '(name)=>""';
}

export function captureThingLogo(thing = {}, override = {}) {
  return sourceLogoUrl(thing, override);
}

export function applyCapturedLogos(shared = {}) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
  };
  for (const place of next.places) {
    const key = `place:${place.id}`;
    const override = { ...(next.thingOverrides[key] || {}) };
    const resolved = timelineIcon(place, override);
    const logoUrl = captureThingLogo(place, override);
    override.logoUrl = logoUrl;
    override.icon = resolved.icon;
    if (resolved.isFlight) override.icon = '✈️';
    else if (!override.icon || /plane|✈️|\u2708/i.test(String(override.icon))) {
      override.icon = timelineCategoryIcon(resolved.type);
    }
    next.thingOverrides[key] = override;
    if (!place.image_url || isBoundStoryMediaUrl(place.image_url)) {
      place.logoUrl = logoUrl;
    } else {
      place.logoUrl = place.image_url;
    }
    place.captured_logo_url = logoUrl;
  }
  return next;
}

export function thingCreateLogoFields(title, category, extras = {}) {
  const thing = { name: title, category_name: category, address: extras.address || '' };
  const override = { title, category };
  const resolved = timelineIcon(thing, override);
  return {
    logoUrl: captureThingLogo(thing, override),
    icon: resolved.icon,
    category: resolved.type,
    isFlight: resolved.isFlight,
  };
}
