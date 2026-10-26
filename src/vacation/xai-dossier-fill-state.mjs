import { placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import { dossierReviewsShouldRunWriter } from './dossier-reviews-rebuild.mjs';
import { commitDossierXaiUsageRun } from './dossier-cost.mjs';
import { braveTopUpFieldsPending, computeDossierFieldCounts } from './thing-evidence-dossier-field-counts.mjs';
import { mergeDossierPages } from './thing-evidence-dossier.mjs';
import { saveThingEvidenceDossier } from './thing-evidence-dossier-store.mjs';
import { dossierRebuildFields } from './thing-dossier-fields.mjs';

const NO_OP_TOP_UP_IGNORE = new Set(['coordinates', 'ratings']);

export function dossierFillRebuildFields(persisted = {}, merged = {}, place = {}, {
  maxAgeExpired = false,
  changedUrls = [],
} = {}) {
  const rebuildFields = dossierRebuildFields(persisted, merged, { maxAgeExpired, changedUrls });
  const counts = computeDossierFieldCounts(merged, place);
  if (counts.summary?.status !== 'ok') rebuildFields.add('summary');
  if (counts.description?.status !== 'ok') rebuildFields.add('description');
  return rebuildFields;
}

export function dossierEmptyGatherReason(dossier = {}) {
  const attempts = Array.isArray(dossier.attempts) ? dossier.attempts : [];
  if (!attempts.length) return 'no_gather_attempts';
  const brave = attempts.filter((row) => row.kind === 'brave' || row.kind === 'page');
  const noMatch = brave.find((row) => row.status === 'no_match' || row.step === 'match' && row.status === 'no_match');
  if (noMatch) return 'brave_no_match';
  const failed = brave.filter((row) => row.status === 'failed');
  if (failed.length && (!brave.some((row) => row.status === 'ok') || failed.length === brave.length)) {
    const last = failed[failed.length - 1];
    return `gather_failed:${String(last.error || last.step || 'unknown').slice(0, 48)}`;
  }
  const hits = (dossier.braveResults || []).length;
  if (!hits && brave.some((row) => row.status === 'ok' && Number(row.results) === 0)) return 'brave_zero_hits';
  if (hits > 0 && !(dossier.pages || []).length) return 'brave_hits_not_materialized';
  return 'gather_no_pages';
}

export function dossierPersistedFillIsNoOp(persisted = {}, merged = {}, place = {}, {
  changedUrls = [],
} = {}) {
  if (!persisted?.pages?.length || !merged?.pages?.length) return false;
  const counts = computeDossierFieldCounts(merged, place);
  if (counts.summary?.status !== 'ok' || counts.description?.status !== 'ok') return false;
  const rebuildFields = dossierFillRebuildFields(persisted, merged, place, { maxAgeExpired: false, changedUrls });
  const needsWriter = placeSupportsDossierReviews(place)
    && dossierReviewsShouldRunWriter(persisted, merged, place);
  const pendingTopUp = braveTopUpFieldsPending(merged, place)
    .filter((field) => !NO_OP_TOP_UP_IGNORE.has(field));
  const skipBuilder = rebuildFields.size === 0
    && persisted.fields
    && Object.keys(persisted.fields).length > 0;
  return !needsWriter && skipBuilder && pendingTopUp.length === 0;
}

export async function saveResumablePartial(merged, persisted, {
  key, env, storeImpl, place, checkpoint, rateLimitStep,
} = {}) {
  const next = mergeDossierPages(persisted || {}, merged || {});
  next.captureCheckpoint = checkpoint || next.captureCheckpoint || 'partial-xai';
  if (rateLimitStep) next.captureRateLimitStep = rateLimitStep;
  commitDossierXaiUsageRun(next, persisted || {}, {
    kind: 'partial-xai',
    placeId: place.id ?? place.placeId,
    rateLimitStep: rateLimitStep || undefined,
  });
  if (key && next) await saveThingEvidenceDossier(key, next, { env, storeImpl });
  return {
    payload: {},
    structuredText: '',
    partial: true,
    resumable: true,
    rateLimited: Boolean(rateLimitStep),
    rateLimitStep: rateLimitStep || undefined,
    checkpoint: next.captureCheckpoint,
    parsed: { evidenceDossier: next },
  };
}

export async function saveFailedDossierAttempt(persisted, merged, {
  key, env, storeImpl, place, error, checkpoint,
} = {}) {
  const next = mergeDossierPages(persisted || {}, merged || {});
  const step = error?.step || error?.upstream?.step || 'builder';
  const attempt = {
    kind: step,
    status: 'failed',
    at: new Date().toISOString(),
    httpStatus: Number(error?.status || error?.upstream?.status) || undefined,
    error: String(error?.message || 'dossier_step_failed').slice(0, 120),
  };
  if (error?.upstream) attempt.upstream = error.upstream;
  next.attempts = [...(next.attempts || []), attempt];
  next.captureCheckpoint = checkpoint || next.captureCheckpoint || `failed-${step}`;
  commitDossierXaiUsageRun(next, persisted || {}, {
    kind: 'failed-xai',
    placeId: place.id ?? place.placeId,
    rateLimitStep: step,
  });
  if (key) await saveThingEvidenceDossier(key, next, { env, storeImpl });
  return {
    payload: {},
    structuredText: '',
    partial: true,
    failed: true,
    upstream: error?.upstream || undefined,
    checkpoint: next.captureCheckpoint,
    parsed: { evidenceDossier: next },
  };
}
