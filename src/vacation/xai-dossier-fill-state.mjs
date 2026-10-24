import { placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import { dossierReviewsShouldRunWriter } from './dossier-reviews-rebuild.mjs';
import { commitDossierXaiUsageRun } from './dossier-cost.mjs';
import { braveTopUpFieldsPending } from './thing-evidence-dossier-field-counts.mjs';
import { saveThingEvidenceDossier } from './thing-evidence-dossier-store.mjs';
import { dossierRebuildFields } from './thing-dossier-fields.mjs';

const NO_OP_TOP_UP_IGNORE = new Set(['coordinates', 'ratings']);

export function dossierPersistedFillIsNoOp(persisted = {}, merged = {}, place = {}, {
  changedUrls = [],
} = {}) {
  if (!persisted?.pages?.length || !merged?.pages?.length) return false;
  const rebuildFields = dossierRebuildFields(persisted, merged, { maxAgeExpired: false, changedUrls });
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
  const next = merged || persisted;
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
