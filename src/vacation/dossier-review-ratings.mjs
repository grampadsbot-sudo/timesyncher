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

function quotedScaleMax(quote = '') {
  const q = norm(quote);
  const slash = q.match(/(\d+(?:\.\d+)?)\s*(?:\/|(?:out )?of)\s*(5|10)\b/);
  return slash ? Number(slash[2]) : null;
}

function citedVenueRating(dossier) {
  const evidence = dossier.ratingEvidence;
  if (!evidence || evidence.supported === false || !dossierPagesVerified(dossier)) return null;
  const average = Number(evidence.average);
  const count = Number(evidence.count);
  const scale = Number(evidence.scaleMax ?? evidence.scale ?? 5);
  if (![5, 10].includes(scale) || quotedScaleMax(evidence.quote) && quotedScaleMax(evidence.quote) !== scale) return null;
  const stars = parseReviewStars(average, scale);
  if (!stars || !Number.isInteger(count) || count <= 0) return null;
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

export function resolveDossierReviewRatings(dossier = {}) {
  const venue = citedVenueRating(dossier);
  const reviews = (dossier.reviews || []).map((review) => {
    const stars = excerptStars(dossier, review) || parseReviewStars(review.rating) || venue;
    return stars ? { ...review, rating: stars.rating, starsEvidence: stars.evidence } : null;
  });
  const rated = reviews.filter(Boolean);
  const average = venue?.average ?? dossier.rating;
  if (rated.length && average > 0) {
    const mean = rated.reduce((sum, row) => sum + row.rating, 0) / rated.length;
    if (Math.abs(mean - average) > 0.5) {
      if (venue) for (const row of rated) Object.assign(row, { rating: venue.rating, starsEvidence: venue.evidence });
      else rated.length = 0;
    }
  }
  if (rated.length === (dossier.reviews || []).length && (rated.length || !dossier.reviews?.length)) {
    return { ...dossier, reviews: rated };
  }
  const shortcomings = (dossier.shortcomings || []).filter((row) => row.field !== 'reviews');
  shortcomings.push({ field: 'reviews', reason: 'review ratings could not be grounded in saved evidence' });
  return { ...dossier, reviews: rated, shortcomings,
    missingFields: [...new Set([...(dossier.missingFields || []), 'reviews'])] };
}
