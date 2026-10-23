import { normalizeDossierEvidence } from './dossier-evidence-hydrate.mjs';
import { applyDossierFields } from './thing-dossier-fields.mjs';
import { sharedTripDossierKeyForPlace } from './shared-trip-dossier-keys.mjs';
import { loadDossiersByKeys, loadThingEvidenceDossier, thingEvidenceDossierKey } from './thing-evidence-dossier-store.mjs';

function mergeOverride(base = {}, patch = {}) {
  const next = { ...base, ...patch };
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
    const placeCtx = { ...place, title: place.name || place.title, sourceRecord: place.sourceRecord || current.sourceRecord };
    const normalized = normalizeDossierEvidence(dossier, placeCtx);
    const record = applyDossierFields({ ...(current.sourceRecord || {}), ...current }, normalized);
    overrides[overrideKey] = mergeOverride(current, record);
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
