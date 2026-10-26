import { computeDossierFieldCounts } from './thing-evidence-dossier-field-counts.mjs';
import { searchPlaceOutputViolations } from './search-place-output.mjs';
import { searchPlaceFromStoredDossier } from './shared-trip-dossier-overlay.mjs';

const PASSB_PRESENTED_EXCLUDED_VIOLATIONS = new Set([
  'missing_price',
  'missing_rating',
  'missing_sourced_reviews',
  'missing_logoUrl',
]);

export function passbPresentedHardTextViolations(place = {}) {
  const violations = searchPlaceOutputViolations({
    ...place,
    sourceRecord: place.sourceRecord || place,
    title: place.title || place.name,
    category: place.category || place.cat,
  });
  return violations.filter((violation) => !PASSB_PRESENTED_EXCLUDED_VIOLATIONS.has(violation));
}

export function dossierPresent(dossier) {
  return Boolean(
    dossier
    && Array.isArray(dossier.pages)
    && dossier.pages.length > 0
    && Array.isArray(dossier.attempts)
    && dossier.attempts.length > 0,
  );
}

export function dossierPresented(dossier, place) {
  if (!dossierPresent(dossier)) return false;
  const counts = computeDossierFieldCounts(dossier, place);
  const summaryOk = counts.summary?.status === 'ok';
  const descOk = counts.description?.status === 'ok';
  const hydrated = searchPlaceFromStoredDossier(place, dossier);
  const hardTextViolations = passbPresentedHardTextViolations({
    ...hydrated,
    sourceRecord: hydrated,
    title: hydrated.title || place.title || place.name,
    category: place.category || place.cat || hydrated.category,
  });
  return summaryOk && descOk && hardTextViolations.length === 0;
}
