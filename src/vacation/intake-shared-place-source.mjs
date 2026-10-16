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

export async function discoverLogoFieldsForSharedPlaceAtIngest(
  place = {},
  priorOverride = {},
  { fetchImpl = globalThis.fetch } = {},
) {
  const presentationOverride = presentationOverrideForPlace(place, priorOverride);
  const pageUrl = textField(presentationOverride.url || presentationOverride.website);
  const storedLogo = textField(place.logoUrl || priorOverride.logoUrl);
  if (storedLogo && !syncLogoIsFaviconGuess(storedLogo, pageUrl)) return { logoUrl: storedLogo };
  const storedReason = textField(place.logoCaptureReason || priorOverride.logoCaptureReason);
  if (storedReason) return { logoCaptureReason: storedReason };
  const syncLogo = resolveThingLogoUrl(place, presentationOverride);
  if (syncLogo && !syncLogoIsFaviconGuess(syncLogo, pageUrl)) {
    return { logoUrl: syncLogo };
  }
  if (!pageUrl) {
    const reason = logoCaptureMissReason(place, presentationOverride);
    return reason ? { logoCaptureReason: reason } : {};
  }
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
