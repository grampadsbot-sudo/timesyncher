import { fetchPageIconUrl } from './page-icon-discovery.mjs';
import { logoCaptureMissReason, resolveThingLogoUrl } from './thing-logo-capture.mjs';

function textField(value) {
  return String(value || '').trim();
}

function isGooglePlacesSource(record) {
  const source = textField(record?.source);
  return source.toLowerCase().replace(/[\s_]+/g, '-') === 'google-places';
}

export function placeSourceFieldsFromThing(thing = {}) {
  const record = thing.sourceRecord && typeof thing.sourceRecord === 'object' ? thing.sourceRecord : null;
  const pageUrl = textField(record?.url || record?.website || thing.website || '');
  const fields = {};
  if (record && !isGooglePlacesSource(record)) {
    fields.sourceRecord = record;
    fields.source = record;
  }
  if (pageUrl) {
    fields.url = pageUrl;
    fields.website = pageUrl;
    fields.source_url = pageUrl;
  }
  if (Array.isArray(thing.providerCategories) && thing.providerCategories.length) {
    fields.providerCategories = thing.providerCategories;
  }
  return fields;
}

function presentationOverrideForPlace(place, priorOverride = {}) {
  const name = textField(place.name || place.title);
  const pageUrl = textField(
    place.website
    || place.url
    || place.source_url
    || priorOverride.website
    || priorOverride.url
    || place.sourceRecord?.website
    || place.sourceRecord?.url,
  );
  return {
    ...priorOverride,
    title: name,
    category: priorOverride.category || place.category_name || place.category,
    category_name: place.category_name || place.category,
    sourceRecord: place.sourceRecord || priorOverride.sourceRecord,
    source: place.source,
    ...(pageUrl ? { url: pageUrl, website: pageUrl } : {}),
  };
}

function faviconGuessForPage(pageUrl = '') {
  try {
    return new URL('/favicon.ico', pageUrl).href;
  } catch {
    return '';
  }
}

function syncLogoIsFaviconGuess(logoUrl = '', pageUrl = '') {
  const guess = faviconGuessForPage(pageUrl);
  return Boolean(guess && textField(logoUrl) === guess);
}

const PROVIDER_HOST_LABELS = new Set([
  'openstreetmap',
  'overpass-api',
  'brave',
  'openrouter',
  'tripadvisor',
  'yelp',
  'tavily',
  'foursquare',
  'googleapis',
  'gstatic',
  'googleusercontent',
]);

function isProviderOrSourcePage(value) {
  let parsed;
  try {
    parsed = new URL(textField(value));
  } catch {
    return true;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const labels = host.split('.');
  if (labels.some((label) => PROVIDER_HOST_LABELS.has(label))) return true;
  if (labels[0] === 'maps' && labels[1] === 'google') return true;
  if (labels.includes('google') && /^\/maps(\/|$)/.test(parsed.pathname)) return true;
  return false;
}

function pageCandidates(place = {}) {
  const source = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  const meta = place.metadata && typeof place.metadata === 'object' ? place.metadata : {};
  const metaSource = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  const links = Array.isArray(place.links) ? place.links : [];
  return [
    place.website,
    source.website,
    source['contact:website'],
    meta.website,
    metaSource.website,
    place.url,
    source.url,
    metaSource.url,
    ...links.map((link) => link?.url),
  ];
}

function ownPlaceWebsite(place = {}) {
  const seen = new Set();
  for (const value of pageCandidates(place)) {
    const href = textField(value);
    if (!href || seen.has(href) || isProviderOrSourcePage(href)) continue;
    seen.add(href);
    return href;
  }
  return '';
}

export async function discoverLogoFieldsForSharedPlaceAtIngest(
  place = {},
  priorOverride = {},
  { fetchImpl = globalThis.fetch } = {},
) {
  const presentationOverride = presentationOverrideForPlace(place, priorOverride);
  const pageUrl = ownPlaceWebsite(place) || ownPlaceWebsite(presentationOverride);
  const storedLogo = textField(place.logoUrl || priorOverride.logoUrl);
  if (storedLogo && !isProviderOrSourcePage(storedLogo) && !syncLogoIsFaviconGuess(storedLogo, pageUrl)) {
    return { logoUrl: storedLogo };
  }
  const storedReason = textField(place.logoCaptureReason || priorOverride.logoCaptureReason);
  if (storedReason) return { logoCaptureReason: storedReason };
  const syncLogo = resolveThingLogoUrl(place, presentationOverride);
  if (syncLogo && !isProviderOrSourcePage(syncLogo) && !syncLogoIsFaviconGuess(syncLogo, pageUrl)) {
    return { logoUrl: syncLogo };
  }
  if (!pageUrl) return { logoCaptureReason: 'no_place_website' };
  const discovered = await fetchPageIconUrl(pageUrl, { fetchImpl });
  if (discovered.logoUrl) {
    const extra = { logoUrl: discovered.logoUrl };
    const canonical = textField(discovered.pageUrl);
    if (canonical && canonical !== pageUrl) {
      extra.url = canonical;
      extra.website = canonical;
    }
    return extra;
  }
  return { logoCaptureReason: textField(discovered.reason) || 'no_icon_answered_with_image' };
}

export async function applyDiscoveredPageIcon(thing, { fetchImpl } = {}) {
  if (!thing || typeof thing !== 'object' || typeof fetchImpl !== 'function') return thing;
  const meta = thing.metadata && typeof thing.metadata === 'object' && !Array.isArray(thing.metadata)
    ? thing.metadata
    : {};
  const sourceRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' && !Array.isArray(meta.sourceRecord)
    ? meta.sourceRecord
    : {};
  const fields = await discoverLogoFieldsForSharedPlaceAtIngest({
    title: thing.title,
    category: thing.category,
    url: textField(sourceRecord.url),
    website: textField(sourceRecord.website || meta.website),
    logoUrl: textField(meta.logoUrl || sourceRecord.logoUrl),
    logoCaptureReason: textField(meta.logoCaptureReason || sourceRecord.logoCaptureReason),
    sourceRecord,
    links: thing.links,
    metadata: meta,
  }, {
    sourceRecord,
    logoUrl: textField(meta.logoUrl || sourceRecord.logoUrl),
    logoCaptureReason: textField(meta.logoCaptureReason || sourceRecord.logoCaptureReason),
    website: textField(sourceRecord.website || meta.website),
    url: textField(sourceRecord.url),
  }, { fetchImpl });
  if (fields.logoUrl) {
    meta.logoUrl = fields.logoUrl;
    sourceRecord.logoUrl = fields.logoUrl;
    delete meta.logoCaptureReason;
    delete sourceRecord.logoCaptureReason;
    if (fields.url) {
      sourceRecord.url = fields.url;
      sourceRecord.website = fields.website || fields.url;
    }
  } else if (fields.logoCaptureReason) {
    delete meta.logoUrl;
    delete sourceRecord.logoUrl;
    meta.logoCaptureReason = fields.logoCaptureReason;
    sourceRecord.logoCaptureReason = fields.logoCaptureReason;
  }
  meta.sourceRecord = sourceRecord;
  thing.metadata = meta;
  return thing;
}

export function logoFieldsForSharedPlace(place, priorOverride = {}) {
  const presentationOverride = presentationOverrideForPlace(place, priorOverride);
  const storedLogo = textField(place.logoUrl || priorOverride.logoUrl);
  if (storedLogo) return { logoUrl: storedLogo };
  const storedReason = textField(place.logoCaptureReason || priorOverride.logoCaptureReason);
  if (storedReason) return { logoCaptureReason: storedReason };

  const logoUrl = resolveThingLogoUrl(place, presentationOverride)
    || textField(place.image_url);
  const extra = { ...(logoUrl ? { logoUrl } : {}) };
  if (!logoUrl) {
    const reason = logoCaptureMissReason(place, presentationOverride);
    if (reason) extra.logoCaptureReason = reason;
  }
  return extra;
}
