import { placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import {
  dossierReviewsNeedRebuild,
  dossierReviewsPassValidityGate,
  syncDossierRequiredShortcomings,
} from './dossier-evidence-hydrate.mjs';
import {
  ensureBraveSnippetCitationPages,
  mergeSelectiveDossierFindings,
  prepareDossierFindings,
} from './thing-dossier-fields.mjs';
import { beginDossierXaiUsageRun } from './dossier-cost.mjs';
import { braveTopUpFieldsPending, recordFieldShortcoming } from './thing-evidence-dossier-field-counts.mjs';
import { topUpDossierFields } from './thing-evidence-dossier.mjs';

export { dossierReviewsNeedRebuild, dossierReviewsPassValidityGate } from './dossier-evidence-hydrate.mjs';

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

function explicitRepresentativeFailure(dossier = {}) {
  return (Array.isArray(dossier.shortcomings) ? dossier.shortcomings : []).some((row) =>
    row?.field === 'reviews' && /could not be verified/i.test(String(row.reason || '')));
}

export function dossierReviewsShouldRunWriter(persisted = {}, merged = {}, place = {}) {
  if (!placeSupportsDossierReviews(place) || !merged?.pages?.length) return false;
  const pageHash = dossierReviewsEvidencePageHash(merged);
  if (pageHash && persisted?.reviewsEvidencePageHash === pageHash && dossierReviewsPassValidityGate(persisted, place)) {
    return false;
  }
  if (dossierReviewsPassValidityGate(merged, place)) return false;
  if (explicitRepresentativeFailure(merged)) return true;
  return dossierReviewsNeedRebuild(merged, place);
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
