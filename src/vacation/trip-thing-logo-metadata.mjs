import { captureThingLogo, logoCaptureMissReason } from './thing-logo-capture.mjs';

function text(value) {
  return String(value || '').trim();
}

/** Attach logoUrl (or logoCaptureReason) from provider source fields at trip_things persist time. */
function logoMetadataForPlace(place = {}) {
  const sourceRecord = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : null;
  const captureInput = {
    title: text(place.title),
    category: text(place.category),
    category_name: text(place.categoryName || place.category_name),
    url: text(place.url),
    website: text(place.website || place.url),
    sourceRecord,
    source: sourceRecord || undefined,
  };
  const override = {
    category: text(place.category),
    sourceRecord,
    source: sourceRecord || undefined,
  };
  const logoUrl = captureThingLogo(captureInput, override);
  if (logoUrl) return { logoUrl };
  const reason = logoCaptureMissReason(captureInput, override);
  if (!reason) return {};
  return { logoCaptureReason: reason };
}

export function mergeLogoMetadata(metadata = {}, place = {}) {
  const logoFields = logoMetadataForPlace(place);
  if (!Object.keys(logoFields).length) return metadata;
  return { ...metadata, ...logoFields };
}
