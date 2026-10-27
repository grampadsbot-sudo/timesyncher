import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { hasDatabase, sql } from './db.mjs';
import { thingRecordFromTripRow } from './intake-shared-trip.mjs';
import { thingWantsEvidenceCapture } from './thing-evidence-capture-trigger.mjs';
import { xaiHttpErrorResumable } from './xai-dossier-http.mjs';
import { normalizeDossierEvidence } from './dossier-evidence-hydrate.mjs';
import { dossierPersistedFillIsNoOp, dossierFillHardFailure, dossierFillNeedsTextRebuild } from './xai-dossier-fill-state.mjs';
import { fetchXaiPlaceRatings } from './xai-grok-place-ratings.mjs';
import {
  bindSharedThingEvidenceDossier,
  loadThingEvidenceDossier,
  loadThingEvidenceDossierResolved,
  thingEvidenceDossierKey,
} from './thing-evidence-dossier-store.mjs';

const BASE_ENRICHMENT = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);
const OVERLAY_ENRICHMENT = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/pr336-gate-b-ccab-overlay.json', import.meta.url), 'utf8'),
);

let dossierFillTestImpls = null;

export function __setDossierFillTestImpls(impls = null) {
  dossierFillTestImpls = impls;
}

function getDossierFillTestImpls() {
  return dossierFillTestImpls || {};
}

export function placeFromTarget(target = {}) {
  const ccabRecord = {
    ...(BASE_ENRICHMENT[target.ccabKey] || {}),
    ...(OVERLAY_ENRICHMENT[target.ccabKey] || {}),
  };
  const category = target.category || ccabRecord.category || target.category_name || '';
  const suppliedRecord = target.sourceRecord || {};
  const chosenUrl = target.website || target.url
    || suppliedRecord.website || suppliedRecord.url
    || ccabRecord.website;
  const sourceRecord = {
    ...ccabRecord,
    category,
    ...suppliedRecord,
    ...(chosenUrl ? { website: chosenUrl, url: chosenUrl } : {}),
  };
  return {
    id: target.placeId ?? target.rowId ?? target.id,
    trip_id: target.tripId ?? target.trip_id ?? 99,
    title: target.title || target.name || target.ccabKey,
    name: target.name || target.title || target.ccabKey,
    source: target.source || ccabRecord.source || 'trip_things',
    category,
    category_name: typeof category === 'object' ? category.name : (target.category_name || category),
    address: target.address || suppliedRecord.address || ccabRecord.address,
    lat: target.lat ?? suppliedRecord.lat ?? ccabRecord.lat,
    lng: target.lng ?? suppliedRecord.lng ?? ccabRecord.lng,
    url: chosenUrl,
    sourceRecord,
  };
}

export function normalizeDossierWorkerTargets(body = {}) {
  if (Array.isArray(body?.targets) && body.targets.length) {
    return body.targets.map((row) => ({ ...row, destination: row.destination || body.destination || 'New York City' }));
  }
  if (Array.isArray(body?.places) && body.places.length) {
    return body.places.map((row) => ({
      ...row,
      tripId: row.tripId ?? row.trip_id ?? body.tripId ?? body.trip_id,
      placeId: row.placeId ?? row.id,
      destination: row.destination || body.destination || '',
    }));
  }
  if (body?.tripId != null || body?.trip_id != null) {
    const tripId = body.tripId ?? body.trip_id;
    const placeIds = Array.isArray(body.placeIds) ? body.placeIds : (Array.isArray(body.place_ids) ? body.place_ids : []);
    if (placeIds.length) {
      return placeIds.map((placeId) => ({
        tripId,
        placeId,
        title: body.title,
        category: body.category,
        destination: body.destination || '',
      }));
    }
  }
  return null;
}

export async function listTripThingsMissingDossiers({
  env = process.env,
  storeImpl,
  tripId = '',
  limit = 200,
  dbImpl,
} = {}) {
  if (!hasDatabase(env) && !dbImpl) {
    return { ok: false, code: 'missing_database', targets: [] };
  }
  const db = dbImpl || sql(env);
  const max = Math.max(1, Math.min(Number(limit) || 200, 500));
  const rows = tripId
    ? await db`
      select tt.id, tt.trip_id, tt.category, tt.title, tt.description, tt.metadata, tt.location, tt.ratings, tt.source, t.destination
      from trip_things tt
      join trips t on t.id = tt.trip_id
      where tt.trip_id = ${String(tripId).trim()}::uuid
      order by tt.created_at asc
      limit ${max}
    `
    : await db`
      select tt.id, tt.trip_id, tt.category, tt.title, tt.description, tt.metadata, tt.location, tt.ratings, tt.source, t.destination
      from trip_things tt
      join trips t on t.id = tt.trip_id
      order by tt.created_at desc
      limit ${max}
    `;
  const targets = [];
  for (const row of rows || []) {
    const thing = thingRecordFromTripRow(row);
    if (!thingWantsEvidenceCapture(thing)) continue;
    const place = { id: row.id, trip_id: row.trip_id, title: row.title, category: row.category, sourceRecord: thing.sourceRecord };
    const dossierKey = thingEvidenceDossierKey(place);
    if (!dossierKey) continue;
    const existing = await loadThingEvidenceDossier(dossierKey, { env, storeImpl });
    if (existing?.pages?.length) continue;
    targets.push({
      tripId: row.trip_id,
      placeId: row.id,
      title: row.title,
      category: row.category,
      destination: String(row.destination || '').trim(),
    });
  }
  return { ok: true, targets };
}

export async function runThingEvidenceDossierStagingTargets(targets = [], {
  env = process.env,
  fetchImpl,
  gatherImpl,
  buildImpl,
  judgeImpl,
  extractReviewsImpl,
  storeImpl,
  skipExisting = false,
  forceRefresh = false,
  operatorFill = false,
  timeBudgetMs = 52000,
} = {}) {
  const testImpls = env.TIMESYNCHER_DOSSIER_TEST_IMPLS === '1' ? getDossierFillTestImpls() : {};
  fetchImpl = fetchImpl || testImpls.fetchImpl;
  gatherImpl = gatherImpl || testImpls.gatherImpl;
  buildImpl = buildImpl || testImpls.buildImpl;
  judgeImpl = judgeImpl || testImpls.judgeImpl;
  extractReviewsImpl = extractReviewsImpl || testImpls.extractReviewsImpl;
  storeImpl = storeImpl || testImpls.storeImpl;
  if (!env.XAI_API_KEY && !buildImpl) {
    return { ok: false, code: 'missing_xai_api_key', results: [] };
  }
  const results = [];
  for (const target of targets) {
    const place = placeFromTarget(target);
    const dossierKey = target.dossierKey || (target.sharedLibrary === true
      ? await bindSharedThingEvidenceDossier(place, { env, storeImpl })
      : thingEvidenceDossierKey(place));
    const { dossier: existing } = await loadThingEvidenceDossierResolved(dossierKey, {
      env,
      storeImpl,
      placeId: place.id,
    });
    const pagesBefore = existing?.pages?.length || 0;
    const refresh = forceRefresh || target.forceRefresh === true
      || (operatorFill && pagesBefore > 0 && (dossierFillNeedsTextRebuild(existing, place) || existing.emptySource));
    if (!refresh && skipExisting && existing?.pages?.length) {
      const normalized = normalizeDossierEvidence({ ...existing }, place);
      if (dossierPersistedFillIsNoOp(existing, normalized, place)) {
        results.push({
          rowId: target.rowId ?? place.id,
          dossierKey,
          skipped: 'existing_dossier',
          pageCount: pagesBefore,
          reviewsRead: existing.reviewsRead || 0,
        });
        continue;
      }
    }
    let fetchResult;
    try {
      fetchResult = await fetchXaiPlaceRatings(place, {
        destination: target.destination,
        dossierKey,
        env,
        fetchImpl,
        gatherImpl,
        buildImpl,
        judgeImpl,
        extractReviewsImpl,
        storeImpl,
        forceRefresh: refresh,
        reuseSavedPages: operatorFill,
        timeBudgetMs: target.timeBudgetMs ?? timeBudgetMs,
      });
    } catch (error) {
      if (error?.resumable) {
        results.push({
          rowId: target.rowId ?? place.id,
          dossierKey,
          partial: true,
          resumable: true,
          rateLimited: xaiHttpErrorResumable(error.status),
          rateLimitStep: error.step,
          error: error.message,
          pageCount: pagesBefore,
          pagesAdded: 0,
          reviewsRead: existing?.reviewsRead || 0,
        });
        continue;
      }
      throw error;
    }
    const {
      parsed,
      skipped,
      partial,
      resumable,
      rateLimited,
      rateLimitStep,
      checkpoint,
      failed,
      upstream,
      emptySource,
      status,
      error,
    } = fetchResult;
    const { dossier: saved } = operatorFill
      ? await loadThingEvidenceDossierResolved(dossierKey, { env, storeImpl, placeId: place.id })
      : { dossier: null };
    const returnedDossier = saved || parsed?.evidenceDossier;
    const after = parsed?.evidenceDossier?.pages?.length || 0;
    const hardFailure = dossierFillHardFailure(returnedDossier, place);
    results.push({
      rowId: target.rowId ?? place.id,
      dossierKey,
      skipped: skipped && !hardFailure.failed ? 'existing_dossier' : undefined,
      partial: partial === true,
      failed: failed === true || hardFailure.failed === true,
      status: hardFailure.status || status,
      error: hardFailure.error || error,
      presentedReasons: hardFailure.presentedReasons,
      resumable: resumable === true,
      rateLimited: rateLimited === true,
      rateLimitStep,
      upstream: upstream || undefined,
      checkpoint: hardFailure.presentedReasons?.length
        ? 'failed-presented' : checkpoint || parsed?.evidenceDossier?.captureCheckpoint,
      emptySource: hardFailure.emptySource || emptySource || undefined,
      pageCount: after,
      pagesAdded: Math.max(0, after - pagesBefore),
      reviewsRead: fetchResult.parsed?.evidenceDossier?.reviewsRead || 0,
    });
  }
  return { ok: true, results };
}
