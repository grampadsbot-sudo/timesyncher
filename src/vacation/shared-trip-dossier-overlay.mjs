import { applyDossierFields } from './thing-dossier-fields.mjs';
import { loadDossiersByKeys, loadThingEvidenceDossier, thingEvidenceDossierKey } from './thing-evidence-dossier-store.mjs';

function mergeOverride(base = {}, patch = {}) {
  const next = { ...base, ...patch };
  if (Array.isArray(patch.missingFields) || Array.isArray(base.missingFields)) {
    next.missingFields = patch.missingFields || base.missingFields;
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
    const record = applyDossierFields({ ...(current.sourceRecord || {}), ...current }, dossier);
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
  dossierKeyForPlace = (place) => thingEvidenceDossierKey(place),
} = {}) {
  const keyByPlaceId = {};
  for (const place of Array.isArray(shared?.places) ? shared.places : []) {
    const key = dossierKeyForPlace(place);
    if (key) keyByPlaceId[place.id] = key;
  }
  const dossiersByPlaceId = await loadDossiersByKeys(keyByPlaceId, { env, storeImpl });
  return applyStoredDossiersToSharedTripSync(shared, dossiersByPlaceId);
}
