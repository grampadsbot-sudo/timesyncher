import { fetchPageIconUrl, isPlaceWebsite } from './page-icon-discovery.mjs';
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

export function logoFieldsForSharedPlace(place, priorOverride = {}) {
  const name = textField(place.name);
  const pageUrl = textField(
    place.website
    || place.url
    || place.source_url
    || priorOverride.website
    || priorOverride.url
    || place.sourceRecord?.website
    || place.sourceRecord?.url,
  );
  const presentationOverride = {
    ...priorOverride,
    title: name,
    category: priorOverride.category || place.category_name,
    category_name: place.category_name,
    sourceRecord: place.sourceRecord || priorOverride.sourceRecord,
    source: place.source,
    ...(pageUrl ? { url: pageUrl, website: pageUrl } : {}),
  };
  const logoUrl = resolveThingLogoUrl(place, presentationOverride)
    || textField(place.image_url);
  const extra = { ...(logoUrl ? { logoUrl } : {}) };
  if (!logoUrl) {
    const reason = logoCaptureMissReason(place, presentationOverride);
    if (reason) extra.logoCaptureReason = reason;
  }
  return extra;
}

export async function applyDiscoveredPageIcon(thing, { fetchImpl = globalThis.fetch } = {}) {
  if (!thing || typeof thing !== 'object') return thing;
  const metadata = { ...(thing.metadata || {}) };
  const source = { ...(metadata.sourceRecord || {}) };
  const pageUrl = source.website || source['contact:website'] || metadata.website || thing.website;
  const captured = source.logoProvenance;
  if (captured?.pageUrl && captured.iconUrl && metadata.logoUrl === captured.iconUrl && source.logoUrl === captured.iconUrl) return thing;
  const result = pageUrl && isPlaceWebsite(pageUrl)
    ? await fetchPageIconUrl(pageUrl, { fetchImpl })
    : { reason: 'no_verified_place_website' };
  delete metadata.logoUrl;
  delete source.logoUrl;
  delete source.logoProvenance;
  if (result.logoUrl) {
    metadata.logoUrl = result.logoUrl;
    source.logoUrl = result.logoUrl;
    source.website = result.pageUrl;
    source.logoProvenance = { pageUrl: result.pageUrl, iconUrl: result.logoUrl };
    delete metadata.logoCaptureReason;
    delete source.logoCaptureReason;
  } else {
    metadata.logoCaptureReason = result.reason;
    source.logoCaptureReason = result.reason;
  }
  metadata.sourceRecord = source;
  thing.metadata = metadata;
  return thing;
}
