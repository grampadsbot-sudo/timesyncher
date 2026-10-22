import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { fetchXaiPlaceRatings } from './xai-grok-place-ratings.mjs';
import { nycDaybydayDossierKey } from './thing-evidence-dossier-store.mjs';

const BASE_ENRICHMENT = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);
const OVERLAY_ENRICHMENT = JSON.parse(
  readFileSync(new URL('../../scripts/fixtures/pr336-gate-b-ccab-overlay.json', import.meta.url), 'utf8'),
);

export async function runThingEvidenceDossierStagingTargets(targets = [], {
  env = process.env,
  fetchImpl,
  gatherImpl,
  buildImpl,
  storeImpl,
} = {}) {
  if (!env.XAI_API_KEY && !buildImpl) {
    return { ok: false, code: 'missing_xai_api_key', results: [] };
  }
  const results = [];
  for (const target of targets) {
    const ccabRecord = {
      ...(BASE_ENRICHMENT[target.ccabKey] || {}),
      ...(OVERLAY_ENRICHMENT[target.ccabKey] || {}),
    };
    const place = {
      id: target.rowId,
      trip_id: 99,
      title: target.title,
      category: target.category,
      address: ccabRecord.address,
      url: ccabRecord.website,
      sourceRecord: ccabRecord,
    };
    const { parsed } = await fetchXaiPlaceRatings(place, {
      destination: target.destination,
      dossierKey: nycDaybydayDossierKey(target.rowId),
      env,
      fetchImpl,
      gatherImpl,
      buildImpl,
      storeImpl,
    });
    results.push({
      rowId: target.rowId,
      dossierKey: nycDaybydayDossierKey(target.rowId),
      pageCount: parsed.evidenceDossier?.pages?.length || 0,
      reviewsRead: parsed.evidenceDossier?.reviewsRead || 0,
    });
  }
  return { ok: true, results };
}
