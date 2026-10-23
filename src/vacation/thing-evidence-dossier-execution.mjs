import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { fetchXaiPlaceRatings } from './xai-grok-place-ratings.mjs';
import { nycDaybydayDossierKey } from './thing-evidence-dossier-store.mjs';

function tripCenterForTarget(target = {}) {
  if (target.center?.lat != null && target.center?.lng != null) return target.center;
  return null;
}

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
    const center = tripCenterForTarget(target);
    const place = {
      id: target.rowId,
      trip_id: 99,
      title: target.title,
      category: target.category,
      address: ccabRecord.address,
      url: ccabRecord.website,
      lat: ccabRecord.lat ?? ccabRecord.latitude,
      lng: ccabRecord.lng ?? ccabRecord.longitude,
      metadata: center ? { destinationCenter: center } : undefined,
      sourceRecord: ccabRecord,
    };
    const { parsed } = await fetchXaiPlaceRatings(place, {
      destination: target.destination,
      center,
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
