import { buildNycCraigKimDaybydayFixtureRows } from '../../scripts/fixtures/nyc-craig-kim-daybyday-rows.mjs';
import { buildPr336VkSearchPlacesByRowId } from '../../scripts/fixtures/pr336-vk-search-trip-sources.mjs';
import { NYC_GATE_B_TRIP_ID } from './shared-trip-dossier-keys.mjs';

export function normPassBDossierCategory(cat) {
  const c = String(cat || '').toLowerCase();
  if (c === 'activity' || c === 'event' || c === 'attraction') return 'attraction';
  return c;
}

function isPassBSharedDossierCategory(category) {
  return ['hotel', 'restaurant', 'store', 'attraction'].includes(normPassBDossierCategory(category));
}

export function buildNycThingEvidenceDossierTargets({
  rows = buildNycCraigKimDaybydayFixtureRows(),
  placesById = buildPr336VkSearchPlacesByRowId(rows),
  tripId = NYC_GATE_B_TRIP_ID,
} = {}) {
  return rows.map((row) => {
    const place = placesById[row.id];
    if (!place) throw new Error(`missing dossier inventory place: ${row.id}`);
    const category = normPassBDossierCategory(place.category);
    return {
      ...place,
      rowId: row.id,
      placeId: row.id,
      tripId,
      sharedLibrary: isPassBSharedDossierCategory(category),
      destination: place.address || 'New York, NY',
    };
  });
}

export function buildPassBSharedDossierTargets(options = {}) {
  return filterPassBSharedDossierTargets(buildNycThingEvidenceDossierTargets(options));
}

export function buildPassBOperatorDossierTargets(options = {}) {
  const targets = buildNycThingEvidenceDossierTargets(options);
  return [
    ...filterPassBSharedDossierTargets(targets),
    ...targets.filter((target) => !isPassBSharedDossierCategory(target.category)),
  ];
}

function filterPassBSharedDossierTargets(targets = []) {
  return targets.filter((target) => isPassBSharedDossierCategory(target.category));
}

export function sliceDossierBatch(targets = [], { offset = 0, limit } = {}) {
  const start = Math.max(0, Number(offset) || 0);
  const max = Number(limit);
  const end = Number.isFinite(max) && max > 0 ? start + Math.max(1, Math.min(max, 500)) : undefined;
  const slice = targets.slice(start, end);
  const total = targets.length;
  const nextOffset = end != null && end < total ? end : null;
  return { slice, batch: { offset: start, limit: slice.length, total, nextOffset } };
}

export function passBInventoryCounts(targets = buildPassBSharedDossierTargets()) {
  const byType = {};
  for (const target of targets) {
    const t = normPassBDossierCategory(target.category);
    byType[t] = (byType[t] || 0) + 1;
  }
  return { total: targets.length, byType };
}
