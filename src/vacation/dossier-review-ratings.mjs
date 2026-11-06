import { dossierPagesVerified } from './thing-evidence-dossier.mjs';
import { pageTextSupportsRating, ratingQuoteSupportsAggregate } from './thing-dossier-fields.mjs';

const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function parseReviewStars(value, scaleMax = 5) {
  if (!['number', 'string'].includes(typeof value)) return null;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(?:(?:\/|out of|of)\s*(5|10))?\s*(?:stars?|bubbles)?$/i);
  if (!match) return null;
  const score = Number(match[1]);
  const scale = Number(match[2] || scaleMax);
  if (![5, 10].includes(scale) || score < 1 || score > scale) return null;
  return { rating: Math.max(1, Math.round(score * 5 / scale)), evidence: `${score}/${scale}` };
}

function citedVenueRating(dossier) {
  const evidence = dossier.ratingEvidence;
  if (!evidence || evidence.supported === false || !dossierPagesVerified(dossier)) return null;
  const average = Number(evidence.average);
  const count = Number(evidence.count);
  const scale = Number(evidence.scaleMax ?? evidence.scale ?? 5);
  const stars = parseReviewStars(average, scale);
  if (!stars || !Number.isInteger(count) || count <= 0) return null;
  const quoteScale = String(evidence.quote || '').match(/(?:out of|\/)\s*(5|10)\b/i);
  if (quoteScale && Number(quoteScale[1]) !== scale) return null;
  const page = dossier.pages.find((row) => row.url === (evidence.url || evidence.sourceUrl));
  if (!page || page.claimSupportOk === false) return null;
  const quoteHeld = norm(evidence.quote) && norm(page.text).includes(norm(evidence.quote))
    && ratingQuoteSupportsAggregate(evidence.quote, average, count);
  if (!quoteHeld && !pageTextSupportsRating(page.text, average, count)) return null;
  return { ...stars, average: average * 5 / scale, url: page.url };
}

function excerptStars(dossier, review) {
  const claims = review.claims || [];
  const refs = new Set(claims.flatMap((claim) => claim.pages || []));
  for (const row of [...(dossier.reviewExcerpts || []), ...(dossier.reviewSet || [])]) {
    const body = norm(row.text);
    if (!body || row.supported === false) continue;
    const matches = body === norm(review.text) || refs.has(row.id)
      || claims.some((claim) => norm(claim.text) && body.includes(norm(claim.text)));
    if (!matches) continue;
    const pageIds = [row.page, ...(row.pages || [])].filter(Boolean);
    const pages = (dossier.pages || []).filter((page, index) => page.url === row.url || pageIds.includes(`p${index + 1}`));
    if (!pages.some((page) => norm(page.text).includes(body))) continue;
    const stars = parseReviewStars(row.rating, row.scaleMax ?? 5);
    if (stars) return stars;
  }
  return null;
}

function reviewHasGroundedStars(dossier, review, venue) {
  const excerpt = excerptStars(dossier, review);
  if (excerpt) return excerpt;
  if (review.starsEvidence) {
    const stars = parseReviewStars(review.rating);
    if (stars) return { rating: stars.rating, evidence: review.starsEvidence };
  }
  return venue || null;
}

function stripReviewRating(review) {
  const next = { ...review };
  delete next.rating;
  delete next.starsEvidence;
  return next;
}

function allReviewsRated(reviews = []) {
  return reviews.length > 0
    && reviews.every((row) => Number.isInteger(row.rating) && row.rating >= 1 && row.rating <= 5);
}

export function resolveDossierReviewRatings(dossier = {}) {
  const venue = citedVenueRating(dossier);
  const input = dossier.reviews || [];
  if (!input.length) return dossier;
  let reviews = input.map((review) => {
    const stars = reviewHasGroundedStars(dossier, review, venue);
    return stars ? { ...review, rating: stars.rating, starsEvidence: stars.evidence } : stripReviewRating(review);
  });
  const average = venue?.average ?? dossier.rating;
  if (allReviewsRated(reviews) && average > 0) {
    const mean = reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length;
    if (Math.abs(mean - average) > 0.5) {
      if (venue) {
        reviews = reviews.map((review) => ({ ...review, rating: venue.rating, starsEvidence: venue.evidence }));
      } else {
        reviews = reviews.map((review) => stripReviewRating(review));
      }
    }
  }
  if (!allReviewsRated(reviews) && input.length === 4
    && input.every((row) => row?.rating != null || row?.starsEvidence)) {
    reviews = [];
    const shortcomings = (dossier.shortcomings || []).filter((row) => row.field !== 'reviews');
    shortcomings.push({ field: 'reviews', reason: 'review ratings could not be grounded in saved evidence' });
    return { ...dossier, reviews, shortcomings,
      missingFields: [...new Set([...(dossier.missingFields || []), 'reviews'])] };
  }
  if (allReviewsRated(reviews) || !reviews.length) return { ...dossier, reviews };
  const shortcomings = (dossier.shortcomings || []).filter((row) => row.field !== 'reviews');
  shortcomings.push({ field: 'reviews', reason: 'review ratings could not be grounded in saved evidence' });
  return { ...dossier, reviews, shortcomings,
    missingFields: [...new Set([...(dossier.missingFields || []), 'reviews'])] };
}
