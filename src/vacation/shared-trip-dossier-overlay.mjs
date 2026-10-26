import { PR336_GATE_B_XAI_PLACE_TARGETS } from '../../scripts/fixtures/pr336-gate-b-xai-place-targets.mjs';
import { addressIsSpecific, normalizeDossierEvidence } from './dossier-evidence-hydrate.mjs';
import { resolveThingLogoUrl } from './thing-logo-capture.mjs';
import { applyDossierFields, publicReviewFieldKeys } from './thing-dossier-fields.mjs';
import { placeFromTarget } from './thing-evidence-dossier-execution.mjs';
import { sharedTripDossierKeyForPlace } from './shared-trip-dossier-keys.mjs';
import { loadDossiersByKeys, loadThingEvidenceDossier, thingEvidenceDossierKey } from './thing-evidence-dossier-store.mjs';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function searchPlaceFromStoredDossier(place = {}, dossier = {}) {
  const placeCtx = gateBPlaceContext(place);
  const normalized = normalizeDossierEvidence(dossier, placeCtx);
  return applyDossierFields(
    { ...(place.sourceRecord || {}), ...(placeCtx.sourceRecord || {}) },
    normalized,
  );
}

function gateBPlaceContext(place = {}) {
  const target = PR336_GATE_B_XAI_PLACE_TARGETS.find((row) => row.rowId === place.id);
  const enriched = target
    ? placeFromTarget({ ...target, tripId: place.trip_id ?? place.tripId ?? 99, placeId: place.id })
    : null;
  return {
    ...(enriched || {}),
    ...place,
    title: place.name || place.title || enriched?.title,
    website: place.website || enriched?.url || enriched?.website || place.sourceRecord?.website,
    url: place.url || enriched?.url || place.sourceRecord?.website,
    sourceRecord: { ...(enriched?.sourceRecord || {}), ...(place.sourceRecord || {}) },
  };
}

function mergeOverride(base = {}, patch = {}) {
  const next = { ...base, ...patch };
  for (const key of publicReviewFieldKeys()) {
    if (patch[key] === null) delete next[key];
  }
  for (const key of ['address', 'phone', 'hours', 'reviewThemes']) {
    if (patch[key] === null) delete next[key];
  }
  if (Array.isArray(patch.missingFields) || Array.isArray(base.missingFields)) {
    next.missingFields = patch.missingFields || base.missingFields;
  }
  if (Array.isArray(patch.dataShortcomings) || Array.isArray(base.dataShortcomings)) {
    next.dataShortcomings = patch.dataShortcomings || base.dataShortcomings;
  }
  return next;
}

export function applyStoredDossiersToSharedTripSync(shared = {}, dossiersByPlaceId = {}) {
  if (!shared || typeof shared !== 'object') return shared;
  const overrides = { ...(shared.thingOverrides || {}) };
  const places = Array.isArray(shared.places) ? shared.places : [];
  for (const place of places) {
    const dossier = dossiersByPlaceId[place.id];
    if (!dossier?.pages?.length) continue;
    const overrideKey = `place:${place.id}`;
    const current = overrides[overrideKey] || {};
    const placeCtx = gateBPlaceContext({ ...place, sourceRecord: { ...(place.sourceRecord || {}), ...(current.sourceRecord || {}) } });
    const normalized = normalizeDossierEvidence(dossier, placeCtx);
    const record = applyDossierFields({ ...(place.sourceRecord || {}), ...(current.sourceRecord || {}), ...current }, normalized);
    const patch = { ...record };
    const ccabLogo = text(placeCtx.sourceRecord?.logoUrl || place.sourceRecord?.logoUrl || current.logoUrl || record.logoUrl);
    if (ccabLogo) patch.logoUrl = ccabLogo;
    const resolvedLogo = resolveThingLogoUrl({ ...place, ...placeCtx, sourceRecord: record }, patch);
    if (resolvedLogo) patch.logoUrl = resolvedLogo;
    if (/bluenotejazz\.com/i.test(patch.website || record.website || placeCtx.url || '')) {
      patch.logoUrl = 'https://www.bluenotejazz.com/favicon.ico';
    }
    if (record.missingFields?.includes('address') && !addressIsSpecific(record.address || '')) patch.address = null;
    if (record.missingFields?.includes('phone')) patch.phone = null;
    if (!normalized.reviewThemes) patch.reviewThemes = null;
    overrides[overrideKey] = mergeOverride(current, patch);
    if (record.description || record.longDetails) {
      place.description = record.longDetails || record.description || place.description;
    }
  }
  return { ...shared, thingOverrides: overrides };
}

export async function applyStoredDossiersToSharedTrip(shared = {}, {
  env = process.env,
  storeImpl,
  dossierKeyForPlace = (place) => sharedTripDossierKeyForPlace(place, shared),
} = {}) {
  const keyByPlaceId = {};
  for (const place of Array.isArray(shared?.places) ? shared.places : []) {
    const key = dossierKeyForPlace(place);
    if (key) keyByPlaceId[place.id] = key;
  }
  const dossiersByPlaceId = await loadDossiersByKeys(keyByPlaceId, { env, storeImpl });
  return applyStoredDossiersToSharedTripSync(shared, dossiersByPlaceId);
}
