import {
  applyHoursAndHappyHourFindings,
  HAPPY_HOUR_SUBFIELDS,
  HOURS_NOT_FOUND,
  NO_HAPPY_HOUR_FOUND,
} from './dossier-hours-fields.mjs';
import { applyDossierRatingsAndReviews } from './thing-dossier-ratings-copy.mjs';
import { placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import { dossierPagesVerified, reviewSourceHost } from './thing-evidence-dossier.mjs';

export { applyDossierRatingsAndReviews } from './thing-dossier-ratings-copy.mjs';
export { dossierPageIdForUrl, ensureBraveSnippetCitationPages } from './dossier-brave-snippet-pages.mjs';

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
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

function pageHashBundle(pageByUrl, url = '') {
  const urls = String(url || '').split(',').map((row) => row.trim()).filter(Boolean);
  return urls.map((row) => pageByUrl.get(row)).filter(Boolean).join('|');
}

export function computeDossierFieldHashes(dossier = {}) {
  const hashes = {};
  const sources = {};
  const pageByUrl = new Map((dossier.pages || []).map((page) => [page.url, page.sha256]));
  const track = (field, claim) => {
    if (!field || !claim?.url) return;
    const hash = pageHashBundle(pageByUrl, claim.url);
    if (!hash) return;
    hashes[field] = hash;
    sources[field] = claim.url;
  };
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'itineraryNote', ...HAPPY_HOUR_SUBFIELDS]) {
    track(key, dossier.fields?.[key]);
  }
  track('rating', dossier.ratingEvidence);
  for (const [index, item] of (dossier.knownFor || []).entries()) {
    track(`knownFor:${index}`, item);
  }
  const reviewUrls = [...new Set([...(dossier.reviewExcerpts || []), ...(dossier.reviews || [])]
    .flatMap((row) => String(row.url || '').split(',')).map((row) => row.trim()).filter(Boolean))];
  if (reviewUrls.length && Array.isArray(dossier.reviews) && dossier.reviews.length === 4) {
    const bundle = reviewUrls.map((url) => pageByUrl.get(url)).filter(Boolean).join('|');
    if (bundle) {
      hashes.reviews = bundle;
      sources.reviews = reviewUrls.join(',');
    }
  }
  return { hashes, sources };
}

export function dossierFieldHashesStale(persisted = {}, merged = {}) {
  if (!persisted.fieldHashes || typeof persisted.fieldHashes !== 'object') return true;
  const pageByUrl = new Map((merged.pages || []).map((page) => [page.url, page.sha256]));
  return Object.entries(persisted.fieldHashes).some(([field, hash]) => {
    const url = persisted.fieldSources?.[field];
    if (!url) return true;
    return pageHashBundle(pageByUrl, url) !== hash;
  });
}

const DOSSIER_REBUILD_GROUPS = [
  'summary',
  'description',
  'price',
  'hours',
  'happyHourDetails',
  'rating',
  'reviews',
  'knownFor',
  'itineraryNote',
];

export function dossierRebuildFields(persisted = {}, merged = {}, {
  maxAgeExpired = false,
  changedUrls = [],
} = {}) {
  const all = new Set(DOSSIER_REBUILD_GROUPS);
  if (!persisted?.fieldHashes || maxAgeExpired) return all;
  const pageByUrl = new Map((merged.pages || []).map((page) => [page.url, page.sha256]));
  const changed = new Set(changedUrls);
  const stale = new Set();
  for (const [field, hash] of Object.entries(persisted.fieldHashes)) {
    const url = persisted.fieldSources?.[field];
    if (!url || pageHashBundle(pageByUrl, url) !== hash) {
      if (field === 'reviews' || field.startsWith('knownFor:')) stale.add(field.startsWith('knownFor:') ? 'knownFor' : field);
      else if (HAPPY_HOUR_SUBFIELDS.includes(field)) stale.add('happyHourDetails');
      else stale.add(field);
    }
  }
  for (const url of changed) {
    for (const [field, source] of Object.entries(persisted.fieldSources || {})) {
      const sources = String(source || '').split(',').map((row) => row.trim()).filter(Boolean);
      if (sources.includes(url)) {
        if (field === 'reviews') stale.add('reviews');
        else if (field.startsWith('knownFor:')) stale.add('knownFor');
        else if (HAPPY_HOUR_SUBFIELDS.includes(field)) stale.add('happyHourDetails');
        else stale.add(field);
      }
    }
  }
  return stale;
}

export function mergeSelectiveDossierFindings(persisted = {}, built = {}, rebuildFields = new Set()) {
  const fields = rebuildFields instanceof Set ? rebuildFields : new Set(rebuildFields);
  if (!persisted || fields.size === 0) return built;
  if (fields.size >= DOSSIER_REBUILD_GROUPS.length) return built;
  const next = JSON.parse(JSON.stringify(persisted));
  next.pages = built.pages;
  next.attempts = built.attempts;
  next.thing = built.thing || next.thing;
  if (fields.has('knownFor')) next.knownFor = built.knownFor;
  if (fields.has('rating')) {
    next.rating = built.rating;
    next.reviewsAvailable = built.reviewsAvailable;
    next.ratingEvidence = built.ratingEvidence;
    next.ratingMix = built.ratingMix;
  }
  if (fields.has('reviews')) {
    next.reviews = built.reviews;
    next.reviewExcerpts = built.reviewExcerpts;
    next.reviewsRead = built.reviewsRead;
    next.reviewSet = built.reviewSet;
    next.reviewSources = built.reviewSources;
  }
  next.fields = { ...(next.fields || {}) };
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'itineraryNote', ...HAPPY_HOUR_SUBFIELDS]) {
    if (!fields.has(key) && !(key.startsWith('happyHour') && fields.has('happyHourDetails'))) continue;
    if (built.fields?.[key]) next.fields[key] = built.fields[key];
    else delete next.fields[key];
  }
  if (fields.has('happyHourDetails')) {
    if (built.fields?.happyHour) next.fields.happyHour = built.fields.happyHour;
    else delete next.fields.happyHour;
  }
  return next;
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
    && norm(rating.quote).includes(String(average))
    && norm(rating.quote).replace(/,/g, '').includes(String(count))) {
    next.rating = average * 5 / scale;
    next.reviewsAvailable = count;
    next.ratingEvidence = rating;
    if (Array.isArray(rating.starMix) && rating.starMix.length === 5
      && rating.starMix.every((n) => Number.isInteger(n) && n >= 0)
      && rating.starMix.reduce((a, b) => a + b, 0) === count) next.ratingMix = rating.starMix;
  }
  for (const key of ['summary', 'description', 'price', 'itineraryNote']) {
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
    if (key === 'description' && !next.reviewsRead) {
      next.fields[key].value = `${String(claim.value).trim()}\n${NO_REVIEWS_FLAG}`;
      next.fields[key].noReviewsFlag = true;
    }
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
  if (valid || dossierReviewsWritable(dossier)) {
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
  const next = { ...record, evidenceDossier: dossier };
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
      if (key === 'happyHourDetails' && claim.explicitNone === true) {
        next.happyHourDetails = NO_HAPPY_HOUR_FOUND;
        next.happyHour = false;
        missing.delete('happyHourDetails');
        continue;
      }
      if (!claimsSupported(dossier, claim)) continue;
      if (key === 'price') next[key] = Number(claim.value);
      else if (['lat', 'lng'].includes(key)) next[key] = Number(claim.value);
      else next[key] = scalarFieldValue(claim.value ?? claim);
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
    if (next.googleRating || next.yelpRating || next.thirdPartyRating || next.otherRatingSites?.length) {
      missing.delete('ratings');
    }
  }
  next.missingFields = useShortcomingMissing
    ? [...new Set(dossier.shortcomings.map((s) => s.field).filter(Boolean))]
    : [...missing];
  next.xaiRatingsFetched = dossierReviewsValid(dossier);
  return writeDossierReviews(next, dossier, { useShortcomingMissing });
}
