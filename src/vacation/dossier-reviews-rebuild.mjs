import { placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import {
  evidencePageMatchesPlace,
  pageNamesOtherVenue,
  syncDossierRequiredShortcomings,
} from './dossier-evidence-hydrate.mjs';
import {
  claimCitesKnownPages,
  claimsSupported,
  descriptionNamesThing,
  dossierPageById,
  mergeSelectiveDossierFindings,
  prepareDossierFindings,
  resolveClaimCitationPages,
} from './thing-dossier-fields.mjs';
import { reviewGrounded } from './dossier-review-extract.mjs';
import { braveTopUpFieldsPending } from './thing-evidence-dossier-field-counts.mjs';
import { topUpDossierFields } from './thing-evidence-dossier.mjs';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function stripDossierReviews(dossier = {}, place = {}) {
  if (placeSupportsDossierReviews(place)) return dossier;
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

function reviewCitesIdentityPages(dossier = {}, place = {}, review = {}) {
  const pages = resolveClaimCitationPages(dossier, review?.claims?.flatMap((c) => c.pages) || review.pages || []);
  if (!pages?.length) return false;
  for (const id of pages) {
    const page = dossierPageById(dossier, id);
    if (!page) return false;
    if (!evidencePageMatchesPlace(page, place, dossier) || pageNamesOtherVenue(page, place)) return false;
    const body = text(review.text || review.claims?.[0]?.text);
    if (body && !reviewGrounded(body.replace(/…$/, ''), page.text || '')) return false;
  }
  return true;
}

export function dossierReviewsNeedRebuild(dossier = {}, place = {}) {
  if (!placeSupportsDossierReviews(place)) return false;
  if (!dossier?.pages?.length) return false;
  const reviews = Array.isArray(dossier.reviews) ? dossier.reviews : [];
  if (reviews.length !== 4) return reviews.length > 0;
  for (const review of reviews) {
    if (!claimsSupported(dossier, review)) return true;
    if (!reviewCitesIdentityPages(dossier, place, review)) return true;
    const body = text(review.text);
    if (!descriptionNamesThing(body, dossier.thing || place.title) && !descriptionNamesThing(body, place.title)) {
      return true;
    }
    if (pageNamesOtherVenue({ text: body, url: '' }, place)) return true;
  }
  return false;
}

export async function rebuildDossierReviewsFromSavedEvidence(persisted = {}, place = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  destination = '',
  timeoutMs = 120000,
  buildImpl,
  judgeImpl,
  extractReviewsImpl,
  extractDossierReviews,
  callDossierBuilder,
  judgeDossierFindings,
  topUpImpl = topUpDossierFields,
} = {}) {
  if (!placeSupportsDossierReviews(place)) return stripDossierReviews(persisted, place);
  let merged = { ...persisted };
  const pending = braveTopUpFieldsPending(merged, place).filter((f) => f === 'reviews');
  if (pending.length) {
    merged = await topUpImpl(merged, place, { env, fetchImpl, destination, onlyFields: pending });
  }
  const extraction = await extractDossierReviews(merged, {
    env, fetchImpl, timeoutMs, extractReviewsImpl, place,
  });
  merged.reviewSet = extraction.set;
  merged.reviewExtraction = extraction.stats;
  const { findings } = await callDossierBuilder(merged, { env, fetchImpl, timeoutMs, buildImpl });
  await judgeDossierFindings(merged, findings, { env, fetchImpl, timeoutMs, judgeImpl });
  const built = prepareDossierFindings(merged, findings);
  const final = mergeSelectiveDossierFindings(persisted, built, new Set(['reviews']));
  return syncDossierRequiredShortcomings(final, place);
}
