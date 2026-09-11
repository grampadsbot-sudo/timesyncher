import { timelineIcon, timelineCategoryIcon } from './timeline-icons.mjs';

const BRAND_LOGOS = [
  [/carbone/i, '/ts-thing-logos/carbone.svg'],
  [/shake\s*shack/i, '/ts-thing-logos/shake-shack.svg'],
  [/eggslut/i, '/ts-thing-logos/eggslut.svg'],
  [/lotus of siam/i, '/ts-thing-logos/lotus-of-siam.svg'],
  [/conservatory/i, '/ts-thing-logos/bellagio-conservatory.svg'],
  [/bellagio/i, '/ts-thing-logos/bellagio.svg'],
  [/cosmopolitan|cosmo.*shop/i, '/ts-thing-logos/cosmopolitan-shops.svg'],
  [/\bsfo\b.*\blas\b|\blas\b.*\bsfo\b|boarding pass/i, '/ts-thing-logos/flight.svg'],
];

const BOUND_MEDIA_RE = /\/api\/bind-thing-media\b|\/ts-thing-media\//i;

export function isBoundStoryMediaUrl(value = '') {
  return BOUND_MEDIA_RE.test(String(value || ''));
}

function text(value) {
  return String(value || '').trim();
}

function haystack(thing = {}, override = {}) {
  return [
    override.title,
    thing.name,
    thing.title,
    override.category,
    thing.category_name,
    thing.category?.name,
  ].map(text).join(' ');
}

export function brandLogoPath(thing = {}, override = {}) {
  const source = haystack(thing, override);
  for (const [pattern, path] of BRAND_LOGOS) {
    if (pattern.test(source)) return path;
  }
  return '';
}

export function generatedLogoDataUri(thing = {}, override = {}, type = 'other') {
  const name = text(override.title || thing.name || thing.title || 'Thing');
  const letter = (name.replace(/[^A-Za-z0-9]/g, '')[0] || '?').toUpperCase();
  const colors = {
    flight: ['#0f766e', '#ccfbf1'],
    hotel: ['#1d4ed8', '#dbeafe'],
    restaurant: ['#b91c1c', '#fee2e2'],
    store: ['#c2410c', '#ffedd5'],
    shopping: ['#c2410c', '#ffedd5'],
    car: ['#0e7490', '#cffafe'],
    transport: ['#334155', '#e2e8f0'],
    bar: ['#b45309', '#fef3c7'],
    attraction: ['#6d28d9', '#ede9fe'],
    event: ['#7c3aed', '#ede9fe'],
    theatre: ['#9d174d', '#fce7f3'],
    other: ['#334155', '#e2e8f0'],
  };
  const [fg, bg] = colors[type] || colors.other;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${name}">
  <rect width="64" height="64" rx="16" fill="${bg}"/>
  <text x="32" y="40" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-weight="700" fill="${fg}">${letter}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function captureThingLogo(thing = {}, override = {}, rowType = '') {
  const resolved = timelineIcon(thing, override, rowType);
  const explicit = text(override.logoUrl || override.iconUrl || thing.logoUrl || thing.iconUrl);
  if (explicit && !isBoundStoryMediaUrl(explicit)) return explicit;
  const imageUrl = text(thing.image_url || thing.imageUrl);
  if (imageUrl && !isBoundStoryMediaUrl(imageUrl)) return imageUrl;
  return brandLogoPath(thing, override) || generatedLogoDataUri(thing, override, resolved.type);
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
