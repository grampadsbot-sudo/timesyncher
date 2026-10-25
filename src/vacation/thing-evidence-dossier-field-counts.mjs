import { hoursValueLooksValid } from './dossier-hours-fields.mjs';
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

const REVIEW_OPINION = /\b(?:excellent|great|good|bad|terrible|amazing|awesome|loved?|recommend|disappointing|friendly|rude|delicious|overpriced|worth|stars?|rated|rating)\b/i;

function reviewTextKey(value) {
  const key = text(value).toLowerCase();
  return key.length >= 20 ? key : '';
}

function uniqueReviewRows(rows, read) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = reviewTextKey(read(row));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function singularSnippetReview(row = {}) {
  const topic = text(row.topic).toLowerCase();
  if (topic && topic !== 'review' && topic !== 'reviews') return '';
  const snippet = text(row.snippet);
  if (!reviewTextKey(snippet) || !REVIEW_OPINION.test(snippet)) return '';
  return snippet;
}

function reviewStats(dossier = {}) {
  const written = uniqueReviewRows(Array.isArray(dossier.reviews) ? dossier.reviews : [], (row) => row?.text);
  if (written.length >= 4) {
    return { count: Math.max(written.length, dossier.reviewsRead || written.length), sources: 3, status: 'ok' };
  }
  const seen = new Set(written.map((row) => reviewTextKey(row.text)));
  const code = [];
  for (const row of extractReviewsByCode(dossier)) {
    const key = reviewTextKey(row?.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    code.push(row);
  }
  const braveSnippet = [];
  for (const row of dossier.braveResults || []) {
    const snippet = singularSnippetReview(row);
    const key = reviewTextKey(snippet);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    braveSnippet.push(row);
  }
  const count = seen.size;
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
  counts.summary = summaryVal && words(summaryVal) >= 12 && descriptionNamesThing(summaryVal, dossier.thing)
    ? { status: 'ok' } : { status: 'missing' };

  const descVal = text(
    fields.description?.value
    ?? fields.description
    ?? fields.longDetails?.value
    ?? fields.longDetails
    ?? fields.details?.value
    ?? fields.details,
  );
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
    counts.hours = hoursValueLooksValid(hoursVal) ? { status: 'ok' } : { status: 'missing' };
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
    counts.phone = { status: scalarFieldStatus(fields.phone?.value ?? fields.phone) };
    counts.website = { status: scalarFieldStatus(fields.website?.value ?? fields.website ?? dossier.pages?.[0]?.url) };
    counts.neighborhood = { status: scalarFieldStatus(fields.neighborhood?.value ?? fields.neighborhood) };
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
