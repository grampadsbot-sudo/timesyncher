import { dossierPagesVerified } from './thing-evidence-dossier.mjs';

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

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

export function prepareDossierFindings(dossier, findings = {}) {
  const next = { ...dossier, fields: {}, reviews: [], knownFor: [], reviewsRead: 0 };
  if (!dossierPagesVerified(dossier)) return next;
  next.knownFor = (Array.isArray(findings.knownFor) ? findings.knownFor : [])
    .filter((item) => cited(dossier, item) && norm(item.item) && norm(item.quote).includes(norm(item.item)));
  const excerpts = (Array.isArray(findings.reviewExcerpts) ? findings.reviewExcerpts : [])
    .filter((item) => cited(dossier, item) && words(item.quote).length >= 12);
  next.reviewExcerpts = [...new Map(excerpts.map((item) => [norm(item.quote), item])).values()];
  next.reviewsRead = next.reviewExcerpts.length;
  const rating = findings.rating;
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
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails']) {
    const claim = findings[key];
    if (!cited(dossier, claim) || !norm(claim.value)) continue;
    if (key === 'price') {
      const value = Number(claim.value);
      if (!(value > 0) || !norm(claim.quote).replace(/,/g, '').includes(String(value)) || !norm(claim.unit)) continue;
    }
    if (key === 'description' && (words(claim.value).length < 40 || words(claim.value).length > 120
      || !norm(claim.value).includes(norm(dossier.thing)))) continue;
    next.fields[key] = claim;
  }
  next.reviews = Array.isArray(findings.reviews) ? findings.reviews : [];
  return next;
}

function dossierReviewsValid(dossier = {}) {
  if (!dossierPagesVerified(dossier) || !(dossier.rating > 0 && dossier.rating <= 5)
    || dossier.pages.length < 3 || dossier.reviewsRead < Math.min(20, dossier.reviewsAvailable || 20)
    || !dossier.knownFor?.length || dossier.reviews?.length !== 4) return false;
  const description = shingles([dossier.fields?.summary?.value, dossier.fields?.description?.value].join(' '));
  const seen = [];
  let verdict = false;
  let total = 0;
  for (const review of dossier.reviews) {
    if (words(review.text).length < 25 || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5
      || !Array.isArray(review.cites) || !review.cites.length) return false;
    if (review.cites.some((cite) => !dossier.reviewExcerpts?.some((excerpt) => norm(excerpt.quote).includes(norm(cite))) || norm(cite).length < 8)) return false;
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

export function writeDossierReviews(record = {}, dossier = {}) {
  for (let i = 1; i <= 4; i += 1) {
    for (const suffix of ['', 'Rating', 'Source', 'Url', 'Cites', 'Label', 'Composite', 'CompositeLabel']) delete record[`review${i}${suffix}`];
  }
  delete record.reviewsLabel;
  const missing = new Set(record.missingFields || []);
  missing.add('reviews');
  if (dossierReviewsValid(dossier)) {
    record.reviewsLabel = `Representative review written from ${dossier.reviewsRead} reviews`;
    dossier.reviews.forEach((review, index) => {
      const key = `review${index + 1}`;
      record[key] = review.text;
      record[`${key}Rating`] = String(review.rating);
      record[`${key}Cites`] = [...review.cites];
      record[`${key}Label`] = record.reviewsLabel;
      record[`${key}CompositeLabel`] = record.reviewsLabel;
    });
    missing.delete('reviews');
  }
  record.missingFields = [...missing];
  return record;
}

export function applyDossierFields(record = {}, dossier = {}) {
  const next = { ...record, evidenceDossier: dossier };
  const missing = new Set(next.missingFields || []);
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'ratings']) missing.add(key);
  for (const key of ['summary', 'description', 'longDetails', 'details', 'price', 'hours', 'happyHourDetails',
    'happyHour', 'happyHourDays', 'happyHourTimes', 'happyHourDeals', 'googleRating', 'googleReviewCount',
    'googleRatingSourceUrl', 'yelpRating', 'yelpReviewCount', 'yelpRatingSourceUrl', 'thirdPartyRating',
    'thirdPartyReviewCount', 'thirdPartySource', 'ratingCount', 'ratingMix', 'otherRatingSites', 'reviewThemes', 'websiteFlavour']) delete next[key];
  next.summarySourceUrls = [];
  if (dossierPagesVerified(dossier)) {
    next.summarySourceUrls = dossier.pages.map((page) => page.url);
    for (const [key, claim] of Object.entries(dossier.fields || {})) {
      if (!['summary', 'description', 'price', 'hours', 'happyHourDetails'].includes(key) || !cited(dossier, claim)) continue;
      next[key] = key === 'price' ? Number(claim.value) : claim.value;
      missing.delete(key);
    }
    if (next.description) next.longDetails = next.description;
    if (next.price) next.priceUnit = dossier.fields.price.unit;
    if (next.happyHourDetails) next.happyHour = true;
    if (dossier.ratingEvidence && cited(dossier, dossier.ratingEvidence)) {
      next.thirdPartyRating = String(dossier.rating);
      next.thirdPartyReviewCount = String(dossier.reviewsAvailable);
      next.ratingCount = dossier.reviewsAvailable;
      missing.delete('ratings');
    }
  }
  next.missingFields = [...missing];
  next.xaiRatingsFetched = dossierReviewsValid(dossier);
  return writeDossierReviews(next, dossier);
}
