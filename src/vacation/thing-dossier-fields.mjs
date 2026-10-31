import {
  applyHoursAndHappyHourFindings,
  HAPPY_HOUR_SUBFIELDS,
  HOURS_NOT_FOUND,
  NO_HAPPY_HOUR_FOUND,
} from './dossier-hours-fields.mjs';
import { applyDossierRatingsAndReviews } from './thing-dossier-ratings-copy.mjs';
import { dossierThingTitle, placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import { dossierScalarClaimRejected } from './dossier-evidence-hydrate.mjs';
import { dossierPagesVerified, reviewSourceHost } from './thing-evidence-dossier.mjs';
import { applySourcedHotelDescriptionToRecord } from './xai-sourced-hotel-description.mjs';

export { applyDossierRatingsAndReviews } from './thing-dossier-ratings-copy.mjs';
export { dossierPageIdForUrl, ensureBraveSnippetCitationPages } from './dossier-brave-snippet-pages.mjs';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

function nameKey(value) {
  return norm(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function descriptionNamesThing(text = '', thing = '') {
  const body = nameKey(text);
  const names = [thing, String(thing).split(/\s+[-–—|:]\s+/)[0]].map(nameKey).filter(Boolean);
  return names.some((name) => body.includes(name) || body.includes(name.replace(/^the /, '')));
}

export function fitDescriptionWords(text = '', max = 120) {
  const value = String(text).trim();
  if (words(value).length <= max) return value;
  const sentences = value.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [value];
  while (sentences.length > 1 && words(sentences.join(' ')).length > max) sentences.pop();
  return sentences.join(' ').replace(/\s+/g, ' ').trim();
}

const BROAD_KNOWN_FOR = /\b(dining|experience|atmosphere|ambiance|ambience|vibes?|location|hospitality|food|cuisine|menu|drinks|nightlife|views?|setting|decor|service|staff|value|scene|energy)\b/i;
export function knownForSpecific(item = '') {
  const text = norm(item);
  if (!text || words(text).length > 6) return false;
  return !BROAD_KNOWN_FOR.test(text);
}

export const MIN_REVIEWS_READ = 10;
export const MIN_REVIEW_SOURCES = 3;
export const limitedReviewsLabel = (n) => `limited reviews found (${n})`;

function words(value) {
  return norm(value).split(/\s+/).filter(Boolean);
}

function shingles(value) {
  const tokens = words(value);
  return new Set(tokens.slice(4).map((_, index) => tokens.slice(index, index + 5).join(' ')));
}

function cited(dossier, claim) {
  return claim && typeof claim.quote === 'string' && norm(claim.quote).length >= 8
    && dossier.pages.some((page) => page.url === claim.url && norm(page.text).includes(norm(claim.quote)));
}

export const NO_REVIEWS_FLAG = 'No reviews were found for this place.';

export function dossierPageId(index) {
  return `p${index + 1}`;
}

export function publicReviewFieldKeys() {
  const keys = [];
  for (let i = 1; i <= 4; i += 1) {
    for (const suffix of ['', 'Rating', 'Source', 'Url', 'Cites', 'Claims', 'Label', 'Composite', 'CompositeLabel']) {
      keys.push(`review${i}${suffix}`);
    }
  }
  keys.push('reviewsLabel', 'reviewSources', 'review_totals', 'reviewTotals');
  return keys;
}

export function dossierPageById(dossier = {}, id = '') {
  const match = /^p(\d+)$/.exec(String(id || '').trim());
  return match ? (dossier.pages || [])[Number(match[1]) - 1] || null : null;
}

export function reviewSetPageIdMap(dossier = {}) {
  const map = new Map();
  for (const row of dossier.reviewSet || []) {
    const reviewId = String(row?.id || '').trim();
    const pageId = String(row?.page || '').trim();
    if (/^r\d+$/.test(reviewId) && /^p\d+$/.test(pageId)) map.set(reviewId, pageId);
  }
  return map;
}

export function resolveClaimCitationPages(dossier = {}, pageIds = []) {
  const ids = Array.isArray(pageIds) ? pageIds : [];
  if (!ids.length) return [];
  const reviewPages = reviewSetPageIdMap(dossier);
  const resolved = [];
  for (const raw of ids) {
    const token = String(raw || '').trim();
    if (!token) return null;
    if (/^p\d+$/.test(token)) resolved.push(token);
    else if (/^r\d+$/.test(token)) {
      const page = reviewPages.get(token);
      if (!page) return null;
      resolved.push(page);
    } else return null;
  }
  return [...new Set(resolved)];
}

export function claimCitesKnownPages(dossier, claim) {
  const pages = resolveClaimCitationPages(dossier, claim?.pages);
  return Boolean(claim && norm(claim.text) && pages && pages.length
    && pages.every((id) => dossierPageById(dossier, id)));
}

export function claimsSupported(dossier, owner) {
  const claims = owner?.claims;
  return Array.isArray(claims) && claims.length > 0
    && claims.every((claim) => claimCitesKnownPages(dossier, claim) && claim.supported === true);
}

function claimUrls(dossier, owner) {
  return [...new Set((owner?.claims || []).flatMap((claim) => claim.pages || [])
    .map((id) => dossierPageById(dossier, id)?.url).filter(Boolean))].join(',');
}

const RATING_QUOTE_MARK = /\b(?:stars?|rated|rating|reviews?|out of|\/\s*5)\b/i;

export function ratingQuoteSupportsAggregate(quote = '', average, count) {
  const q = norm(quote);
  if (!q || q.length < 6 || !RATING_QUOTE_MARK.test(q)) return false;
  const avg = Number(average);
  const cnt = Number(count);
  if (!(avg > 0) || !(Number.isInteger(cnt) && cnt > 0)) return false;
  const avgEsc = String(avg).replace('.', '\\.');
  if (!new RegExp(`(^|[^\\d.])${avgEsc}([^\\d.]|$)`).test(q)) return false;
  const digits = String(cnt);
  const compact = q.replace(/,/g, '');
  if (!compact.includes(digits)) return false;
  if (/\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/.test(q) && !/\breviews?\b/i.test(q)) return false;
  return true;
}

export function prepareDossierFindings(dossier, findings = {}) {
  const next = { ...dossier, fields: {}, reviews: [], knownFor: [], reviewsRead: 0 };
  if (!dossierPagesVerified(dossier)) return next;
  next.knownFor = (Array.isArray(findings.knownFor) ? findings.knownFor : [])
    .filter((item) => norm(item?.item) && knownForSpecific(item.item) && claimsSupported(dossier, item))
    .map((item) => ({ ...item, url: claimUrls(dossier, item) }));
  const excerpts = Array.isArray(dossier.reviewSet) ? dossier.reviewSet : (Array.isArray(findings.reviewExcerpts) ? findings.reviewExcerpts : [])
    .filter((item) => claimCitesKnownPages(dossier, item) && item.supported === true)
    .map((item) => ({ ...item, url: claimUrls(dossier, { claims: [item] }) }));
  next.reviewExcerpts = [...new Map(excerpts.map((item) => [norm(item.text), item])).values()];
  const codeReviewCount = Number(dossier.fieldCounts?.reviews?.count);
  next.reviewsRead = Number.isFinite(codeReviewCount) ? codeReviewCount : next.reviewExcerpts.length;
  next.reviewSources = [...new Set(next.reviewExcerpts.flatMap((item) => String(item.url || '').split(','))
    .map(reviewSourceHost).filter(Boolean))];
  const braveRating = (dossier.pages || []).find((page) => page.via === 'brave' && page.braveRating)?.braveRating;
  const writerRating = findings.rating;
  const writerOk = writerRating && cited(dossier, writerRating);
  const rating = writerOk || !braveRating ? writerRating : { ...braveRating, provider: 'brave' };
  const average = Number(rating?.average);
  const count = Number(rating?.count);
  const scale = Number(rating?.scaleMax);
  if (cited(dossier, rating) && average > 0 && [5, 10].includes(scale) && average <= scale
    && Number.isInteger(count) && count > 0
    && ratingQuoteSupportsAggregate(rating.quote, average, count)) {
    next.rating = average * 5 / scale;
    next.reviewsAvailable = count;
    next.ratingEvidence = rating;
    if (Array.isArray(rating.starMix) && rating.starMix.length === 5
      && rating.starMix.every((n) => Number.isInteger(n) && n >= 0)
      && rating.starMix.reduce((a, b) => a + b, 0) === count) next.ratingMix = rating.starMix;
  }
  for (const key of ['summary', 'description', 'price', 'itineraryNote', 'neighborhood']) {
    const claim = findings[key];
    if (!claim || !norm(claim.value) || !claimsSupported(dossier, claim)) continue;
    if (key === 'itineraryNote' && norm(claim.value).length > 280) continue;
    if (key === 'price') {
      const value = Number(claim.value);
      if (!(value > 0) || !norm(claim.unit)) continue;
    }
    if (key === 'description' && (words(claim.value).length < 40 || words(claim.value).length > 120
      || !descriptionNamesThing(claim.value, dossier.thing))) continue;
    next.fields[key] = { ...claim, url: claimUrls(dossier, claim) };
    if (key === 'description' && placeSupportsDossierReviews(dossier) && !next.reviewsRead) {
      next.fields[key].value = `${String(claim.value).trim()}\n${NO_REVIEWS_FLAG}`;
      next.fields[key].noReviewsFlag = true;
    } else if (key === 'description' && placeSupportsDossierReviews(dossier) && (next.reviewsRead < MIN_REVIEWS_READ
      || dossier.fieldCounts?.reviews?.status === 'short')) {
      next.fields[key].value = `${String(claim.value).trim()}\nA limited number of reviews were found for this place.`;
    }
  }
  for (const key of ['lat', 'lng']) {
    const claim = findings[key];
    const value = Number(claim?.value ?? claim);
    if (!Number.isFinite(value) || !claimsSupported(dossier, claim)) continue;
    next.fields[key] = { ...claim, value, url: claimUrls(dossier, claim) };
  }
  const reviewHosts = /yelp|tripadvisor|google\.|reddit|facebook|instagram/i;
  const officialUrl = (dossier.pages || []).find((page) => page.url && !reviewHosts.test(page.url))?.url
    || dossier.pages?.[0]?.url
    || '';
  applyHoursAndHappyHourFindings(next, dossier, findings, { officialUrl });
  const raw = Array.isArray(findings.reviews) ? findings.reviews : [];
  const tenPoint = raw.length && raw.every((r) => Number(r?.rating) <= 10) && raw.some((r) => Number(r?.rating) > 5);
  next.reviews = raw.map((review) => {
    const claims = (review?.claims || []).filter((claim) => claimCitesKnownPages(dossier, claim) && claim.supported === true);
    const dropped = (review?.claims || []).length - claims.length;
    const rating = tenPoint ? Math.max(1, Math.round(Number(review.rating) / 2)) : review?.rating;
    return { ...review, rating, claims, droppedClaims: dropped, url: claimUrls(dossier, { claims }) };
  });
  return next;
}

export function dossierReviewBreadthOk(dossier = {}) {
  return (dossier.reviewsRead || 0) >= MIN_REVIEWS_READ && (dossier.reviewSources || []).length >= MIN_REVIEW_SOURCES;
}

export function dossierRepresentativeReviews(dossier = {}) {
  return /^Representative reviews written from \d+ reviews$/.test(String(dossier.reviewsLabel || ''))
    && dossierPagesVerified(dossier) && dossier.reviews?.length === 4
    && dossier.reviews.every((review) => review?.representative === true && String(review.text || '').trim()
      && review.claims?.length > 0 && claimsSupported(dossier, review));
}

function dossierReviewsWritable(dossier = {}) {
  return dossierPagesVerified(dossier) && dossier.reviews?.length === 4
    && dossier.reviews.every((review) => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5
      && claimsSupported(dossier, review));
}

function dossierReviewsValid(dossier = {}) {
  if (!dossierPagesVerified(dossier) || !(dossier.rating > 0 && dossier.rating <= 5)
    || dossier.pages.length < 3 || !dossierReviewBreadthOk(dossier)
    || !dossier.knownFor?.length || dossier.reviews?.length !== 4) return false;
  const description = shingles([dossier.fields?.summary?.value, dossier.fields?.description?.value].join(' '));
  const seen = [];
  let verdict = false;
  let total = 0;
  for (const review of dossier.reviews) {
    if (words(review.text).length < 25 || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5
      || !claimsSupported(dossier, review)) return false;
    const sh = shingles(review.text);
    if (seen.some((prev) => [...sh].some((part) => prev.has(part)))) return false;
    const copied = new Set([...sh].filter((part) => description.has(part)).flatMap((part) => part.split(' ')));
    if (words(review.text).length - copied.size < 12) return false;
    if (dossier.knownFor.some((item) => norm(review.text).includes(norm(item.item))) && review.verdict === true) verdict = true;
    seen.push(sh);
    total += review.rating;
  }
  return verdict && Math.abs(total / 4 - dossier.rating) <= 0.5;
}

function scalarFieldValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value.value ?? value.text ?? '').trim();
  return String(value).trim();
}

function clearPublicReviewFields(record = {}, { persistNull = false } = {}) {
  for (const key of publicReviewFieldKeys()) {
    if (persistNull) record[key] = null;
    else delete record[key];
  }
}

export function writeDossierReviews(record = {}, dossier = {}, { useShortcomingMissing = false } = {}) {
  if (!placeSupportsDossierReviews({ category: record.category })) {
    clearPublicReviewFields(record);
    return record;
  }
  clearPublicReviewFields(record);
  const missing = useShortcomingMissing
    ? new Set()
    : new Set(Array.isArray(record.missingFields) ? record.missingFields : []);
  if (!useShortcomingMissing) missing.add('reviews');
  const valid = dossierReviewsValid(dossier);
  if (dossierRepresentativeReviews(dossier)) {
    record.reviewsLabel = dossier.reviewsLabel;
    dossier.reviews.forEach((review, index) => {
      const key = `review${index + 1}`;
      record[key] = review.text;
      if (Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5) record[`${key}Rating`] = String(review.rating);
      if (review.source) record[`${key}Source`] = review.source;
      record[`${key}Cites`] = [...new Set(review.claims.flatMap((claim) => claim.pages))];
      record[`${key}Claims`] = review.claims.map((claim) => ({ text: claim.text, pages: [...claim.pages], supported: claim.supported === true }));
      record[`${key}Label`] = record.reviewsLabel;
      record[`${key}CompositeLabel`] = record.reviewsLabel;
    });
    missing.delete('reviews');
  } else if (valid || dossierReviewsWritable(dossier)) {
    const readCount = Number(dossier.fieldCounts?.reviews?.count ?? dossier.reviewsRead ?? 0);
    record.reviewsLabel = valid && dossierReviewBreadthOk(dossier)
      ? `Representative review written from ${readCount} reviews`
      : limitedReviewsLabel(readCount);
    dossier.reviews.forEach((review, index) => {
      const key = `review${index + 1}`;
      record[key] = review.text;
      record[`${key}Rating`] = String(review.rating);
      record[`${key}Cites`] = [...new Set(review.claims.flatMap((claim) => claim.pages))];
      record[`${key}Claims`] = review.claims.map((claim) => ({ text: claim.text, pages: [...claim.pages], supported: claim.supported === true }));
      record[`${key}Label`] = record.reviewsLabel;
      record[`${key}CompositeLabel`] = record.reviewsLabel;
    });
    if (valid) missing.delete('reviews');
    else if (dossierReviewsWritable(dossier)) {
      const limited = (dossier.shortcomings || []).some((s) => s.field === 'reviews' && /limited number of reviews/i.test(String(s.reason)));
      if (limited) missing.delete('reviews');
    }
  }
  if (!record.review1 && placeSupportsDossierReviews({ category: record.category })) {
    clearPublicReviewFields(record, { persistNull: true });
    if (!useShortcomingMissing) missing.add('reviews');
    const shortcomings = Array.isArray(record.dataShortcomings) ? [...record.dataShortcomings] : [];
    if (!shortcomings.some((row) => row.field === 'reviews')) {
      shortcomings.push({
        field: 'reviews',
        reason: 'representative reviews could not be verified from saved evidence',
      });
    }
    record.dataShortcomings = shortcomings;
  }
  if (!useShortcomingMissing) record.missingFields = [...missing];
  return record;
}

export function applyDossierFields(record = {}, dossier = {}) {
  const narrativeFallback = text(record.longDetails || record.details);
  const next = { ...record, evidenceDossier: dossier };
  if (String(record.category || '').toLowerCase() === 'flight') {
    next.title = dossierThingTitle({ ...record, title: record.title || record.name || dossier.thing });
    if (record.name) next.name = next.title;
  }
  const useShortcomingMissing = Array.isArray(dossier.shortcomings) && dossier.shortcomings.length > 0;
  const missing = new Set(
    useShortcomingMissing ? dossier.shortcomings.map((s) => s.field).filter(Boolean) : [],
  );
  if (!useShortcomingMissing) {
    for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'ratings', 'itineraryNote']) missing.add(key);
  }
  for (const key of ['summary', 'description', 'longDetails', 'details', 'price', 'hours', 'happyHourDetails',
    'happyHour', 'happyHourDays', 'happyHourTimes', 'happyHourDeals', 'googleRating', 'googleReviewCount',
    'googleRatingSourceUrl', 'yelpRating', 'yelpReviewCount', 'yelpRatingSourceUrl', 'thirdPartyRating',
    'thirdPartyReviewCount', 'thirdPartySource', 'ratingCount', 'ratingMix', 'otherRatingSites', 'reviewThemes',
    'websiteFlavour', 'itineraryNote', 'address', 'phone', 'website', 'neighborhood', 'lat', 'lng', 'knownFor',
    'reviewSources', 'dataShortcomings']) delete next[key];
  next.summarySourceUrls = [];
  if (Array.isArray(dossier.shortcomings) && dossier.shortcomings.length) {
    next.dataShortcomings = dossier.shortcomings;
  }
  if (dossierPagesVerified(dossier)) {
    next.summarySourceUrls = dossier.pages.map((page) => page.url);
    for (const [key, claim] of Object.entries(dossier.fields || {})) {
      if (key === 'happyHour') continue;
      const scalarKeys = ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'itineraryNote',
        'address', 'phone', 'website', 'neighborhood', 'lat', 'lng', ...HAPPY_HOUR_SUBFIELDS];
      if (!scalarKeys.includes(key)) continue;
      if (key === 'hours' && claim.gap === true) {
        next.hours = HOURS_NOT_FOUND;
        continue;
      }
      if (dossierScalarClaimRejected(key, claim)) {
        missing.add(key);
        continue;
      }
      if (key === 'happyHourDetails' && claim.explicitNone === true) {
        next.happyHourDetails = NO_HAPPY_HOUR_FOUND;
        next.happyHour = false;
        missing.delete('happyHourDetails');
        continue;
      }
      if (!claimsSupported(dossier, claim)) continue;
      if (key === 'price') {
        const value = Number(claim.value);
        if (!Number.isFinite(value)) continue;
        next[key] = value;
      }
      else if (['lat', 'lng'].includes(key)) next[key] = Number(claim.value);
      else {
        const scalar = scalarFieldValue(claim.value ?? claim);
        if (key === 'happyHourDetails' && /^false$/i.test(scalar)) continue;
        next[key] = scalar;
      }
      missing.delete(key);
    }
    if (Array.isArray(dossier.knownFor) && dossier.knownFor.length) {
      next.knownFor = dossier.knownFor.map((row) => row.item).filter(Boolean);
      missing.delete('knownFor');
    }
    if (Array.isArray(dossier.reviewSources) && dossier.reviewSources.length) {
      next.reviewSources = [...dossier.reviewSources];
    }
    if (next.description) next.longDetails = next.description;
    if (next.price) next.priceUnit = dossier.fields.price.unit;
    if (next.happyHourDetails && next.happyHourDetails !== NO_HAPPY_HOUR_FOUND) next.happyHour = true;
    if (dossier.fields?.happyHour?.value === false) next.happyHour = false;
    if (dossier.ratingEvidence && cited(dossier, dossier.ratingEvidence)) {
      next.thirdPartyRating = String(dossier.rating);
      next.thirdPartyReviewCount = String(dossier.reviewsAvailable);
      next.ratingCount = dossier.reviewsAvailable;
      if (Array.isArray(dossier.ratingMix) && dossier.ratingMix.length === 5) {
        next.ratingMix = Object.fromEntries(dossier.ratingMix.map((value, index) => [String(index + 1), value]));
      } else if (dossier.ratingMix && typeof dossier.ratingMix === 'object') {
        next.ratingMix = dossier.ratingMix;
      }
      missing.delete('ratings');
    }
    applyDossierRatingsAndReviews(next, dossier);
    if (!placeSupportsDossierReviews(next)) delete next.reviewThemes;
    if (next.googleRating || next.yelpRating || next.thirdPartyRating || next.otherRatingSites?.length) {
      missing.delete('ratings');
    }
  }
  if (
    narrativeFallback.split(/\s+/).filter(Boolean).length >= 40
    && !text(next.description)
    && !text(next.longDetails)
  ) {
    next.description = narrativeFallback;
    next.longDetails = narrativeFallback;
    missing.delete('description');
  }
  next.missingFields = [...missing];
  if (Array.isArray(next.dataShortcomings)) {
    next.dataShortcomings = next.dataShortcomings.filter((row) => missing.has(row.field));
  }
  next.xaiRatingsFetched = dossierReviewsValid(dossier);
  const reviewed = writeDossierReviews(next, dossier, { useShortcomingMissing });
  return applySourcedHotelDescriptionToRecord(reviewed, {
    title: reviewed.title || dossier.thing,
    category: reviewed.category,
    address: reviewed.address,
  });
}

export {
  computeDossierFieldHashes,
  dossierFieldHashesStale,
  dossierReviewsEvidenceFresh,
  dossierRebuildFields,
  mergeSelectiveDossierFindings,
} from './thing-dossier-rebuild.mjs';
