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
    || textField(place.image_url || place.logoUrl || priorOverride.logoUrl);
  const extra = { ...(logoUrl ? { logoUrl } : {}) };
  if (!logoUrl) {
    const reason = logoCaptureMissReason(place, presentationOverride);
    if (reason) extra.logoCaptureReason = reason;
  }
  return extra;
}
