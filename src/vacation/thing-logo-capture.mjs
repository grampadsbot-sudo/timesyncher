import { timelineIcon, timelineCategoryIcon, thingLogoUrl } from './timeline-icons.mjs';

export const NAMED_THING_LOGOS = {
  hertz: 'https://www.hertz.com/favicon.ico',
  alamo: 'https://www.alamo.com/favicon.ico',
  avis: 'https://www.avis.com/favicon.ico',
  enterprise: 'https://www.enterprise.com/favicon.ico',
  budget: 'https://www.budget.com/favicon.ico',
  national: 'https://www.nationalcar.com/favicon.ico',
  hyatt: 'https://www.hyatt.com/hyatt/hds/images/4.0.0/favicon.ico',
  jetblue: 'https://www.jetblue.com/favicon.ico',
  southwest: 'https://www.southwest.com/favicon.ico',
  united: 'https://www.united.com/favicon.ico',
  delta: 'https://www.delta.com/favicon.ico',
  american: 'https://www.aa.com/favicon.ico',
};

const BRAND_LOGO_RULES = [
  [/\bhertz\b/i, NAMED_THING_LOGOS.hertz],
  [/\balamo\b/i, NAMED_THING_LOGOS.alamo],
  [/\bavis\b/i, NAMED_THING_LOGOS.avis],
  [/\benterprise\b/i, NAMED_THING_LOGOS.enterprise],
  [/\bbudget\b/i, NAMED_THING_LOGOS.budget],
  [/\bnational\b/i, NAMED_THING_LOGOS.national],
  [/\bhyatt\b/i, NAMED_THING_LOGOS.hyatt],
  [/\bjetblue\b/i, NAMED_THING_LOGOS.jetblue],
  [/\bsouthwest\b/i, NAMED_THING_LOGOS.southwest],
  [/\bunited\b/i, NAMED_THING_LOGOS.united],
  [/\bdelta\b/i, NAMED_THING_LOGOS.delta],
  [/\bamerican\b/i, NAMED_THING_LOGOS.american],
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
    thing.image_url,
    thing.imageUrl,
    override.image_url,
    override.imageUrl,
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

const REGISTRABLE_SUFFIXES = [
  'co.uk', 'org.uk', 'com.au', 'github.io',
  'com', 'org', 'net', 'edu', 'gov', 'nyc', 'test', 'example',
];

function registrableDomain(value = '') {
  const parsed = httpUrl(value);
  if (!parsed) return '';
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const suffix = REGISTRABLE_SUFFIXES.filter((row) => host.endsWith(`.${row}`))
    .sort((a, b) => b.length - a.length)[0];
  if (!suffix) return '';
  return host.split('.').slice(-(suffix.split('.').length + 1)).join('.');
}

function isHostFaviconGuessUrl(value = '') {
  const parsed = httpUrl(value);
  if (!parsed) return false;
  return /\/favicon\.ico(\?|#|$)/i.test(parsed.pathname);
}

function logoOnBrandSite(logoUrl, thing = {}, override = {}) {
  const page = httpUrl(pageUrlForLogo(thing, override));
  const logo = httpUrl(logoUrl);
  if (!page || !logo) return false;
  const pageRoot = registrableDomain(page.href);
  const logoRoot = registrableDomain(logo.href);
  return Boolean(pageRoot && logoRoot && pageRoot === logoRoot);
}

function officialLogoFromSourceRecord(thing = {}, override = {}) {
  const source = sourceRecord(thing, override);
  for (const value of [source.logo, source.logoUrl, source.favicon, source.faviconUrl]) {
    const logo = usableLogo(value);
    if (logo && logoOnBrandSite(logo, thing, override)) return logo;
  }
  const provenance = source.logoProvenance;
  if (provenance && typeof provenance === 'object') {
    const icon = usableLogo(provenance.iconUrl);
    if (icon && logoOnBrandSite(icon, thing, override)) return icon;
  }
  return '';
}

function persistedLogoCandidates(thing = {}, override = {}) {
  return [
    override.logoUrl,
    thing.logoUrl,
    thing.captured_logo_url,
    override.iconUrl,
    thing.iconUrl,
    thing.image_url,
    thing.imageUrl,
    override.image_url,
    override.imageUrl,
  ];
}

function persistedLogoUrl(thing = {}, override = {}) {
  for (const value of persistedLogoCandidates(thing, override)) {
    const logo = usableLogo(value);
    if (logo) return logo;
  }
  return '';
}

function crossDomainFaviconGuess(url, thing = {}, override = {}) {
  if (!isHostFaviconGuessUrl(url)) return false;
  return !logoOnBrandSite(url, thing, override);
}

function finalizeSourceLogoUrl(thing = {}, override = {}, page) {
  const persisted = persistedLogoUrl(thing, override);
  if (persisted && crossDomainFaviconGuess(persisted, thing, override)) {
    return persisted;
  }
  if (!page) return persisted || '';
  const named = brandLogoFromName(thing.name || thing.title || override.title);
  if (named) return named;
  if (/\.hyatt\.com$/i.test(page.hostname)) {
    const hyattIcon = usableLogo(NAMED_THING_LOGOS.hyatt);
    if (hyattIcon) return hyattIcon;
  }
  return `${page.origin}/favicon.ico`;
}

export function sourceLogoUrl(thing = {}, override = {}) {
  const official = officialLogoFromSourceRecord(thing, override);
  if (official) return official;
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
    thing.captured_logo_url,
    thing.iconUrl,
    thing.image_url,
    thing.imageUrl,
    override.image_url,
    override.imageUrl,
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
  const page = httpUrl(pageUrlForLogo(thing, override));
  return finalizeSourceLogoUrl(thing, override, page);
}

export function logoLookupRuntimeSource() {
  return '(name)=>""';
}

export function captureThingLogo(thing = {}, override = {}) {
  return sourceLogoUrl(thing, override);
}

export function resolveThingLogoUrl(thing = {}, override = {}) {
  const official = officialLogoFromSourceRecord(thing, override);
  if (official) return official;
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
    const logoUrl = captureThingLogo(place, override) || persistedLogoUrl(place, override);
    if (logoUrl) {
      override.logoUrl = logoUrl;
      delete override.logoCaptureReason;
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
    const placeLogo = logoUrl || persistedLogoUrl(place, override);
    if (!place.image_url || isBoundStoryMediaUrl(place.image_url)) {
      if (placeLogo) place.logoUrl = placeLogo;
      else delete place.logoUrl;
    } else {
      place.logoUrl = place.image_url;
    }
    if (placeLogo) place.captured_logo_url = placeLogo;
    else delete place.captured_logo_url;
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
