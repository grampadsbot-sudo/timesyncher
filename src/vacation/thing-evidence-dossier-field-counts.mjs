import { extractReviewsByCode } from './dossier-review-extract.mjs';
import {
  MIN_REVIEWS_READ,
  MIN_REVIEW_SOURCES,
  descriptionNamesThing,
} from './thing-dossier-fields.mjs';
import { reviewSourceHost } from './thing-evidence-dossier.mjs';
import {
  isBarOrRestaurant,
  isFlightOrCarOrDecision,
  requiresHappyHourCapture,
} from './dossier-brave-queries.mjs';

function addressIsSpecific(value = '') {
  const v = text(value);
  if (!v) return false;
  if (/\d{1,5}\s+\S/.test(v)) return true;
  if (/,\s*[A-Z]{2}\b/.test(v) && /\d{5}/.test(v)) return true;
  return false;
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function words(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function pageBlob(dossier = {}) {
  return (dossier.pages || []).map((p) => p.text || '').join('\n');
}

function reviewStats(dossier = {}) {
  const written = Array.isArray(dossier.reviews)
    ? dossier.reviews.filter((r) => text(r.text).length >= 20)
    : [];
  if (written.length >= 4) {
    return { count: Math.max(written.length, dossier.reviewsRead || written.length), sources: 3, status: 'ok' };
  }
  const code = extractReviewsByCode(dossier);
  const braveSnippet = (dossier.braveResults || []).filter((r) => text(r.snippet).length >= 20);
  const count = code.length + braveSnippet.length;
  const hosts = new Set([
    ...code.map((r) => reviewSourceHost((dossier.pages || []).find((p, i) => `p${i + 1}` === r.page)?.url)),
    ...braveSnippet.map((r) => reviewSourceHost(r.url)),
  ].filter(Boolean));
  let status = 'ok';
  if (count < MIN_REVIEWS_READ) status = 'short';
  if (hosts.size < MIN_REVIEW_SOURCES && count > 0) status = 'short';
  if (count === 0) status = 'missing';
  return { count, sources: hosts.size, status };
}

function regexHit(blob, re) {
  return re.test(blob);
}

function scalarFieldStatus(value) {
  return text(value) ? 'ok' : 'missing';
}

function hoursFromFields(dossier = {}) {
  const raw = dossier.fields?.hours?.value ?? dossier.fields?.hours;
  const value = typeof raw === 'object' && raw ? text(raw.value ?? raw.text) : text(raw);
  if (value && value !== '[object Object]') return value;
  return '';
}

export function computeDossierFieldCounts(dossier = {}, place = {}) {
  const exempt = isFlightOrCarOrDecision(place);
  const blob = pageBlob(dossier);
  const fields = dossier.fields || {};
  const counts = {};

  const reviews = reviewStats(dossier);
  if (exempt || /car/.test(text(place.category))) {
    counts.reviews = { count: reviews.count, status: 'ok' };
  } else {
    counts.reviews = { count: reviews.count, status: reviews.status, sources: reviews.sources };
  }

  const summaryVal = text(fields.summary?.value ?? fields.summary);
  counts.summary = summaryVal && words(summaryVal) >= 30 && descriptionNamesThing(summaryVal, dossier.thing)
    ? { status: 'ok' } : { status: 'missing' };

  const descVal = text(fields.description?.value ?? fields.description ?? fields.longDetails?.value);
  counts.description = descVal && words(descVal) >= 40 ? { status: 'ok' } : { status: 'missing' };

  counts.itineraryNote = text(fields.itineraryNote?.value ?? fields.itineraryNote).length >= 12
    ? { status: 'ok' } : { status: 'missing' };

  const priceVal = fields.price?.value ?? fields.price;
  counts.price = (Number(priceVal) > 0 || text(fields.priceLevel) || regexHit(blob, /\$\d+/))
    ? { status: 'ok' } : { status: 'missing' };

  if (exempt || /car/.test(text(place.category))) {
    counts.hours = { status: 'ok' };
  } else {
    const hoursVal = hoursFromFields(dossier) || (regexHit(blob, /\b(?:mon|tue|wed|thu|fri|sat|sun)\b/i) ? 'detected' : '');
    counts.hours = text(hoursVal) && hoursVal !== '[object Object]' ? { status: 'ok' } : { status: 'missing' };
  }

  if (requiresHappyHourCapture(place)) {
    const hh = text(fields.happyHourDetails?.value ?? fields.happyHourDetails)
      || [fields.happyHourDays, fields.happyHourTimes, fields.happyHourDeals].map((r) => text(r?.value ?? r)).filter(Boolean).join(' ');
    counts.happyHour = hh ? { status: 'ok' } : { status: 'missing' };
  }

  counts.knownFor = Array.isArray(dossier.knownFor) && dossier.knownFor.length ? { status: 'ok' } : { status: 'missing' };

  if (!exempt) {
    const addressVal = text(fields.address?.value ?? fields.address);
    const addressOk = addressIsSpecific(addressVal)
      || (regexHit(blob, /\d{1,5}\s+\w+\s+(?:st|street|ave|avenue|blvd|road)/i) && addressVal && addressIsSpecific(addressVal));
    counts.address = addressOk ? { status: 'ok' } : { status: 'missing' };
    counts.phone = scalarFieldStatus(fields.phone?.value ?? fields.phone ?? (regexHit(blob, /\(\d{3}\)\s*\d{3}-\d{4}|\d{3}-\d{3}-\d{4}/) ? 'yes' : ''));
    counts.website = scalarFieldStatus(fields.website?.value ?? fields.website ?? dossier.pages?.[0]?.url);
    counts.neighborhood = scalarFieldStatus(fields.neighborhood?.value ?? fields.neighborhood);
    const lat = fields.lat?.value ?? fields.lat ?? place.lat;
    const lng = fields.lng?.value ?? fields.lng ?? place.lng;
    counts.coordinates = lat != null && lng != null ? { status: 'ok' } : { status: 'missing' };
  }

  const ratingOk = dossier.rating > 0 || text(fields.googleRating?.value ?? fields.googleRating);
  counts.ratings = ratingOk ? { status: 'ok' } : { status: 'missing' };

  return counts;
}

const BUILDER_ONLY_CAPTURE_FIELDS = new Set([
  'summary',
  'description',
  'itineraryNote',
  'knownFor',
]);

export function fieldsNeedingCapture(counts = {}, place = {}) {
  const out = [];
  for (const [field, row] of Object.entries(counts)) {
    if (!row || row.status === 'ok') continue;
    if (row.status === 'short' && field === 'reviews') out.push(field);
    else if (row.status === 'missing') out.push(field);
  }
  if (isFlightOrCarOrDecision(place)) {
    return out.filter((f) => !['reviews', 'address', 'phone', 'hours', 'website', 'happyHour', 'coordinates'].includes(f));
  }
  return out;
}

function fieldsNeedingBraveTopUp(counts = {}, place = {}) {
  return fieldsNeedingCapture(counts, place).filter((field) => !BUILDER_ONLY_CAPTURE_FIELDS.has(field));
}

function topUpAttemptsExhausted(dossier = {}, field = '') {
  const row = (dossier.shortcomings || []).find((s) => s.field === field);
  return Boolean(row && Array.isArray(row.attempts) && row.attempts.length >= 3);
}

export function braveTopUpFieldsPending(dossier = {}, place = {}) {
  const counts = computeDossierFieldCounts(dossier, place);
  return fieldsNeedingBraveTopUp(counts, place).filter((field) => !topUpAttemptsExhausted(dossier, field));
}

export function deriveMissingFieldsFromShortcomings(shortcomings = []) {
  return [...new Set((Array.isArray(shortcomings) ? shortcomings : []).map((s) => s.field).filter(Boolean))];
}

export function recordFieldShortcoming(dossier = {}, field, reason, attempt = {}) {
  const list = Array.isArray(dossier.shortcomings) ? [...dossier.shortcomings] : [];
  const idx = list.findIndex((row) => row.field === field);
  const entry = idx >= 0 ? { ...list[idx] } : { field, attempts: [], reason: text(reason) || 'still missing after top-up attempts' };
  if (attempt && attempt.query) entry.attempts.push(attempt);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  return list;
}
