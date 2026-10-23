import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { hasDatabase, sql } from './db.mjs';
import { thingRecordFromTripRow } from './intake-shared-trip.mjs';
import { thingWantsEvidenceCapture } from './thing-evidence-capture-trigger.mjs';
import { fetchXaiPlaceRatings } from './xai-grok-place-ratings.mjs';
import { loadThingEvidenceDossier, nycDaybydayDossierKey, thingEvidenceDossierKey } from './thing-evidence-dossier-store.mjs';

const BASE_ENRICHMENT = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);
const OVERLAY_ENRICHMENT = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/pr336-gate-b-ccab-overlay.json', import.meta.url), 'utf8'),
);

function placeFromTarget(target = {}) {
  const ccabRecord = {
    ...(BASE_ENRICHMENT[target.ccabKey] || {}),
    ...(OVERLAY_ENRICHMENT[target.ccabKey] || {}),
  };
  return {
    id: target.placeId ?? target.rowId ?? target.id,
    trip_id: target.tripId ?? target.trip_id ?? 99,
    title: target.title || target.name,
    category: target.category,
    address: target.address || ccabRecord.address,
    url: target.website || target.url || ccabRecord.website,
    sourceRecord: { ...ccabRecord, ...(target.sourceRecord || {}) },
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
  storeImpl,
  skipExisting = false,
} = {}) {
  if (!env.XAI_API_KEY && !buildImpl) {
    return { ok: false, code: 'missing_xai_api_key', results: [] };
  }
  const results = [];
  for (const target of targets) {
    const place = placeFromTarget(target);
    const dossierKey = target.dossierKey
      || (target.rowId ? nycDaybydayDossierKey(target.rowId) : thingEvidenceDossierKey(place));
    if (skipExisting && dossierKey) {
      const existing = await loadThingEvidenceDossier(dossierKey, { env, storeImpl });
      if (existing?.pages?.length) {
        results.push({
          rowId: target.rowId ?? place.id,
          dossierKey,
          skipped: 'existing_dossier',
          pageCount: existing.pages.length,
          reviewsRead: existing.reviewsRead || 0,
        });
        continue;
      }
    }
    const { parsed } = await fetchXaiPlaceRatings(place, {
      destination: target.destination,
      dossierKey,
      env,
      fetchImpl,
      gatherImpl,
      buildImpl,
      storeImpl,
    });
    results.push({
      rowId: target.rowId ?? place.id,
      dossierKey,
      pageCount: parsed.evidenceDossier?.pages?.length || 0,
      reviewsRead: parsed.evidenceDossier?.reviewsRead || 0,
    });
  }
  return { ok: true, results };
}
