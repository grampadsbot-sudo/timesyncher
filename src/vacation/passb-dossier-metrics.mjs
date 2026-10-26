import { computeDossierFieldCounts } from './thing-evidence-dossier-field-counts.mjs';
import {
  getThingEvidenceDossierStore,
  loadTripPlaceDossiersFromStore,
} from './thing-evidence-dossier-store.mjs';
import { searchPlaceOutputViolations } from './search-place-output.mjs';
import { placeFromTarget } from './thing-evidence-dossier-execution.mjs';
import { normalizeDossierEvidence } from './dossier-evidence-hydrate.mjs';
import { dossierPersistedFillIsNoOp } from './xai-dossier-fill-state.mjs';
import { searchPlaceFromStoredDossier } from './shared-trip-dossier-overlay.mjs';
import {
  buildPassBSharedDossierTargets,
  normPassBDossierCategory,
  passBInventoryCounts,
  sliceDossierBatch,
} from './nyc-passb-dossier-inventory.mjs';
import { buildPr336VkSearchPlacesByRowId } from '../../scripts/fixtures/pr336-vk-search-trip-sources.mjs';
import { buildNycCraigKimDaybydayFixtureRows } from '../../scripts/fixtures/nyc-craig-kim-daybyday-rows.mjs';
import { NYC_GATE_B_TRIP_ID } from './shared-trip-dossier-keys.mjs';
import { hasDatabase } from './db.mjs';
import { missingSearchKeys } from './provider-env.mjs';

export function parsePassBOperatorOffset(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw Object.assign(new Error('Invalid pass B batch offset.'), { statusCode: 400, code: 'invalid_offset' });
  }
  return n;
}

const OPERATOR_TARGETS_PER_REQUEST = 1;
const OPERATOR_MAX_TIME_BUDGET_MS = 45000;

function dossierPresent(dossier) {
  return Boolean(
    dossier
    && Array.isArray(dossier.pages)
    && dossier.pages.length > 0
    && Array.isArray(dossier.attempts)
    && dossier.attempts.length > 0,
  );
}

function dossierPresented(dossier, place) {
  if (!dossierPresent(dossier)) return false;
  const counts = computeDossierFieldCounts(dossier, place);
  const summaryOk = counts.summary?.status === 'ok';
  const descOk = counts.description?.status === 'ok';
  const hydrated = searchPlaceFromStoredDossier(place, dossier);
  const placeViolations = searchPlaceOutputViolations({
    ...hydrated,
    sourceRecord: hydrated,
    title: hydrated.title || place.title || place.name,
    category: place.category || place.cat || hydrated.category,
  });
  return summaryOk && descOk && placeViolations.length === 0;
}

function scoreByType(rows, placesById, dossiersByPlaceId) {
  const buckets = {};
  for (const row of rows) {
    const t = normPassBDossierCategory(row.cat);
    if (!buckets[t]) buckets[t] = { present: 0, presented: 0, total: 0 };
    buckets[t].total += 1;
    const place = placesById[String(row.id)] || { title: row.name, category: row.cat };
    const dossier = dossiersByPlaceId[row.id];
    if (dossierPresent(dossier)) buckets[t].present += 1;
    if (dossierPresented(dossier, place)) buckets[t].presented += 1;
  }
  const out = {};
  for (const [type, bucket] of Object.entries(buckets)) {
    out[type] = {
      total: bucket.total,
      present: bucket.present,
      presented: bucket.presented,
      presentPct: bucket.total ? Math.round((100 * bucket.present) / bucket.total) : 0,
      presentedPct: bucket.total ? Math.round((100 * bucket.presented) / bucket.total) : 0,
    };
  }
  return out;
}

function inventoryFromRows(rows) {
  const byType = {};
  for (const row of rows) {
    const t = normPassBDossierCategory(row.cat);
    byType[t] = (byType[t] || 0) + 1;
  }
  return { total: rows.length, byType };
}

export async function computePassBDossierMetrics({
  env = process.env,
  storeImpl,
  tripId = NYC_GATE_B_TRIP_ID,
} = {}) {
  if (!storeImpl && !hasDatabase(env)) {
    throw Object.assign(new Error('DATABASE_URL is not configured for central dossier storage.'), {
      statusCode: 503,
      code: 'missing_database',
    });
  }
  const rows = buildNycCraigKimDaybydayFixtureRows();
  const placesById = buildPr336VkSearchPlacesByRowId(rows);
  const placeIds = rows.map((r) => r.id);
  const store = storeImpl || getThingEvidenceDossierStore(env);
  const dossiersByPlaceId = await loadTripPlaceDossiersFromStore(placeIds, { tripId, env, storeImpl: store });
  let withPages = 0;
  for (const dossier of Object.values(dossiersByPlaceId)) {
    if (dossier?.pages?.length) withPages += 1;
  }
  const sharedInventory = passBInventoryCounts();
  const metrics = {
    ok: true,
    inventory: inventoryFromRows(rows),
    passBSharedInventory: sharedInventory,
    targets: {
      total: 94,
      byType: {
        hotel: 22,
        flight: 16,
        store: 15,
        attraction: 15,
        restaurant: 25,
        car: 1,
      },
    },
    dossierStore: {
      source: 'central',
      count: Object.keys(dossiersByPlaceId).length,
      withPages,
    },
    byType: scoreByType(rows, placesById, dossiersByPlaceId),
    fillTargets: buildPassBSharedDossierTargets().map((target, offset) => {
      const dossier = dossiersByPlaceId[target.placeId];
      const place = placeFromTarget(target);
      const normalized = dossier ? normalizeDossierEvidence(dossier, place) : null;
      return {
        offset,
        placeId: target.placeId,
        type: normPassBDossierCategory(target.category),
        pageCount: dossier?.pages?.length || 0,
        needsFill: !dossier?.pages?.length || !dossierPersistedFillIsNoOp(dossier, normalized, place),
      };
    }),
    errors: [],
  };
  if (!String(env.XAI_API_KEY || '').trim()) {
    metrics.errors.push({ code: 'missing_xai_api_key', message: 'XAI_API_KEY is not configured in runtime env.' });
  }
  const missingBrave = missingSearchKeys(env);
  if (missingBrave.length) {
    metrics.errors.push({
      code: 'missing_search_keys',
      message: `Missing search configuration: ${missingBrave.join(', ')}`,
    });
  }
  return metrics;
}

export function operatorPassBTimeBudgetMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return OPERATOR_MAX_TIME_BUDGET_MS;
  return Math.min(n, OPERATOR_MAX_TIME_BUDGET_MS);
}

export async function resolvePassBOperatorTargets(body = {}, { authMode = 'worker' } = {}) {
  if (authMode === 'operator') {
    const offset = parsePassBOperatorOffset(body?.offset);
    const all = buildPassBSharedDossierTargets();
    const { slice, batch } = sliceDossierBatch(all, {
      offset,
      limit: OPERATOR_TARGETS_PER_REQUEST,
    });
    return { targets: slice, batch, source: 'passb-shared-77' };
  }
  const normalized = body?.targets?.length ? body.targets : null;
  if (normalized?.length) {
    const { slice, batch } = sliceFromBody(normalized, body);
    return { targets: slice, batch, source: 'body' };
  }
  if (body?.usePassBInventory === true) {
    const all = buildPassBSharedDossierTargets();
    const { slice, batch } = sliceDossierBatch(all, {
      offset: body?.offset,
      limit: body?.limit,
    });
    return { targets: slice, batch, source: 'passb-shared-77' };
  }
  return null;
}

function sliceFromBody(targets, body) {
  return sliceDossierBatch(targets, { offset: body?.offset, limit: body?.limit });
}
