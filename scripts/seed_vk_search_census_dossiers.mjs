#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { buildNycThingEvidenceDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import { loadVkSearchCensusResult, vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { saveThingEvidenceDossier, tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { NYC_GATE_B_TRIP_ID } from '../src/vacation/shared-trip-dossier-keys.mjs';

const env = { TIMESYNCHER_THING_EVIDENCE_DOSSIER_DIR: fileURLToPath(new URL('../runtime/thing-evidence-dossiers/', import.meta.url)) };
const summary = { ok: true, botFilled: 0, skippedNoCensus: 0, withRating: 0, withHours: 0, withItineraryNote: 0 };
for (const place of buildNycThingEvidenceDossierTargets()) {
  const result = loadVkSearchCensusResult(place, { env });
  if (!result) { summary.skippedNoCensus += 1; continue; }
  const dossier = vkSearchResultToDossier(result, place);
  if (!dossier.pages.length) continue;
  await saveThingEvidenceDossier(tripPlaceDossierKey(NYC_GATE_B_TRIP_ID, place.id || place.placeId), dossier, { env });
  summary.botFilled += 1;
  if (dossier.pages.some((page) => page.braveRating)) summary.withRating += 1;
  if (dossier.fields.hours) summary.withHours += 1;
  if (dossier.fields.itineraryNote) summary.withItineraryNote += 1;
}
console.log(JSON.stringify(summary));
