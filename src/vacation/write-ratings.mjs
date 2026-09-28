function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function sourcePayload(thing) {
  const record = plainObject(thing && thing.sourceRecord);
  if (record && typeof record.source === 'string') return record;
  const ratings = plainObject(thing && thing.ratings);
  if (ratings && typeof ratings.source === 'string') return ratings;
  if (thing && typeof thing.source === 'string') return thing;
  return null;
}

function sourceName(record) {
  if (!record || typeof record.source !== 'string') return '';
  return record.source.trim();
}

function isGooglePlaces(source) {
  return source.toLowerCase().replace(/[\s_]+/g, '-') === 'google-places';
}

function textValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function sourceUrl(record) {
  const explicit = textValue(record.sourceUrl);
  if (explicit) return explicit;
  return textValue(record.url);
}

function presentCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !Number.isFinite(Number(trimmed))) return null;
  return trimmed;
}

function presentRating(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !/\d/.test(trimmed)) return null;
  return trimmed;
}

export function writeRatings(thing) {
  const record = sourcePayload(thing);
  const source = sourceName(record);
  if (!source || isGooglePlaces(source)) return {};
  const written = { source };
  const url = sourceUrl(record);
  if (url) written.sourceUrl = url;
  const count = presentCount(record.count);
  if (count != null) written.count = count;
  const rating = presentRating(record.rating);
  if (rating != null) {
    written.rating = rating;
    written.thirdPartyRating = rating;
  }
  return written;
}
