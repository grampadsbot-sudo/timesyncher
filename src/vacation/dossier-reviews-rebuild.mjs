import { placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import {
  pageNamesOtherVenue,
  syncDossierRequiredShortcomings,
} from './dossier-evidence-hydrate.mjs';
import {
  claimCitesKnownPages,
  claimsSupported,
  dossierPageById,
  dossierReviewsEvidenceFresh,
  ensureBraveSnippetCitationPages,
  mergeSelectiveDossierFindings,
  prepareDossierFindings,
  resolveClaimCitationPages,
} from './thing-dossier-fields.mjs';
import { beginDossierXaiUsageRun } from './dossier-cost.mjs';
import { braveTopUpFieldsPending, recordFieldShortcoming } from './thing-evidence-dossier-field-counts.mjs';
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
    reviewThemes: null,
    shortcomings,
  }, place);
}

function reviewCitesIdentityPages(dossier = {}, place = {}, review = {}) {
  const pages = resolveClaimCitationPages(dossier, review?.claims?.flatMap((c) => c.pages) || review.pages || []);
  if (!pages?.length) return false;
  const body = text(review.text || review.claims?.[0]?.text);
  if (body && pageNamesOtherVenue({ text: body, url: '' }, place)) return false;
  for (const id of pages) {
    const page = dossierPageById(dossier, id);
    if (!page) return false;
    if (pageNamesOtherVenue(page, place)) return false;
  }
  return true;
}

function dossierReviewsHaveInvalidContent(dossier = {}, place = {}) {
  const reviews = Array.isArray(dossier.reviews) ? dossier.reviews : [];
  for (const review of reviews) {
    if (!claimsSupported(dossier, review)) return true;
    if (!reviewCitesIdentityPages(dossier, place, review)) return true;
    const body = text(review.text);
    if (pageNamesOtherVenue({ text: body, url: '' }, place)) return true;
  }
  return false;
}

export function dossierReviewsPassValidityGate(dossier = {}, place = {}) {
  if (!placeSupportsDossierReviews(place)) return true;
  const reviews = Array.isArray(dossier.reviews) ? dossier.reviews : [];
  if (reviews.length < 4) return false;
  return !dossierReviewsHaveInvalidContent(dossier, place);
}

export function dossierReviewsNeedRebuild(dossier = {}, place = {}) {
  if (!placeSupportsDossierReviews(place)) return false;
  if (!dossier?.pages?.length) return false;
  const reviews = Array.isArray(dossier.reviews) ? dossier.reviews : [];
  if (!reviews.length) return true;
  return dossierReviewsHaveInvalidContent(dossier, place);
}

function dossierReviewsEvidencePageHash(dossier = {}) {
  return (dossier.pages || []).map((page) => page.sha256).filter(Boolean).join('|');
}

export function stampReviewsEvidencePageHash(dossier = {}, place = {}) {
  const hash = dossierReviewsEvidencePageHash(dossier);
  if (hash && dossierReviewsPassValidityGate(dossier, place)) {
    dossier.reviewsEvidencePageHash = hash;
  } else if (!dossierReviewsPassValidityGate(dossier, place)) {
    delete dossier.reviewsEvidencePageHash;
  }
  return dossier;
}

function dossierRepresentativeReviewsUnchanged(persisted = {}, merged = {}) {
  const a = Array.isArray(persisted.reviews) ? persisted.reviews : [];
  const b = Array.isArray(merged.reviews) ? merged.reviews : [];
  if (a.length !== b.length || !a.length) return false;
  return a.every((row, index) => {
    const other = b[index] || {};
    return text(row.text) === text(other.text) && Number(row.rating) === Number(other.rating);
  });
}

export function dossierReviewsShouldRunWriter(persisted = {}, merged = {}, place = {}) {
  if (!placeSupportsDossierReviews(place) || !merged?.pages?.length) return false;
  const pageHash = dossierReviewsEvidencePageHash(merged);
  if (dossierReviewsPassValidityGate(persisted, place) && persisted.reviewsEvidencePageHash === pageHash) {
    return false;
  }
  if (dossierReviewsPassValidityGate(merged, place)) return false;
  if (dossierReviewsPassValidityGate(persisted, place) && dossierRepresentativeReviewsUnchanged(persisted, merged)) {
    return false;
  }
  if (!dossierReviewsNeedRebuild(merged, place)) return false;
  const hash = dossierReviewsEvidencePageHash(merged);
  if (hash && persisted?.reviewsEvidencePageHash === hash && dossierReviewsPassValidityGate(persisted, place)) {
    return false;
  }
  if (dossierReviewsPassValidityGate(persisted, place) && dossierRepresentativeReviewsUnchanged(persisted, merged)) {
    return false;
  }
  return true;
}

export function preservePersistedDossierReviewsWhenFresh(persisted = {}, merged = {}, place = {}) {
  if (!placeSupportsDossierReviews(place) || !persisted?.pages?.length) return merged;
  const pageHash = dossierReviewsEvidencePageHash(merged);
  if (!dossierReviewsPassValidityGate(persisted, place) || persisted.reviewsEvidencePageHash !== pageHash) {
    return merged;
  }
  if (dossierReviewsPassValidityGate(merged, place)) return merged;
  return {
    ...merged,
    reviews: persisted.reviews,
    reviewSet: persisted.reviewSet,
    reviewExtraction: persisted.reviewExtraction,
    reviewsRead: persisted.reviewsRead,
    reviewSources: persisted.reviewSources,
    reviewsEvidencePageHash: persisted.reviewsEvidencePageHash,
  };
}

export async function rebuildDossierReviewsFromSavedEvidence(persisted = {}, place = {}, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  destination = '',
  timeoutMs = 120000,
  deadline = 0,
  buildImpl,
  judgeImpl,
  extractReviewsImpl,
  extractDossierReviews,
  callDossierBuilder,
  judgeDossierFindings,
  topUpImpl = topUpDossierFields,
} = {}) {
  if (!placeSupportsDossierReviews(place)) return stripDossierReviews(persisted, place);
  let merged = ensureBraveSnippetCitationPages({ ...persisted });
  beginDossierXaiUsageRun(merged, persisted);
  if (!dossierReviewsShouldRunWriter(persisted, merged, place)) {
    return syncDossierRequiredShortcomings(merged, place);
  }
  const pending = braveTopUpFieldsPending(merged, place).filter((f) => f === 'reviews');
  if (pending.length) {
    merged = await topUpImpl(merged, place, { env, fetchImpl, destination, onlyFields: pending });
  }
  const extraction = await extractDossierReviews(merged, {
    env, fetchImpl, timeoutMs, deadline, extractReviewsImpl, place,
  });
  merged.reviewSet = extraction.set;
  merged.reviewExtraction = extraction.stats;
  const { findings } = await callDossierBuilder(merged, {
    env, fetchImpl, timeoutMs, deadline, buildImpl, includeReviews: true, reviewsOnly: true,
  });
  await judgeDossierFindings(merged, findings, {
    env, fetchImpl, timeoutMs, deadline, judgeImpl, skipReviewClaims: false,
  });
  const built = prepareDossierFindings(merged, findings);
  const final = mergeSelectiveDossierFindings(persisted, built, new Set(['reviews']), place);
  stampReviewsEvidencePageHash(final, place);
  if (!dossierReviewsPassValidityGate(final, place)) {
    final.shortcomings = recordFieldShortcoming(
      { shortcomings: final.shortcomings || [] },
      'reviews',
      final.reviews?.length ? 'representative reviews could not be verified from saved evidence' : 'limited number of reviews',
    );
  }
  return syncDossierRequiredShortcomings(final, place);
}
