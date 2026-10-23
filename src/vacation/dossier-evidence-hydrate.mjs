import { extractContactFieldsFromBlob } from './place-detail-extract.mjs';
import { descriptionNamesThing, dossierPageId } from './thing-dossier-fields.mjs';
import {
  computeDossierFieldCounts,
  deriveMissingFieldsFromShortcomings,
  fieldsNeedingCapture,
  recordFieldShortcoming,
} from './thing-evidence-dossier-field-counts.mjs';
import { isFlightOrCarOrDecision, placeSupportsDossierReviews } from './dossier-brave-queries.mjs';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

function nameTokens(title = '') {
  const stop = new Set(['the', 'club', 'jazz', 'restaurant', 'bar', 'cafe', 'nyc', 'new', 'york', 'city', 'at', 'and']);
  return norm(title).split(/\s+/).filter((t) => t.length > 2 && !stop.has(t));
}

function placeOfficialHost(place = {}) {
  const raw = text(place.website || place.url || place.sourceRecord?.website || place.sourceRecord?.url);
  if (!raw) return '';
  try {
    return new URL(raw).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

const REVIEW_HOST_RE = /yelp\.|tripadvisor\.|google\.|opentable\.|booking\.com/i;

export function evidencePageMatchesPlace(page = {}, place = {}, dossier = {}) {
  const blob = norm(`${page.text || ''} ${page.url || ''}`);
  const title = text(place.title || place.name || dossier.thing);
  const tokens = nameTokens(title);
  if (tokens.length && tokens.some((t) => blob.includes(t))) return true;
  const host = placeOfficialHost(place);
  if (host && blob.includes(host.split('.')[0])) return true;
  if (REVIEW_HOST_RE.test(page.url || '')) {
    return descriptionNamesThing(page.text || '', title);
  }
  if (!tokens.length) return true;
  return false;
}

export function pageNamesOtherVenue(page = {}, place = {}) {
  const blob = text(page.text || '');
  const title = text(place.title || place.name);
  if (!blob || !title) return false;
  const ours = nameTokens(title);
  const venueLike = blob.match(/\b([A-Z][A-Za-z'’]+(?:\s+[A-Z][A-Za-z'’]+){0,3})\s+(?:Club|Jazz Club|Restaurant|Bar|Bistro|Grill)\b/g);
  if (!venueLike?.length) return false;
  for (const phrase of venueLike) {
    const key = norm(phrase);
    if (ours.some((t) => key.includes(t))) continue;
    if (descriptionNamesThing(phrase, title)) continue;
    return true;
  }
  return false;
}

export function addressIsSpecific(value = '') {
  const v = text(value);
  if (!v) return false;
  if (/\d{1,5}\s+\S/.test(v)) return true;
  if (/,\s*[A-Z]{2}\b/.test(v) && /\d{5}/.test(v)) return true;
  return false;
}

function claimPageIds(claim = {}) {
  return Array.isArray(claim?.pages) ? claim.pages : [];
}

function fieldFailsIdentityCheck(dossier = {}, place = {}, fieldKey = '') {
  const claim = dossier.fields?.[fieldKey];
  if (!claim) return false;
  const value = text(claim.value ?? claim);
  if (fieldKey === 'website' && value) {
    try {
      const host = new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
      const official = placeOfficialHost(place);
      if (official && host && host !== official && !host.includes(nameTokens(place.title || '')[0] || '\0')) {
        return true;
      }
    } catch {
      return true;
    }
  }
  const ids = claimPageIds(claim);
  if (!ids.length) {
    if (!value) return false;
    return !addressIsSpecific(value) && fieldKey === 'address';
  }
  for (const id of ids) {
    const idx = /^p(\d+)$/.exec(id);
    const page = idx ? (dossier.pages || [])[Number(idx[1]) - 1] : null;
    if (!page) return true;
    if (!evidencePageMatchesPlace(page, place, dossier) || pageNamesOtherVenue(page, place)) return true;
  }
  return false;
}

const IDENTITY_SCALAR_FIELDS = ['address', 'phone', 'website', 'hours', 'happyHourDetails', ...['happyHourDays', 'happyHourTimes', 'happyHourDeals']];

export function stripMisattributedDossierFields(dossier = {}, place = {}) {
  const next = { ...dossier, fields: { ...(dossier.fields || {}) } };
  for (const key of IDENTITY_SCALAR_FIELDS) {
    if (!next.fields[key]) continue;
    if (fieldFailsIdentityCheck(next, place, key)) delete next.fields[key];
  }
  return next;
}

function identityEvidenceBlob(dossier = {}, place = {}) {
  const chunks = [];
  for (const page of dossier.pages || []) {
    if (evidencePageMatchesPlace(page, place, dossier) && !pageNamesOtherVenue(page, place)) {
      chunks.push(page.text || '');
    }
  }
  for (const row of dossier.braveResults || []) {
    if (text(row.snippet).length >= 12 && evidencePageMatchesPlace({ text: row.snippet, url: row.url }, place, dossier)) {
      chunks.push(row.snippet);
    }
  }
  return chunks.join('\n');
}

function firstPageIdForNeedle(dossier = {}, needle = '') {
  const want = norm(needle);
  if (!want) return null;
  for (let i = 0; i < (dossier.pages || []).length; i += 1) {
    if (norm(dossier.pages[i].text).includes(want)) return dossierPageId(i);
  }
  return dossier.pages?.length ? dossierPageId(0) : null;
}

function setScalarField(dossier, key, value, pageId) {
  if (!text(value)) return dossier;
  const fields = { ...(dossier.fields || {}) };
  if (text(fields[key]?.value ?? fields[key])) return dossier;
  const pid = pageId || firstPageIdForNeedle(dossier, value);
  if (!pid) return dossier;
  fields[key] = {
    value,
    claims: [{ text: value, pages: [pid], supported: true }],
  };
  return { ...dossier, fields };
}

export function hydrateScalarFieldsFromEvidence(dossier = {}, place = {}) {
  if (isFlightOrCarOrDecision(place)) return dossier;
  const blob = identityEvidenceBlob(dossier, place);
  if (!blob) return dossier;
  const extracted = extractContactFieldsFromBlob(blob);
  let next = { ...dossier };
  if (extracted.phone) next = setScalarField(next, 'phone', text(extracted.phone), firstPageIdForNeedle(next, extracted.phone));
  if (extracted.hours && !next.fields?.hours) next = setScalarField(next, 'hours', text(extracted.hours), firstPageIdForNeedle(next, extracted.hours));
  if (extracted.website && !next.fields?.website) next = setScalarField(next, 'website', text(extracted.website), firstPageIdForNeedle(next, extracted.website));
  return next;
}

function bookingNarrativeFromPlace(place = {}) {
  const record = place.sourceRecord || {};
  const category = norm(place.category || record.category);
  const longDetails = text(record.longDetails || record.details || record.description || place.description);
  const summary = text(record.summary || place.summary);
  const itinerary = text(record.itineraryNote || record.itinerary_note);
  if (category === 'flight' || category === 'car') {
    const body = longDetails || summary;
    if (!body) return null;
    const note = itinerary || text(body.split(';')[0], 280);
    return { summary: text(summary || body.split(';').slice(0, 2).join(';'), 500), description: body, itineraryNote: note };
  }
  return null;
}

function seedBookingNarrativeFields(dossier = {}, place = {}) {
  const seed = bookingNarrativeFromPlace(place);
  if (!seed) return dossier;
  let next = { ...dossier, fields: { ...(dossier.fields || {}) } };
  const pid = dossier.pages?.length ? dossierPageId(0) : 'p1';
  for (const [key, value] of Object.entries(seed)) {
    if (text(next.fields[key]?.value ?? next.fields[key])) continue;
    next.fields[key] = {
      value,
      claims: [{ text: value.slice(0, 120), pages: [pid], supported: true }],
    };
  }
  return next;
}

export function syncDossierRequiredShortcomings(dossier = {}, place = {}) {
  const counts = computeDossierFieldCounts(dossier, place);
  const pending = new Set(fieldsNeedingCapture(counts, place));
  let shortcomings = Array.isArray(dossier.shortcomings) ? [...dossier.shortcomings] : [];
  shortcomings = shortcomings.filter((row) => {
    const status = counts[row.field]?.status;
    return status && status !== 'ok';
  });
  const have = new Set(shortcomings.map((s) => s.field));
  for (const field of pending) {
    if (have.has(field)) continue;
    shortcomings = recordFieldShortcoming(
      { shortcomings },
      field,
      field === 'reviews' && counts.reviews?.status === 'short'
        ? 'limited number of reviews'
        : 'required field still missing after evidence pass',
    );
  }
  return {
    ...dossier,
    fieldCounts: counts,
    shortcomings,
    missingFields: deriveMissingFieldsFromShortcomings(shortcomings),
  };
}

export function normalizeDossierEvidence(dossier = {}, place = {}) {
  if (!placeSupportsDossierReviews(place)) {
    const shortcomings = (Array.isArray(dossier.shortcomings) ? dossier.shortcomings : [])
      .filter((row) => row.field !== 'reviews');
    return syncDossierRequiredShortcomings({
      ...dossier,
      reviews: [],
      reviewSet: [],
      reviewExcerpts: [],
      reviewsRead: 0,
      reviewSources: [],
      shortcomings,
    }, place);
  }
  let next = stripMisattributedDossierFields(dossier, place);
  next = hydrateScalarFieldsFromEvidence(next, place);
  next = seedBookingNarrativeFields(next, place);
  return syncDossierRequiredShortcomings(next, place);
}
