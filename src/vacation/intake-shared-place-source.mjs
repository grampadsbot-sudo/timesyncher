import { captureThingLogo, logoCaptureMissReason } from './thing-logo-capture.mjs';

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
  return fields;
}

export function logoFieldsForSharedPlace(place, priorOverride = {}) {
  const name = textField(place.name);
  const presentationOverride = {
    title: name,
    category: priorOverride.category || place.category_name,
    category_name: place.category_name,
    sourceRecord: place.sourceRecord,
    source: place.source,
  };
  const logoUrl = captureThingLogo(place, presentationOverride);
  const extra = { logoUrl };
  if (!logoUrl) {
    const reason = logoCaptureMissReason(place, presentationOverride);
    if (reason) extra.logoCaptureReason = reason;
  }
  return extra;
}
