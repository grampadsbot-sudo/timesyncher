import { timelineIcon, timelineCategoryIcon, thingLogoUrl } from './timeline-icons.mjs';

/** Known rental/hotel brand favicons when trip rows lack source URLs. */
export const NAMED_THING_LOGOS = {
  hertz: 'https://www.hertz.com/favicon.ico',
  alamo: 'https://www.alamo.com/favicon.ico',
  avis: 'https://www.avis.com/favicon.ico',
  enterprise: 'https://www.enterprise.com/favicon.ico',
  budget: 'https://www.budget.com/favicon.ico',
  national: 'https://www.nationalcar.com/favicon.ico',
  hyatt: 'https://www.hyatt.com/hyatt/hds/images/4.0.0/favicon.ico',
};

const BRAND_LOGO_RULES = [
  [/\bhertz\b/i, NAMED_THING_LOGOS.hertz],
  [/\balamo\b/i, NAMED_THING_LOGOS.alamo],
  [/\bavis\b/i, NAMED_THING_LOGOS.avis],
  [/\benterprise\b/i, NAMED_THING_LOGOS.enterprise],
  [/\bbudget\b/i, NAMED_THING_LOGOS.budget],
  [/\bnational\b/i, NAMED_THING_LOGOS.national],
  [/\bhyatt\b/i, NAMED_THING_LOGOS.hyatt],
];

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
  const embedded = thing.sourceRecord && typeof thing.sourceRecord === 'object' ? thing.sourceRecord : {};
  const overrideRecord = override.sourceRecord && typeof override.sourceRecord === 'object' ? override.sourceRecord : {};
  const fromThing = thing.source && typeof thing.source === 'object' ? thing.source : {};
  const fromOverride = override.source && typeof override.source === 'object' ? override.source : {};
  return { ...embedded, ...overrideRecord, ...fromThing, ...fromOverride };
}

function thumbnailFromSource(source = {}) {
  const thumb = source?.thumbnail;
  if (thumb && typeof thumb === 'object') {
    const src = text(thumb.original || thumb.src);
    if (src) return usableLogo(src);
  }
  const pictures = source?.pictures?.results;
  if (Array.isArray(pictures)) {
    for (const row of pictures) {
      const src = text(row?.original || row?.src);
      if (src) {
        const logo = usableLogo(src);
        if (logo) return logo;
      }
    }
  }
  return '';
}

function brandLogoFromName(name = '') {
  const label = text(name);
  if (!label) return '';
  for (const [pattern, url] of BRAND_LOGO_RULES) {
    if (pattern.test(label)) return url;
  }
  return '';
}

function pageUrlForLogo(thing = {}, override = {}) {
  const source = sourceRecord(thing, override);
  return text(
    source.url
    || source.website
    || source.sourceUrl
    || thing.url
    || thing.website
    || thing.sourceUrl
    || thing.source_url,
  );
}

/** Why captureThingLogo returned empty (for shared API diagnostics). */
export function logoCaptureMissReason(thing = {}, override = {}) {
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
    if (logo) return '';
  }
  const page = text(
    source.url || source.website || source.sourceUrl
    || thing.url || thing.website || thing.sourceUrl || thing.source_url,
  );
  if (!page) return 'no_place_website';
  if (!httpUrl(page)) return 'no_usable_place_website';
  return 'no_logo_or_favicon';
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
    if (logo) {
      if (/hyatt\.com\/favicon\.ico/i.test(logo)) {
        const thumb = thumbnailFromSource(source);
        if (thumb) return thumb;
        const hyattIcon = usableLogo(NAMED_THING_LOGOS.hyatt);
        if (hyattIcon) return hyattIcon;
      }
      return logo;
    }
  }
  const thumb = thumbnailFromSource(source);
  if (thumb) return thumb;
  const named = brandLogoFromName(thing.name || thing.title || override.title);
  if (named) return named;
  const page = httpUrl(pageUrlForLogo(thing, override));
  if (!page) return '';
  if (/\.hyatt\.com$/i.test(page.hostname)) {
    const hyattIcon = usableLogo(NAMED_THING_LOGOS.hyatt);
    if (hyattIcon) return hyattIcon;
  }
  return `${page.origin}/favicon.ico`;
}

/** Names are not a logo source. The shared bundle calls this with a title and gets nothing. */
export function logoLookupRuntimeSource() {
  return '(name)=>""';
}

export function captureThingLogo(thing = {}, override = {}) {
  return sourceLogoUrl(thing, override);
}

/** Same logo fields as live tab rows and the shared trek bundle (_l / ha). */
export function resolveThingLogoUrl(thing = {}, override = {}) {
  const direct = thingLogoUrl(thing, override);
  if (direct) {
    const logo = usableLogo(direct);
    if (logo) return logo;
  }
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
    if (logoUrl) {
      override.logoUrl = logoUrl;
    } else if (!text(override.logoUrl)) {
      override.logoUrl = '';
      const reason = logoCaptureMissReason(place, override);
      if (reason) override.logoCaptureReason = reason;
    }
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
