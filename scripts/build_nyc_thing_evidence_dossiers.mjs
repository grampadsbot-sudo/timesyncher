#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { NYC_GATE_B_TRIP_ID } from '../src/vacation/shared-trip-dossier-keys.mjs';
import { missingSearchKeys, xaiPlaceSearchModelId } from '../src/vacation/provider-env.mjs';
import { buildNycCraigKimDaybydayFixtureRows } from './fixtures/nyc-craig-kim-daybyday-rows.mjs';
import { buildPr336VkSearchPlacesByRowId } from './fixtures/pr336-vk-search-trip-sources.mjs';

export function buildNycThingEvidenceDossierTargets({
  rows = buildNycCraigKimDaybydayFixtureRows(),
  placesById = buildPr336VkSearchPlacesByRowId(rows),
  tripId = NYC_GATE_B_TRIP_ID,
} = {}) {
  return rows.map((row) => {
    const place = placesById[row.id];
    if (!place) throw new Error(`missing dossier inventory place: ${row.id}`);
    return {
      ...place,
      rowId: row.id,
      placeId: row.id,
      tripId,
      sharedLibrary: true,
      destination: place.address || 'New York, NY',
    };
  });
}

async function main() {
  if (!process.env.XAI_API_KEY) throw Object.assign(new Error('XAI_API_KEY is not set.'), { code: 'missing_xai_api_key' });
  xaiPlaceSearchModelId();
  const missingKeys = missingSearchKeys();
  if (missingKeys.length) throw Object.assign(new Error(`Missing search configuration: ${missingKeys.join(', ')}`), { code: 'missing_search_keys' });
  const result = await runThingEvidenceDossierStagingTargets(buildNycThingEvidenceDossierTargets());
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error?.code || 'build_failed',
    message: String(error?.message || error),
  }));
  process.exit(1);
});
