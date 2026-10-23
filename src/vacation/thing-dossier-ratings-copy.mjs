import { placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import { reviewSourceHost } from './thing-evidence-dossier.mjs';

function scalarFieldValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value.value ?? value.text ?? '').trim();
  return String(value).trim();
}

function cited(dossier, claim) {
  return claim && typeof claim.quote === 'string' && String(claim.quote).trim().length >= 8
    && dossier.pages.some((page) => page.url === claim.url && String(page.text || '').toLowerCase().includes(String(claim.quote).trim().toLowerCase()));
}

function fieldClaimOk(dossier, claim) {
  return claim && Array.isArray(claim.claims) && claim.claims.length
    && claim.claims.every((row) => row?.supported === true && Array.isArray(row.pages) && row.pages.length);
}

function ratingHostBucket(url = '') {
  const host = reviewSourceHost(url).toLowerCase();
  if (host.includes('google')) return 'google';
  if (host.includes('yelp')) return 'yelp';
  return 'other';
}

export function applyDossierRatingsAndReviews(record = {}, dossier = {}) {
  const fields = dossier.fields || {};
  const assignScalar = (key, raw) => {
    const value = scalarFieldValue(raw?.value ?? raw);
    if (!value) return;
    record[key] = value;
  };
  for (const key of [
    'googleRating', 'googleReviewCount', 'googleRatingSourceUrl',
    'yelpRating', 'yelpReviewCount', 'yelpRatingSourceUrl',
  ]) {
    if (fields[key] && fieldClaimOk(dossier, fields[key])) assignScalar(key, fields[key]);
    else if (dossier[key] != null && dossier[key] !== '') record[key] = String(dossier[key]);
  }
  if (Array.isArray(dossier.otherRatingSites) && dossier.otherRatingSites.length) {
    record.otherRatingSites = dossier.otherRatingSites.map((row) => ({ ...row }));
  } else if (Array.isArray(fields.otherRatingSites)) {
    record.otherRatingSites = fields.otherRatingSites;
  }
  const others = [];
  for (const page of dossier.pages || []) {
    const rating = page.braveRating;
    if (!rating?.average || !rating?.count) continue;
    const bucket = ratingHostBucket(page.url || rating.url);
    if (bucket === 'google' && !record.googleRating) {
      record.googleRating = String(rating.average);
      record.googleReviewCount = String(rating.count);
      if (page.url || rating.url) record.googleRatingSourceUrl = page.url || rating.url;
    } else if (bucket === 'yelp' && !record.yelpRating) {
      record.yelpRating = String(rating.average);
      record.yelpReviewCount = String(rating.count);
      if (page.url || rating.url) record.yelpRatingSourceUrl = page.url || rating.url;
    } else if (bucket === 'other') {
      others.push({
        name: rating.source || reviewSourceHost(page.url),
        average: rating.average,
        count: rating.count,
        url: page.url || rating.url,
      });
    }
  }
  if (!record.otherRatingSites?.length && others.length) {
    record.otherRatingSites = others;
  }
  if (dossier.ratingEvidence && cited(dossier, dossier.ratingEvidence)) {
    const url = dossier.ratingEvidence.url || '';
    const bucket = ratingHostBucket(url);
    if (bucket === 'google' && !record.googleRating) {
      record.googleRating = String(dossier.rating);
      record.googleReviewCount = String(dossier.reviewsAvailable);
      record.googleRatingSourceUrl = url;
    } else if (bucket === 'yelp' && !record.yelpRating) {
      record.yelpRating = String(dossier.rating);
      record.yelpReviewCount = String(dossier.reviewsAvailable);
      record.yelpRatingSourceUrl = url;
    }
  }
  if (placeSupportsDossierReviews({ category: record.category })) {
    if (Array.isArray(dossier.reviewThemes) && dossier.reviewThemes.length) {
      record.reviewThemes = [...dossier.reviewThemes];
    } else if (dossier.reviewThemes && typeof dossier.reviewThemes === 'object') {
      record.reviewThemes = { ...dossier.reviewThemes };
    }
  } else {
    delete record.reviewThemes;
  }
  return record;
}
